import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BillingService } from "../../src/services/billing.service.js";
import { BillingRepository } from "../../src/repositories/billing.repository.js";

describe("BillingService Unit Tests", () => {
  let billingRepo: BillingRepository;
  let billingService: BillingService;

  beforeEach(async () => {
    billingRepo = new BillingRepository();
    await billingRepo.reset();
    billingService = new BillingService(billingRepo);
  });

  it("debe listar cuentas y calcular los totales iniciales correctamente", async () => {
    const { cuentas, resumen } = await billingService.getAll();
    assert.ok(cuentas.length >= 3);
    assert.equal(resumen.totalFacturado, 60.5);
    assert.equal(resumen.totalCobrado, 43);
    assert.equal(resumen.saldoPendiente, 17.5);
  });

  it("debe crear una nueva cuenta con saldo inicial igual al total", async () => {
    const nueva = await billingService.create({
      huesped: "Roberto Gómez",
      habitacion: "Habitación 05",
      concepto: "Hospedaje 2 noches",
      total: 80,
    });

    assert.equal(nueva.total, 80);
    assert.equal(nueva.pagado, 0);
    assert.equal(nueva.saldo, 80);
    assert.equal(nueva.estado, "Pendiente");
  });

  it("debe registrar un abono parcial y cambiar el estado a 'Parcial'", async () => {
    // Cuenta 1002 (Carlos Mendoza) total: 12.5, pagado: 0
    const actualizada = await billingService.recordPayment(1002, { monto: 5 });
    assert.equal(actualizada.pagado, 5);
    assert.equal(actualizada.saldo, 7.5);
    assert.equal(actualizada.estado, "Parcial");
  });

  it("debe cambiar estado a 'Pagado' cuando el abono completa el saldo", async () => {
    // Cuenta 1002 tiene saldo 12.5
    const completada = await billingService.recordPayment(1002, { monto: 12.5 });
    assert.equal(completada.pagado, 12.5);
    assert.equal(completada.saldo, 0);
    assert.equal(completada.estado, "Pagado");
  });

  it("debe rechazar un pago que exceda el saldo pendiente", async () => {
    await assert.rejects(
      async () => {
        // Cuenta 1002 tiene saldo 12.5, intentar pagar 20
        await billingService.recordPayment(1002, { monto: 20 });
      },
      (err: any) => {
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
  });

  it("debe actualizar una cuenta de cobro y recalcular su saldo (PUT)", async () => {
    const actualizada = await billingService.update(1001, { total: 60 });
    assert.equal(actualizada.total, 60);
    assert.equal(actualizada.saldo, 20);
    assert.equal(actualizada.estado, "Parcial");
  });

  it("debe rechazar eliminar una cuenta con pagos registrados (Regla Contable)", async () => {
    await assert.rejects(
      async () => await billingService.delete(1001),
      (err: any) => err.statusCode === 400
    );
  });

  it("debe permitir eliminar una cuenta sin pagos registrados (DELETE)", async () => {
    const nueva = await billingService.create({
      huesped: "Temporal",
      habitacion: "Habitación 99",
      concepto: "Cargo erróneo",
      total: 30,
    });
    await billingService.delete(nueva.id);
    await assert.rejects(
      async () => await billingService.getById(nueva.id),
      (err: any) => err.statusCode === 404
    );
  });
});

