import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../../src/app.js";

describe("Stays and services integration", () => {
  let server: http.Server;
  let baseUrl = "";
  let token = "";
  let reservationId = 0;
  let stayId = 0;
  let directConsumptionId = 0;
  let foodOrderId = 0;
  let laundryOrderId = 0;

  before(async () => {
    server = http.createServer(createApp());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as { port: number };
    baseUrl = `http://localhost:${address.port}`;
    const login = await request("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ usuario: "admin", password: "12345" }),
    });
    assert.equal(login.status, 200);
    token = login.body.data.token;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function request(path: string, options: RequestInit = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    return { status: response.status, body: await response.json() };
  }

  it("creates one idempotent stay from a confirmed reservation", async () => {
    const customer = await request("/api/v1/customers", {
      method: "POST",
      body: JSON.stringify({
        nombre: "Estancia",
        apellido: "Integración",
        documento: "TEST-STAY-SERVICE-001",
      }),
    });
    assert.equal(customer.status, 201);

    const availability = await request("/api/v1/rooms/availability?from=2028-03-10&to=2028-03-13");
    assert.equal(availability.status, 200);
    const room = availability.body.data.find((item: { available: boolean }) => item.available);
    assert.ok(room);

    const reservation = await request("/api/v1/reservations", {
      method: "POST",
      body: JSON.stringify({
        customerId: customer.body.data.id,
        roomId: room.id,
        fechaEntrada: "2028-03-10",
        fechaSalida: "2028-03-13",
        totalReserva: 240,
        depositType: "FIXED",
        depositValue: 0,
      }),
    });
    assert.equal(reservation.status, 201);
    reservationId = reservation.body.data.id;

    const confirmed = await request(`/api/v1/reservations/${reservationId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "Confirmada" }),
    });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.data.estado, "Confirmada");

    const firstCheckIn = await request(`/api/v1/reservations/${reservationId}/check-in`, { method: "POST" });
    assert.equal(firstCheckIn.status, 201);
    assert.equal(firstCheckIn.body.data.estado, "Activa");
    stayId = firstCheckIn.body.data.id;

    const repeatedCheckIn = await request(`/api/v1/reservations/${reservationId}/check-in`, { method: "POST" });
    assert.equal(repeatedCheckIn.status, 201);
    assert.equal(repeatedCheckIn.body.data.id, stayId);

    const updatedReservation = await request(`/api/v1/reservations/${reservationId}`);
    assert.equal(updatedReservation.body.data.estado, "CheckIn");

    const activeStays = await request("/api/v1/stays?status=Activa");
    assert.equal(activeStays.status, 200);
    assert.ok(activeStays.body.data.some((stay: { id: number }) => stay.id === stayId));
  });

  it("adds a catalog service and blocks checkout while it is pending", async () => {
    const catalogItem = await request("/api/v1/service-catalog", {
      method: "POST",
      body: JSON.stringify({
        nombre: "Minibar de integración",
        categoria: "Minibar",
        descripcion: "Cargo usado por la prueba integral",
        precio: 3.25,
      }),
    });
    assert.equal(catalogItem.status, 201);

    const consumption = await request(`/api/v1/stays/${stayId}/services`, {
      method: "POST",
      body: JSON.stringify({ serviceId: catalogItem.body.data.id, cantidad: 2 }),
    });
    assert.equal(consumption.status, 201);
    assert.equal(consumption.body.data.subtotal, 6.5);
    assert.equal(consumption.body.data.sourceType, "DIRECT");
    directConsumptionId = consumption.body.data.id;

    const blocked = await request(`/api/v1/stays/${stayId}/check-out`, { method: "POST" });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error.code, "PENDING_SERVICES");
  });

  it("links food and laundry orders to consumptions and synchronizes statuses", async () => {
    const food = await request("/api/v1/food-orders", {
      method: "POST",
      body: JSON.stringify({
        stayId,
        productos: "2 desayunos de integración",
        total: 18.75,
      }),
    });
    assert.equal(food.status, 201);
    assert.equal(food.body.data.stayId, stayId);
    assert.ok(food.body.data.serviceConsumptionId);
    foodOrderId = food.body.data.id;

    const foodPreparing = await request(`/api/v1/food-orders/${foodOrderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "En preparación" }),
    });
    assert.equal(foodPreparing.status, 200);

    const laundry = await request("/api/v1/laundry", {
      method: "POST",
      body: JSON.stringify({
        stayId,
        prendas: [{ tipo: "Camisa", cantidad: 2 }, { tipo: "Pantalón", cantidad: 1 }],
        observaciones: "Prueba de integración",
      }),
    });
    assert.equal(laundry.status, 201);
    assert.equal(laundry.body.data.stayId, stayId);
    assert.equal(laundry.body.data.total, 1.5);
    assert.ok(laundry.body.data.serviceConsumptionId);
    laundryOrderId = laundry.body.data.id;

    const laundryReady = await request(`/api/v1/laundry/${laundryOrderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "Listo" }),
    });
    assert.equal(laundryReady.status, 200);

    const services = await request(`/api/v1/stays/${stayId}/services`);
    assert.equal(services.status, 200);
    const foodConsumption = services.body.data.find(
      (item: { sourceType: string; sourceId: number }) => item.sourceType === "FOOD_ORDER" && item.sourceId === foodOrderId
    );
    const laundryConsumption = services.body.data.find(
      (item: { sourceType: string; sourceId: number }) => item.sourceType === "LAUNDRY_ORDER" && item.sourceId === laundryOrderId
    );
    assert.equal(foodConsumption.estado, "EnProceso");
    assert.equal(foodConsumption.subtotal, 18.75);
    assert.equal(laundryConsumption.estado, "Entregado");
    assert.equal(laundryConsumption.cantidad, 3);

    const deliveredFood = await request(`/api/v1/service-consumptions/${foodConsumption.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "Entregado" }),
    });
    assert.equal(deliveredFood.status, 200);
    const foodAfterSync = await request(`/api/v1/food-orders/${foodOrderId}`);
    assert.equal(foodAfterSync.body.data.estado, "Entregado");

    const consumedLaundry = await request(`/api/v1/service-consumptions/${laundryConsumption.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "Consumido" }),
    });
    assert.equal(consumedLaundry.status, 200);
    const laundryAfterSync = await request(`/api/v1/laundry/${laundryOrderId}`);
    assert.equal(laundryAfterSync.body.data.estado, "Entregado");
  });

  it("finalizes direct consumption and performs idempotent checkout", async () => {
    const consumed = await request(`/api/v1/service-consumptions/${directConsumptionId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "Consumido" }),
    });
    assert.equal(consumed.status, 200);
    assert.equal(consumed.body.data.estado, "Consumido");

    const invalidTransition = await request(`/api/v1/service-consumptions/${directConsumptionId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "Registrado" }),
    });
    assert.equal(invalidTransition.status, 409);
    assert.equal(invalidTransition.body.error.code, "INVALID_STATUS_TRANSITION");

    const checkout = await request(`/api/v1/stays/${stayId}/check-out`, { method: "POST" });
    assert.equal(checkout.status, 200);
    assert.equal(checkout.body.data.estado, "Finalizada");
    assert.ok(checkout.body.data.checkOutAt);

    const repeatedCheckout = await request(`/api/v1/stays/${stayId}/check-out`, { method: "POST" });
    assert.equal(repeatedCheckout.status, 200);
    assert.equal(repeatedCheckout.body.data.checkOutAt, checkout.body.data.checkOutAt);

    const reservation = await request(`/api/v1/reservations/${reservationId}`);
    assert.equal(reservation.body.data.estado, "Finalizada");

    const rejectedConsumption = await request(`/api/v1/stays/${stayId}/services`, {
      method: "POST",
      body: JSON.stringify({ serviceId: 1, cantidad: 1 }),
    });
    assert.equal(rejectedConsumption.status, 409);
    assert.equal(rejectedConsumption.body.error.code, "STAY_NOT_ACTIVE");
  });
});
