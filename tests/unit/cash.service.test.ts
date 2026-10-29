import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { CashService } from "../../src/services/cash.service.js";
import { CashRepository } from "../../src/repositories/cash.repository.js";

describe("CashService Unit Tests", () => {
  let cashRepo: CashRepository;
  let cashService: CashService;

  beforeEach(async () => {
    cashRepo = new CashRepository();
    await cashRepo.reset();
    cashService = new CashService(cashRepo);
  });

  it("debe abrir un nuevo turno de caja con fondo inicial", async () => {
    const sesion = await cashService.openSession({
      fondoInicial: 150,
    }, "usr_admin_001", "Cajero Turno Mañana");

    assert.equal(sesion.responsable, "Cajero Turno Mañana");
    assert.equal(sesion.openedBy, "usr_admin_001");
    assert.equal(sesion.fondoInicial, 150);
    assert.equal(sesion.efectivoEsperado, 150);
    assert.equal(sesion.isClosed, false);
  });

  it("debe impedir abrir un segundo turno si ya hay uno activo", async () => {
    await cashService.openSession({ fondoInicial: 100 }, "usr_admin_001", "Cajero 1");

    await assert.rejects(
      async () => {
        await cashService.openSession({ fondoInicial: 50 }, "usr_admin_001", "Cajero 2");
      },
      (err: any) => {
        assert.equal(err.statusCode, 409);
        assert.equal(err.code, "CASH_SESSION_ALREADY_OPEN");
        return true;
      }
    );
  });

  it("debe registrar ingresos y actualizar el efectivo esperado", async () => {
    await cashService.openSession({ fondoInicial: 100 }, "usr_admin_001", "Cajero 1");

    // Ingreso efectivo $40
    const conIngreso = await cashService.addMovement({
      tipo: "Ingreso",
      concepto: "Hospedaje",
      descripcion: "Cobro habitación 01",
      metodo: "Efectivo",
      monto: 40,
    }, "usr_admin_001");

    assert.equal(conIngreso.ingresosEfectivo, 40);
    assert.equal(conIngreso.efectivoEsperado, 140);
  });

  it("debe impedir una salida en efectivo superior al disponible en caja", async () => {
    await cashService.openSession({ fondoInicial: 50 }, "usr_admin_001", "Cajero 1");

    await assert.rejects(
      async () => {
        await cashService.addMovement({
          tipo: "Salida",
          concepto: "Gasto operativo",
          descripcion: "Gasto excesivo",
          metodo: "Efectivo",
          monto: 100, // Supera los $50
        }, "usr_admin_001");
      },
      (err: any) => {
        assert.equal(err.statusCode, 409);
        return true;
      }
    );
  });

  it("debe cerrar la caja, calcular diferencia y guardar en historial", async () => {
    await cashService.openSession({ fondoInicial: 100 }, "usr_admin_001", "Cajero 1");

    await cashService.addMovement({
      tipo: "Ingreso",
      concepto: "Alimentos",
      descripcion: "Desayuno",
      metodo: "Efectivo",
      monto: 25,
    }, "usr_admin_001");

    // Esperado: 125, se cuentan 127 (sobrante de 2)
    const cerrada = await cashService.closeSession({
      efectivoContado: 127,
      observaciones: "Sobrante de $2 en caja",
    }, "usr_admin_001", "ADMIN");

    assert.equal(cerrada.isClosed, true);
    assert.equal(cerrada.efectivoEsperado, 125);
    assert.equal(cerrada.efectivoContado, 127);
    assert.equal(cerrada.diferencia, 2);

    // La sesión activa actual debe ser null
    const actual = await cashService.getCurrentSession();
    assert.equal(actual, null);

    // Debe estar en el historial
    const historial = await cashService.getHistory();
    assert.ok(historial.length >= 2);
  });

  it("impide registrar movimientos en una caja abierta por otro usuario", async () => {
    await cashService.openSession({ fondoInicial: 100 }, "usr_admin_001", "Cajero responsable");

    await assert.rejects(
      () => cashService.addMovement({
        tipo: "Ingreso",
        concepto: "Otro ingreso",
        descripcion: "Movimiento de otro usuario",
        metodo: "Efectivo",
        monto: 10,
      }, "usr_otro_usuario"),
      (err: any) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, "CASH_SESSION_OWNER_REQUIRED");
        return true;
      }
    );
  });
});
