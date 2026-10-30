import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../../src/app.js";

describe("Concurrent operations integration", () => {
  let server: http.Server;
  let baseUrl = "";
  let token = "";
  let openedCashSession = false;

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
    try {
      if (openedCashSession) {
        const current = await request("/api/v1/cash-register/current");
        if (current.body.data && !current.body.data.isClosed) {
          await request("/api/v1/cash-register/close", {
            method: "POST",
            body: JSON.stringify({
              efectivoContado: current.body.data.efectivoEsperado,
              observaciones: "Cierre de prueba de concurrencia",
            }),
          });
        }
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
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

  async function ensureCashSession(): Promise<void> {
    const current = await request("/api/v1/cash-register/current");
    if (current.body.data && !current.body.data.isClosed) return;
    const opened = await request("/api/v1/cash-register/open", {
      method: "POST",
      body: JSON.stringify({ fondoInicial: 100 }),
    });
    assert.equal(opened.status, 201);
    openedCashSession = true;
  }

  async function createConfirmedReservation(documento: string, from: string, to: string) {
    const customer = await request("/api/v1/customers", {
      method: "POST",
      body: JSON.stringify({ nombre: "Concurrencia", apellido: documento, documento }),
    });
    assert.equal(customer.status, 201);

    const availability = await request(`/api/v1/rooms/availability?from=${from}&to=${to}`);
    const room = availability.body.data.find((item: { available: boolean }) => item.available);
    assert.ok(room);

    const reservation = await request("/api/v1/reservations", {
      method: "POST",
      body: JSON.stringify({
        customerId: customer.body.data.id,
        roomId: room.id,
        fechaEntrada: from,
        fechaSalida: to,
        totalReserva: 100,
        depositType: "FIXED",
        depositValue: 0,
      }),
    });
    assert.equal(reservation.status, 201);
    const reservationId = reservation.body.data.id;

    const confirmed = await request(`/api/v1/reservations/${reservationId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "Confirmada" }),
    });
    assert.equal(confirmed.status, 200);
    return reservationId;
  }

  it("keeps one stay when two check-ins arrive at the same time", async () => {
    const reservationId = await createConfirmedReservation("CONC-CUSTOMER-001", "2032-01-10", "2032-01-12");

    const [first, second] = await Promise.all([
      request(`/api/v1/reservations/${reservationId}/check-in`, { method: "POST" }),
      request(`/api/v1/reservations/${reservationId}/check-in`, { method: "POST" }),
    ]);

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(first.body.data.id, second.body.data.id);

    const stayId = first.body.data.id;
    const activeStays = await request("/api/v1/stays?status=Activa");
    assert.equal(activeStays.body.data.filter((stay: { id: number }) => stay.id === stayId).length, 1);

    const checkOut = await request(`/api/v1/stays/${stayId}/check-out`, { method: "POST" });
    assert.equal(checkOut.status, 200);
  });

  it("returns the same payment when the same idempotency key arrives concurrently", async () => {
    const reservationId = await createConfirmedReservation("CONC-CUSTOMER-002", "2032-02-10", "2032-02-12");
    await ensureCashSession();

    const headers = { "Idempotency-Key": "concurrent-payment-key-001" };
    const options = {
      method: "POST",
      headers,
      body: JSON.stringify({ amount: 10, paymentMethod: "Efectivo" }),
    };
    const [first, second] = await Promise.all([
      request(`/api/v1/reservations/${reservationId}/payments`, options),
      request(`/api/v1/reservations/${reservationId}/payments`, options),
    ]);

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(first.body.data.id, second.body.data.id);

    const payments = await request(`/api/v1/reservations/${reservationId}/payments`);
    assert.equal(payments.body.data.filter((payment: { id: number }) => payment.id === first.body.data.id).length, 1);
  });

  it("creates two independent pre-check-in orders under concurrency", async () => {
    const reservationId = await createConfirmedReservation("CONC-CUSTOMER-003", "2032-03-10", "2032-03-12");

    const [first, second] = await Promise.all([
      request("/api/v1/food-orders", {
        method: "POST",
        body: JSON.stringify({ reservationId, productos: "Pedido concurrente A", total: 5 }),
      }),
      request("/api/v1/food-orders", {
        method: "POST",
        body: JSON.stringify({ reservationId, productos: "Pedido concurrente B", total: 6 }),
      }),
    ]);

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.notEqual(first.body.data.id, second.body.data.id);
    assert.equal(first.body.data.stayId, undefined);
    assert.equal(second.body.data.stayId, undefined);

    const cancelled = await request(`/api/v1/reservations/${reservationId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "Cancelada" }),
    });
    assert.equal(cancelled.status, 200);
  });
});
