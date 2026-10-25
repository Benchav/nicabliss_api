import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../../src/app.js";

describe("Internal invoices integration", () => {
  let server: http.Server;
  let baseUrl = "";
  let token = "";
  let reservationId = 0;
  let stayId = 0;
  let consumptionId = 0;
  let invoiceId = 0;
  let invoicePaymentId = 0;

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
    try {
      const current = await request("/api/v1/cash-register/current");
      if (current.body.data && !current.body.data.isClosed) {
        await request("/api/v1/cash-register/close", {
          method: "POST",
          body: JSON.stringify({
            efectivoContado: current.body.data.efectivoEsperado,
            observaciones: "Cierre de aislamiento de pruebas de facturación",
          }),
        });
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
    if (!current.body.data) {
      const opened = await request("/api/v1/cash-register/open", {
        method: "POST",
        body: JSON.stringify({ responsable: "Administrador", fondoInicial: 100 }),
      });
      assert.equal(opened.status, 201);
    }
  }

  it("prepares a stay with a deposit and a pending service", async () => {
    const customer = await request("/api/v1/customers", {
      method: "POST",
      body: JSON.stringify({ nombre: "Factura", apellido: "Integración", documento: "TEST-INVOICE-001" }),
    });
    assert.equal(customer.status, 201);

    const rooms = await request("/api/v1/rooms/availability?from=2029-04-01&to=2029-04-04");
    const room = rooms.body.data.find((item: { available: boolean }) => item.available);
    assert.ok(room);
    const reservation = await request("/api/v1/reservations", {
      method: "POST",
      body: JSON.stringify({
        customerId: customer.body.data.id,
        roomId: room.id,
        fechaEntrada: "2029-04-01",
        fechaSalida: "2029-04-04",
        totalReserva: 100,
        depositType: "FIXED",
        depositValue: 0,
      }),
    });
    reservationId = reservation.body.data.id;
    await request(`/api/v1/reservations/${reservationId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "Confirmada" }),
    });
    const checkIn = await request(`/api/v1/reservations/${reservationId}/check-in`, { method: "POST" });
    stayId = checkIn.body.data.id;

    await ensureCashSession();
    const deposit = await request(`/api/v1/reservations/${reservationId}/payments`, {
      method: "POST",
      headers: { "Idempotency-Key": "invoice-deposit-001" },
      body: JSON.stringify({ amount: 20, paymentMethod: "Transferencia", reference: "TRX-DEPOSIT-001" }),
    });
    assert.equal(deposit.status, 201);

    const service = await request(`/api/v1/stays/${stayId}/services`, {
      method: "POST",
      body: JSON.stringify({ serviceId: 1, cantidad: 1, precioUnitario: 10, observaciones: "Cena de prueba" }),
    });
    assert.equal(service.status, 201);
    consumptionId = service.body.data.id;
  });

  it("refreshes the draft and refuses to issue while services are pending", async () => {
    const draft = await request("/api/v1/invoices", {
      method: "POST",
      body: JSON.stringify({ stayId }),
    });
    assert.equal(draft.status, 201);
    assert.equal(draft.body.data.status, "Borrador");
    assert.equal(draft.body.data.total, 100);
    assert.equal(draft.body.data.tax, 0);
    invoiceId = draft.body.data.id;

    const duplicateDraft = await request("/api/v1/invoices", {
      method: "POST",
      body: JSON.stringify({ stayId }),
    });
    assert.equal(duplicateDraft.body.data.id, invoiceId);

    const blocked = await request(`/api/v1/invoices/${invoiceId}/issue`, { method: "POST" });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error.code, "PENDING_SERVICES");

    const consumed = await request(`/api/v1/service-consumptions/${consumptionId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "Consumido" }),
    });
    assert.equal(consumed.status, 200);

    const issued = await request(`/api/v1/invoices/${invoiceId}/issue`, { method: "POST" });
    assert.equal(issued.status, 200);
    assert.equal(issued.body.data.status, "Parcial");
    assert.equal(issued.body.data.total, 110);
    assert.equal(issued.body.data.paidAmount, 20);
    assert.equal(issued.body.data.balance, 90);
    assert.equal(issued.body.data.items.length, 2);
  });

  it("applies invoice payments atomically and returns a real PDF", async () => {
    const payment = await request(`/api/v1/invoices/${invoiceId}/payments`, {
      method: "POST",
      headers: { "Idempotency-Key": "invoice-balance-001" },
      body: JSON.stringify({ amount: 90, paymentMethod: "Tarjeta", reference: "CARD-001" }),
    });
    assert.equal(payment.status, 201);
    assert.equal(payment.body.data.invoiceId, invoiceId);
    invoicePaymentId = payment.body.data.id;

    const paid = await request(`/api/v1/invoices/${invoiceId}`);
    assert.equal(paid.body.data.status, "Pagada");
    assert.equal(paid.body.data.paidAmount, 110);
    assert.equal(paid.body.data.balance, 0);

    const pdfResponse = await fetch(`${baseUrl}/api/v1/invoices/${invoiceId}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(pdfResponse.status, 200);
    assert.equal(pdfResponse.headers.get("content-type"), "application/pdf");
    const pdf = Buffer.from(await pdfResponse.arrayBuffer());
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
    assert.ok(pdf.length > 1000);
  });

  it("reverses a payment, updates the invoice, and voids without deleting money", async () => {
    const reversed = await request(`/api/v1/payments/${invoicePaymentId}/void`, {
      method: "POST",
      body: JSON.stringify({ reason: "Reversión de prueba de factura" }),
    });
    assert.equal(reversed.status, 200);
    assert.equal(reversed.body.data.kind, "REVERSAL");
    assert.equal(reversed.body.data.invoiceId, invoiceId);

    const partial = await request(`/api/v1/invoices/${invoiceId}`);
    assert.equal(partial.body.data.status, "Parcial");
    assert.equal(partial.body.data.paidAmount, 20);
    assert.equal(partial.body.data.balance, 90);

    const voided = await request(`/api/v1/invoices/${invoiceId}/void`, {
      method: "POST",
      body: JSON.stringify({ reason: "Corrección administrativa de prueba" }),
    });
    assert.equal(voided.status, 200);
    assert.equal(voided.body.data.status, "Anulada");
    assert.equal(voided.body.data.paidAmount, 20);

    const payments = await request(`/api/v1/reservations/${reservationId}/payments`);
    assert.ok(payments.body.data.some((item: { id: number }) => item.id === invoicePaymentId));

    const replacement = await request("/api/v1/invoices", {
      method: "POST",
      body: JSON.stringify({ stayId }),
    });
    assert.equal(replacement.status, 201);
    assert.notEqual(replacement.body.data.id, invoiceId);
    assert.equal(replacement.body.data.status, "Borrador");
  });
});
