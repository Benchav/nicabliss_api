import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { LaundryService } from "../../src/services/laundry.service.js";
import { LaundryRepository } from "../../src/repositories/laundry.repository.js";

describe("LaundryService Unit Tests", () => {
  let laundryRepo: LaundryRepository;
  let laundryService: LaundryService;

  beforeEach(() => {
    laundryRepo = new LaundryRepository();
    laundryService = new LaundryService(laundryRepo);
  });

  it("debe calcular automáticamente el total de prendas y el costo a $0.50 por prenda", async () => {
    const solicitud = await laundryService.create({
      huesped: "Roberto Gómez",
      habitacion: "Habitación 05",
      prendas: [
        { tipo: "Camisa", cantidad: 4 },
        { tipo: "Pantalón", cantidad: 2 },
        { tipo: "Toalla", cantidad: 4 },
      ],
      observaciones: "Planchado suave",
    });

    // 4 + 2 + 4 = 10 prendas * $0.50 = $5.00
    assert.equal(solicitud.totalPrendas, 10);
    assert.equal(solicitud.total, 5.0);
    assert.equal(solicitud.estado, "Pendiente");
  });

  it("debe actualizar el estado de lavado", async () => {
    const updated = await laundryService.updateStatus(1001, { estado: "Entregado" });
    assert.equal(updated.estado, "Entregado");
  });

  it("debe rechazar solicitudes sin prendas", async () => {
    await assert.rejects(
      async () => {
        await laundryService.create({
          huesped: "Sin Prendas",
          habitacion: "Habitación 01",
          prendas: [],
        });
      },
      (err: any) => {
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
  });
});
