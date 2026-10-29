import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../../src/app.js";

describe("Administrative reports integration", () => {
  let server: http.Server;
  let baseUrl = "";
  let token = "";
  let invoiceId = 0;
  const today = new Date().toISOString().slice(0, 10);
  const year = Number(today.slice(0, 4));
  let baselineDaily: any;
  let baselineMonthly: any;

  before(async () => {
    server = http.createServer(createApp());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as { port: number };
    baseUrl = `http://localhost:${address.port}`;
    const login = await request("/api/v1/auth/login", {
      method: "POST", body: JSON.stringify({ usuario: "admin", password: "12345" }),
    });
    token = login.body.data.token;
    baselineDaily = (await request(`/api/v1/reports/dashboard?date=${today}`)).body.data;
    baselineMonthly = (await request(`/api/v1/reports/revenue/monthly?year=${year}`)).body.data;
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

  it("creates a fully traceable sale for report verification", async () => {
    const opened = await request("/api/v1/cash-register/open", {
      method: "POST", body: JSON.stringify({ fondoInicial: 100 }),
    });
    assert.equal(opened.status, 201);
    const customer = await request("/api/v1/customers", {
      method: "POST", body: JSON.stringify({ nombre: "Reporte", apellido: "Integración", documento: "TEST-REPORT-001" }),
    });
    const rooms = await request("/api/v1/rooms/availability?from=2031-08-01&to=2031-08-03");
    const activeStays = await request("/api/v1/stays?status=Activa");
    const occupiedRoomIds = new Set(activeStays.body.data.map((stay: { roomId: number }) => stay.roomId));
    const room = rooms.body.data.find((item: { available: boolean; id: number }) => item.available && !occupiedRoomIds.has(item.id));
    assert.ok(room);
    const reservation = await request("/api/v1/reservations", {
      method: "POST",
      body: JSON.stringify({ customerId: customer.body.data.id, roomId: room.id,
        fechaEntrada: "2031-08-01", fechaSalida: "2031-08-03", totalReserva: 80,
        depositType: "FIXED", depositValue: 0 }),
    });
    await request(`/api/v1/reservations/${reservation.body.data.id}/status`, {
      method: "PATCH", body: JSON.stringify({ estado: "Confirmada" }),
    });
    const checkIn = await request(`/api/v1/reservations/${reservation.body.data.id}/check-in`, { method: "POST" });
    assert.equal(checkIn.status, 201);
    const service = await request(`/api/v1/stays/${checkIn.body.data.id}/services`, {
      method: "POST", body: JSON.stringify({ serviceId: 1, cantidad: 1, precioUnitario: 10, observaciones: "Reporte" }),
    });
    await request(`/api/v1/service-consumptions/${service.body.data.id}/status`, {
      method: "PATCH", body: JSON.stringify({ estado: "Consumido" }),
    });
    const draft = await request("/api/v1/invoices", {
      method: "POST", body: JSON.stringify({ stayId: checkIn.body.data.id }),
    });
    invoiceId = draft.body.data.id;
    const issued = await request(`/api/v1/invoices/${invoiceId}/issue`, { method: "POST" });
    assert.equal(issued.body.data.total, 90);
    const payment = await request(`/api/v1/invoices/${invoiceId}/payments`, {
      method: "POST",
      headers: { "Idempotency-Key": "reports-transfer-001" },
      body: JSON.stringify({ amount: 40, paymentMethod: "Transferencia", reference: "REPORT-TRX-001" }),
    });
    assert.equal(payment.status, 201);
  });

  it("keeps billed, collected, pending, methods, categories, and services distinct", async () => {
    const daily = await request(`/api/v1/reports/dashboard?date=${today}`);
    assert.equal(daily.status, 200);
    assert.equal(daily.body.data.income.invoiced, baselineDaily.income.invoiced + 90);
    assert.equal(daily.body.data.income.collected, baselineDaily.income.collected + 40);
    assert.equal(daily.body.data.income.pending, baselineDaily.income.pending + 50);
    assert.equal(daily.body.data.cash.open, true);
    const transfer = daily.body.data.byMethod.find((row: { method: string }) => row.method === "Transferencia");
    const baselineTransfer = baselineDaily.byMethod.find((row: { method: string }) => row.method === "Transferencia");
    assert.equal(transfer.amount, baselineTransfer.amount + 40);

    const filteredDaily = await request(`/api/v1/reports/dashboard?date=${today}&method=Transferencia`);
    assert.equal(filteredDaily.status, 200);
    const filteredTransfer = filteredDaily.body.data.byMethod.find((row: { method: string }) => row.method === "Transferencia");
    assert.equal(filteredDaily.body.data.income.collected, filteredTransfer.amount);
    assert.ok(filteredDaily.body.data.byMethod
      .filter((row: { method: string }) => row.method !== "Transferencia")
      .every((row: { amount: number; operationCount: number }) => row.amount === 0 && row.operationCount === 0));

    const services = await request(`/api/v1/reports/services?from=${today}&to=${today}&category=${encodeURIComponent("Alimentos")}`);
    assert.equal(services.status, 200);
    assert.ok(services.body.data.items.some((item: { serviceName: string; revenue: number }) => item.serviceName === "Pedido de alimentos" && item.revenue >= 10));

    const categories = await request(`/api/v1/reports/revenue/categories?from=${today}&to=${today}`);
    assert.equal(categories.status, 200);
    assert.ok(categories.body.data.items.some((item: { category: string; invoiced: number }) => item.category === "Hospedaje" && item.invoiced >= 80));
    assert.ok(categories.body.data.items.some((item: { category: string; invoiced: number }) => item.category === "Alimentos" && item.invoiced >= 10));

    const receivables = await request("/api/v1/reports/receivables");
    assert.equal(receivables.status, 200);
    const invoice = receivables.body.data.items.find((item: { invoiceId: number }) => item.invoiceId === invoiceId);
    assert.equal(invoice.balance, 50);
  });

  it("reports monthly totals, validates dates, and closes the reconciled test cash session", async () => {
    const monthly = await request(`/api/v1/reports/revenue/monthly?year=${year}`);
    assert.equal(monthly.status, 200);
    assert.equal(monthly.body.data.totals.invoiced, baselineMonthly.totals.invoiced + 90);
    assert.equal(monthly.body.data.totals.collected, baselineMonthly.totals.collected + 40);

    const invalid = await request("/api/v1/reports/services?from=2026-13-01&to=2026-01-01");
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error.code, "VALIDATION_ERROR");

    const closed = await request("/api/v1/cash-register/close", {
      method: "POST", body: JSON.stringify({ efectivoContado: 100, observaciones: "Cierre de prueba de reportes" }),
    });
    assert.equal(closed.status, 200);
  });
});
