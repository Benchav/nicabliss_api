import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FoodOrderService } from "../../src/services/food-order.service.js";
import { FoodOrderRepository } from "../../src/repositories/food-order.repository.js";

describe("FoodOrderService Unit Tests", () => {
  let orderRepo: FoodOrderRepository;
  let orderService: FoodOrderService;

  beforeEach(() => {
    orderRepo = new FoodOrderRepository();
    orderService = new FoodOrderService(orderRepo);
  });

  it("debe listar pedidos precargados", async () => {
    const list = await orderService.getAll();
    assert.ok(list.length >= 3);
    assert.equal(list[0].orderCode, "#PED-024");
  });

  it("debe crear una nueva orden con código generado y estado 'Pendiente'", async () => {
    const orden = await orderService.create({
      huesped: "James Wilson",
      habitacion: "Habitación 03",
      productos: "1 hamburguesa + 1 cerveza Toña",
      total: 10,
    });

    assert.ok(orden.orderCode.startsWith("#PED-"));
    assert.equal(orden.estado, "Pendiente");
    assert.equal(orden.total, 10);
  });

  it("debe avanzar el estado del pedido a 'En preparación' y 'Entregado'", async () => {
    const prep = await orderService.updateStatus(101, { estado: "En preparación" });
    assert.equal(prep.estado, "En preparación");

    const entregado = await orderService.updateStatus(101, { estado: "Entregado" });
    assert.equal(entregado.estado, "Entregado");
  });

  it("debe actualizar los datos de una comanda de alimentos (PUT)", async () => {
    const updated = await orderService.update(101, {
      productos: "2 desayunos americanos + 1 jugo de naranja",
      total: 15,
    });
    assert.equal(updated.productos, "2 desayunos americanos + 1 jugo de naranja");
    assert.equal(updated.total, 15);
  });

  it("debe eliminar una comanda de alimentos existente (DELETE)", async () => {
    const orden = await orderService.create({
      huesped: "Para Cancelar",
      habitacion: "Habitación 05",
      productos: "1 café",
      total: 2,
    });
    await orderService.delete(orden.id);
    await assert.rejects(
      async () => await orderService.getById(orden.id),
      (err: any) => err.statusCode === 404
    );
  });
});

