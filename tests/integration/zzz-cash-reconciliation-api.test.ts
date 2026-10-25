import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../../src/app.js";
import { dbClient } from "../../src/db/client.js";

describe("Cash reconciliation integration", () => {
  let server: http.Server;
  let baseUrl = "";
  let token = "";
  let sessionId = 0;
  let cashPaymentId = 0;

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

  it("creates automatic movements for payments and reversals without duplicating manual income", async () => {
    const opened = await request("/api/v1/cash-register/open", {
      method: "POST",
      body: JSON.stringify({ responsable: "Conciliación API", fondoInicial: 100 }),
    });
    assert.equal(opened.status, 201);
    sessionId = opened.body.data.id;

    const customer = await request("/api/v1/customers", {
      method: "POST",
      body: JSON.stringify({ nombre: "Caja", apellido: "Conciliación", documento: "TEST-CASH-REC-001" }),
    });
    assert.equal(customer.status, 201);
    const availability = await request("/api/v1/rooms/availability?from=2030-06-01&to=2030-06-03");
    const room = availability.body.data.find((item: { available: boolean }) => item.available);
    assert.ok(room);
    const reservation = await request("/api/v1/reservations", {
      method: "POST",
      body: JSON.stringify({
        customerId: customer.body.data.id,
        roomId: room.id,
        fechaEntrada: "2030-06-01",
        fechaSalida: "2030-06-03",
        totalReserva: 100,
        depositType: "FIXED",
        depositValue: 0,
      }),
    });
    assert.equal(reservation.status, 201);

    const cashPayment = await request(`/api/v1/reservations/${reservation.body.data.id}/payments`, {
      method: "POST",
      headers: { "Idempotency-Key": "cash-reconciliation-cash-001" },
      body: JSON.stringify({ amount: 30, paymentMethod: "Efectivo" }),
    });
    assert.equal(cashPayment.status, 201);
    cashPaymentId = cashPayment.body.data.id;

    const cardPayment = await request(`/api/v1/reservations/${reservation.body.data.id}/payments`, {
      method: "POST",
      headers: { "Idempotency-Key": "cash-reconciliation-card-001" },
      body: JSON.stringify({ amount: 20, paymentMethod: "Tarjeta", reference: "CARD-REC-001" }),
    });
    assert.equal(cardPayment.status, 201);

    const reversal = await request(`/api/v1/payments/${cardPayment.body.data.id}/void`, {
      method: "POST",
      body: JSON.stringify({ reason: "Prueba de conciliación" }),
    });
    assert.equal(reversal.status, 200);
    assert.equal(reversal.body.data.kind, "REVERSAL");

    const manual = await request("/api/v1/cash-register/movements", {
      method: "POST",
      body: JSON.stringify({
        tipo: "Ingreso",
        concepto: "Otro ingreso",
        descripcion: "Ingreso manual de prueba",
        metodo: "Efectivo",
        monto: 5,
      }),
    });
    assert.equal(manual.status, 200);
  });

  it("reconciles by session, payment method, and user", async () => {
    const reconciliation = await request(`/api/v1/reports/cash/reconciliation?sessionId=${sessionId}`);
    assert.equal(reconciliation.status, 200);
    assert.equal(reconciliation.body.data.balanced, true);
    assert.equal(reconciliation.body.data.totals.paymentCount, 3);
    assert.equal(reconciliation.body.data.totals.payments, 50);
    assert.equal(reconciliation.body.data.totals.reversals, 20);
    assert.equal(reconciliation.body.data.totals.netPayments, 30);
    assert.equal(reconciliation.body.data.totals.netMovements, 30);
    assert.equal(reconciliation.body.data.totals.manualIncome, 5);
    assert.equal(reconciliation.body.data.mismatchCount, 0);

    const cardOnly = await request(
      `/api/v1/reports/cash/reconciliation?sessionId=${sessionId}&method=${encodeURIComponent("Tarjeta")}`
    );
    assert.equal(cardOnly.body.data.balanced, true);
    assert.equal(cardOnly.body.data.totals.paymentCount, 2);
    assert.equal(cardOnly.body.data.totals.netPayments, 0);

    const byMethod = await request(`/api/v1/reports/cash/by-method?sessionId=${sessionId}`);
    assert.equal(byMethod.status, 200);
    const cash = byMethod.body.data.rows.find((row: { method: string }) => row.method === "Efectivo");
    const card = byMethod.body.data.rows.find((row: { method: string }) => row.method === "Tarjeta");
    assert.equal(cash.netPayments, 30);
    assert.equal(card.netPayments, 0);

    const byUser = await request(`/api/v1/reports/cash/by-user?sessionId=${sessionId}`);
    assert.equal(byUser.status, 200);
    assert.equal(byUser.body.data.rows.length, 1);
    assert.equal(byUser.body.data.rows[0].userId, "usr_admin_001");
    assert.ok(byUser.body.data.rows[0].userName);
    assert.equal(byUser.body.data.rows[0].netPayments, 30);
  });

  it("detects a mismatch, blocks closing, and allows closing after correction", async () => {
    await dbClient.execute({
      sql: "UPDATE cash_movements SET monto = monto + 1 WHERE payment_id = ?;",
      args: [cashPaymentId],
    });

    const mismatch = await request(`/api/v1/reports/cash/reconciliation?sessionId=${sessionId}`);
    assert.equal(mismatch.status, 200);
    assert.equal(mismatch.body.data.balanced, false);
    assert.equal(mismatch.body.data.totals.difference, -1);
    assert.equal(mismatch.body.data.mismatchCount, 1);
    assert.equal(mismatch.body.data.sessionIntegrity.balanced, false);

    const blockedClose = await request("/api/v1/cash-register/close", {
      method: "POST",
      body: JSON.stringify({ efectivoContado: 135, observaciones: "Debe bloquearse" }),
    });
    assert.equal(blockedClose.status, 409);
    assert.equal(blockedClose.body.error.code, "CASH_RECONCILIATION_MISMATCH");

    await dbClient.execute({
      sql: "UPDATE cash_movements SET monto = monto - 1 WHERE payment_id = ?;",
      args: [cashPaymentId],
    });
    const restored = await request(`/api/v1/reports/cash/reconciliation?sessionId=${sessionId}`);
    assert.equal(restored.body.data.balanced, true);

    const closed = await request("/api/v1/cash-register/close", {
      method: "POST",
      body: JSON.stringify({ efectivoContado: 135, observaciones: "Caja conciliada" }),
    });
    assert.equal(closed.status, 200);
    assert.equal(closed.body.data.isClosed, true);
    assert.equal(closed.body.data.diferencia, 0);
  });
});
