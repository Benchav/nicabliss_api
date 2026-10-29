import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../../src/app.js";

describe("Customers, reservations and payments integration", () => {
  let server: http.Server;
  let baseUrl = "";
  let token = "";
  let reservationId = 0;
  let paymentId = 0;

  before(async () => {
    server = http.createServer(createApp());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as { port: number };
    baseUrl = `http://localhost:${address.port}`;
    const login = await request("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ usuario: "admin", password: "12345" }),
    });
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

  it("creates a customer and prevents duplicate documents", async () => {
    const payload = {
      nombre: "Cliente",
      apellido: "Integración",
      documento: "TEST-PMS-001",
      telefono: "88880000",
    };
    const created = await request("/api/v1/customers", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.documento, payload.documento);

    const duplicate = await request("/api/v1/customers", {
      method: "POST",
      body: JSON.stringify({ ...payload, documento: "test pms 001" }),
    });
    assert.equal(duplicate.status, 409);

    const availability = await request("/api/v1/rooms/availability?from=2027-01-10&to=2027-01-12");
    const room = availability.body.data.find((item: { available: boolean }) => item.available);
    assert.ok(room);

    const reservation = await request("/api/v1/reservations", {
      method: "POST",
      body: JSON.stringify({
        customerId: created.body.data.id,
        roomId: room.id,
        fechaEntrada: "2027-01-10",
        fechaSalida: "2027-01-12",
        totalReserva: 100,
        depositType: "PERCENTAGE",
        depositValue: 50,
      }),
    });
    assert.equal(reservation.status, 201);
    assert.equal(reservation.body.data.depositoRequerido, 50);
    reservationId = reservation.body.data.id;

    const overlap = await request("/api/v1/reservations", {
      method: "POST",
      body: JSON.stringify({
        customerId: created.body.data.id,
        roomId: room.id,
        fechaEntrada: "2027-01-11",
        fechaSalida: "2027-01-13",
        totalReserva: 80,
      }),
    });
    assert.equal(overlap.status, 409);
    assert.equal(overlap.body.error.code, "ROOM_UNAVAILABLE");
  });

  it("requires an open cash session and records an idempotent deposit", async () => {
    const withoutCash = await request(`/api/v1/reservations/${reservationId}/payments`, {
      method: "POST",
      headers: { "Idempotency-Key": "phase1-payment-001" },
      body: JSON.stringify({ amount: 50, paymentMethod: "Efectivo" }),
    });
    assert.equal(withoutCash.status, 409);
    assert.equal(withoutCash.body.error.code, "CASH_SESSION_REQUIRED");

    const open = await request("/api/v1/cash-register/open", {
      method: "POST",
      body: JSON.stringify({ fondoInicial: 100 }),
    });
    assert.equal(open.status, 201);

    const payment = await request(`/api/v1/reservations/${reservationId}/payments`, {
      method: "POST",
      headers: { "Idempotency-Key": "phase1-payment-001" },
      body: JSON.stringify({ amount: 50, paymentMethod: "Efectivo" }),
    });
    assert.equal(payment.status, 201);
    paymentId = payment.body.data.id;

    const repeated = await request(`/api/v1/reservations/${reservationId}/payments`, {
      method: "POST",
      headers: { "Idempotency-Key": "phase1-payment-001" },
      body: JSON.stringify({ amount: 50, paymentMethod: "Efectivo" }),
    });
    assert.equal(repeated.body.data.id, paymentId);

    const reservation = await request(`/api/v1/reservations/${reservationId}`);
    assert.equal(reservation.body.data.abonado, 50);
    assert.equal(reservation.body.data.saldo, 50);
    assert.equal(reservation.body.data.estado, "Confirmada");
  });

  it("rejects overpayment and voids through a reversal", async () => {
    const overpayment = await request(`/api/v1/reservations/${reservationId}/payments`, {
      method: "POST",
      headers: { "Idempotency-Key": "phase1-payment-over" },
      body: JSON.stringify({ amount: 60, paymentMethod: "Efectivo" }),
    });
    assert.equal(overpayment.status, 400);
    assert.equal(overpayment.body.error.code, "PAYMENT_EXCEEDS_BALANCE");

    const reversed = await request(`/api/v1/payments/${paymentId}/void`, {
      method: "POST",
      body: JSON.stringify({ reason: "Prueba de reversión contable" }),
    });
    assert.equal(reversed.status, 200);
    assert.equal(reversed.body.data.kind, "REVERSAL");

    const history = await request(`/api/v1/reservations/${reservationId}/payments`);
    assert.equal(history.body.data.length, 2);
    const reservation = await request(`/api/v1/reservations/${reservationId}`);
    assert.equal(reservation.body.data.abonado, 0);
    assert.equal(reservation.body.data.estado, "Pendiente");
  });
});
