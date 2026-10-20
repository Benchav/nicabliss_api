import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { GuestService } from "../../src/services/guest.service.js";
import { GuestRepository } from "../../src/repositories/guest.repository.js";

describe("GuestService Unit Tests", () => {
  let guestRepo: GuestRepository;
  let guestService: GuestService;

  beforeEach(async () => {
    guestRepo = new GuestRepository();
    await guestRepo.reset();
    guestService = new GuestService(guestRepo);
  });

  it("debe listar todos los huéspedes precargados", async () => {
    const list = await guestService.getAll();
    assert.ok(list.length >= 4);
    assert.equal(list[0].nombre, "María González");
  });

  it("debe filtrar huéspedes por nombre o habitación", async () => {
    const res = await guestService.getAll("Habitación 04");
    assert.equal(res.length, 1);
    assert.equal(res[0].nombre, "Carlos Mendoza");
  });

  it("debe crear un nuevo huésped con datos válidos", async () => {
    const nuevo = await guestService.create({
      nombre: "Alejandro Pérez",
      documento: "001-090999-0003C",
      habitacion: "Habitación 08",
      entrada: "2026-10-25",
      salida: "2026-10-28",
      estado: "Activo",
    });

    assert.ok(nuevo.id);
    assert.equal(nuevo.nombre, "Alejandro Pérez");

    const consultado = await guestService.getById(nuevo.id);
    assert.equal(consultado.habitacion, "Habitación 08");
  });

  it("debe validar que la fecha de salida no sea anterior a la de entrada", async () => {
    await assert.rejects(
      async () => {
        await guestService.create({
          nombre: "Invalido Fechas",
          documento: "P999999",
          habitacion: "Habitación 02",
          entrada: "2026-10-25",
          salida: "2026-10-20", // Fecha anterior
        });
      },
      (err: any) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, "VALIDATION_ERROR");
        return true;
      }
    );
  });

  it("debe actualizar el estado de estancia de un huésped", async () => {
    const updated = await guestService.updateStatus(1, { estado: "Finalizado" });
    assert.equal(updated.estado, "Finalizado");
  });

  it("debe actualizar los datos de un huésped completamente (PUT)", async () => {
    const updated = await guestService.update(1, {
      nombre: "María González Actualizada",
      habitacion: "Habitación 09",
    });
    assert.equal(updated.nombre, "María González Actualizada");
    assert.equal(updated.habitacion, "Habitación 09");
  });

  it("debe eliminar un huésped existente (DELETE)", async () => {
    const nuevo = await guestService.create({
      nombre: "Huésped Para Borrar",
      documento: "P-DEL-01",
      habitacion: "Habitación 99",
      entrada: "2026-10-20",
      salida: "2026-10-22",
    });
    await guestService.delete(nuevo.id);
    await assert.rejects(
      async () => await guestService.getById(nuevo.id),
      (err: any) => err.statusCode === 404
    );
  });
});

