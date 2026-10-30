import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../../src/app.js";

describe("Reservation food orders and customer stay history", () => {
  let server: http.Server;
  let baseUrl = "";
  let token = "";
  let cashSessionId = 0;
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
              observaciones: "Cierre de prueba de historial de estancias",
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
    if (current.body.data && !current.body.data.isClosed) {
      cashSessionId = current.body.data.id;
      return;
    }
    const opened = await request("/api/v1/cash-register/open", {
      method: "POST",
      body: JSON.stringify({ fondoInicial: 100 }),
    });
    assert.equal(opened.status, 201);
    cashSessionId = opened.body.data.id;
    openedCashSession = true;
  }

  it("keeps a pre-check-in order on the reservation, links it once, and shows the stay in customer history", async () => {
    const customer = await request("/api/v1/customers", {
      method: "POST",
      body: JSON.stringify({
        nombre: "Historial",
        apellido: "Integración",
        documento: "TEST-CUSTOMER-HISTORY-001",
      }),
    });
    assert.equal(customer.status, 201);
    const customerId = customer.body.data.id;

    const availability = await request("/api/v1/rooms/availability?from=2031-01-10&to=2031-01-13");
    const room = availability.body.data.find((item: { available: boolean }) => item.available);
    assert.ok(room);

    const reservation = await request("/api/v1/reservations", {
      method: "POST",
      body: JSON.stringify({
        customerId,
        roomId: room.id,
        fechaEntrada: "2031-01-10",
        fechaSalida: "2031-01-13",
        totalReserva: 200,
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

    const preorder = await request("/api/v1/food-orders", {
      method: "POST",
      body: JSON.stringify({
        reservationId,
        productos: "2 desayunos y 1 café",
        total: 25,
      }),
    });
    assert.equal(preorder.status, 201);
    assert.equal(preorder.body.data.reservationId, reservationId);
    assert.equal(preorder.body.data.stayId, undefined);
    assert.equal(preorder.body.data.serviceConsumptionId, undefined);
    assert.equal(preorder.body.data.estado, "Pendiente");
    const foodOrderId = preorder.body.data.id;

    const beforeStay = await request(`/api/v1/customers/${customerId}/history`);
    assert.equal(beforeStay.status, 200);
    assert.equal(beforeStay.body.data.stays.length, 0);
    assert.equal(beforeStay.body.data.activeStay, null);
    assert.equal(beforeStay.body.data.summary.outstandingBalance, 0);

    const checkIn = await request(`/api/v1/reservations/${reservationId}/check-in`, { method: "POST" });
    assert.equal(checkIn.status, 201);
    const stayId = checkIn.body.data.id;

    const linkedOrder = await request(`/api/v1/food-orders/${foodOrderId}`);
    assert.equal(linkedOrder.body.data.stayId, stayId);
    assert.equal(linkedOrder.body.data.reservationId, reservationId);
    assert.ok(linkedOrder.body.data.serviceConsumptionId);

    const initialAccount = await request(`/api/v1/stays/${stayId}/account`);
    assert.equal(initialAccount.status, 200);
    assert.equal(initialAccount.body.data.lodging, 200);
    assert.equal(initialAccount.body.data.services, 0);
    assert.equal(initialAccount.body.data.total, 200);
    assert.equal(initialAccount.body.data.pendingServiceCount, 1);

    const onTheWay = await request(`/api/v1/food-orders/${foodOrderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "En camino" }),
    });
    assert.equal(onTheWay.status, 200);
    const servicesOnTheWay = await request(`/api/v1/stays/${stayId}/services`);
    const onTheWayConsumption = servicesOnTheWay.body.data.find(
      (item: { sourceType: string; sourceId: number }) => item.sourceType === "FOOD_ORDER" && item.sourceId === foodOrderId
    );
    assert.equal(onTheWayConsumption.estado, "EnProceso");

    const delivered = await request(`/api/v1/food-orders/${foodOrderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "Entregado" }),
    });
    assert.equal(delivered.status, 200);

    const deliveredAccount = await request(`/api/v1/stays/${stayId}/account`);
    assert.equal(deliveredAccount.body.data.services, 25);
    assert.equal(deliveredAccount.body.data.total, 225);
    assert.equal(deliveredAccount.body.data.pendingServiceCount, 0);

    await ensureCashSession();
    const payment = await request(`/api/v1/reservations/${reservationId}/payments`, {
      method: "POST",
      headers: { "Idempotency-Key": `history-payment-${cashSessionId}` },
      body: JSON.stringify({ amount: 50, paymentMethod: "Efectivo" }),
    });
    assert.equal(payment.status, 201);

    const paidAccount = await request(`/api/v1/stays/${stayId}/account`);
    assert.equal(paidAccount.body.data.paid, 50);
    assert.equal(paidAccount.body.data.balance, 175);

    const activeHistory = await request(`/api/v1/customers/${customerId}/history`);
    assert.equal(activeHistory.status, 200);
    assert.equal(activeHistory.body.data.activeStay.stayId, stayId);
    assert.equal(activeHistory.body.data.activeStay.total, 225);
    assert.equal(activeHistory.body.data.activeStay.paid, 50);
    assert.equal(activeHistory.body.data.summary.totalCharged, 225);
    assert.equal(activeHistory.body.data.summary.totalPaid, 50);
    assert.equal(activeHistory.body.data.summary.outstandingBalance, 175);
    assert.equal(activeHistory.body.data.activeStay.payments.length, 1);
    assert.equal(activeHistory.body.data.activeStay.payments[0].amount, 50);
    assert.equal(activeHistory.body.data.activeStay.payments[0].kind, "PAYMENT");

    const checkOut = await request(`/api/v1/stays/${stayId}/check-out`, { method: "POST" });
    assert.equal(checkOut.status, 200);
    assert.equal(checkOut.body.data.estado, "Finalizada");

    const historical = await request(`/api/v1/customers/${customerId}/history`);
    assert.equal(historical.body.data.activeStay, null);
    assert.equal(historical.body.data.stays.length, 1);
    assert.equal(historical.body.data.stays[0].status, "Finalizada");
    assert.equal(historical.body.data.stays[0].balance, 175);
    assert.equal(historical.body.data.stays[0].payments.length, 1);
  });

  it("cancels pre-check-in food orders when the reservation is cancelled", async () => {
    const customer = await request("/api/v1/customers", {
      method: "POST",
      body: JSON.stringify({
        nombre: "Cancelación",
        apellido: "Integración",
        documento: "TEST-CUSTOMER-HISTORY-002",
      }),
    });
    assert.equal(customer.status, 201);

    const availability = await request("/api/v1/rooms/availability?from=2031-02-10&to=2031-02-12");
    const room = availability.body.data.find((item: { available: boolean }) => item.available);
    assert.ok(room);

    const reservation = await request("/api/v1/reservations", {
      method: "POST",
      body: JSON.stringify({
        customerId: customer.body.data.id,
        roomId: room.id,
        fechaEntrada: "2031-02-10",
        fechaSalida: "2031-02-12",
        totalReserva: 100,
        depositType: "FIXED",
        depositValue: 0,
      }),
    });
    assert.equal(reservation.status, 201);

    const pendingRejected = await request("/api/v1/food-orders", {
      method: "POST",
      body: JSON.stringify({
        reservationId: reservation.body.data.id,
        productos: "Pedido antes de confirmar",
        total: 4,
      }),
    });
    assert.equal(pendingRejected.status, 409);
    assert.equal(pendingRejected.body.error.code, "RESERVATION_NOT_AVAILABLE");

    const confirmed = await request(`/api/v1/reservations/${reservation.body.data.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "Confirmada" }),
    });
    assert.equal(confirmed.status, 200);

    const preorder = await request("/api/v1/food-orders", {
      method: "POST",
      body: JSON.stringify({
        reservationId: reservation.body.data.id,
        productos: "1 cena",
        total: 12,
      }),
    });
    assert.equal(preorder.status, 201);

    const cancelled = await request(`/api/v1/reservations/${reservation.body.data.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "Cancelada" }),
    });
    assert.equal(cancelled.status, 200);

    const orderAfterCancellation = await request(`/api/v1/food-orders/${preorder.body.data.id}`);
    assert.equal(orderAfterCancellation.body.data.estado, "Cancelado");
    assert.equal(orderAfterCancellation.body.data.stayId, undefined);

    const rejected = await request("/api/v1/food-orders", {
      method: "POST",
      body: JSON.stringify({
        reservationId: reservation.body.data.id,
        productos: "1 jugo",
        total: 3,
      }),
    });
    assert.equal(rejected.status, 409);
    assert.equal(rejected.body.error.code, "RESERVATION_NOT_AVAILABLE");
  });

  it("collects a post-checkout balance without an invoice and records the payment in history", async () => {
    const customer = await request("/api/v1/customers", {
      method: "POST",
      body: JSON.stringify({
        nombre: "Saldo",
        apellido: "PostCheckout",
        documento: "TEST-CUSTOMER-HISTORY-003",
      }),
    });
    assert.equal(customer.status, 201);
    const customerId = customer.body.data.id;

    const availability = await request("/api/v1/rooms/availability?from=2031-03-10&to=2031-03-12");
    const room = availability.body.data.find((item: { available: boolean }) => item.available);
    assert.ok(room);

    const reservation = await request("/api/v1/reservations", {
      method: "POST",
      body: JSON.stringify({
        customerId,
        roomId: room.id,
        fechaEntrada: "2031-03-10",
        fechaSalida: "2031-03-12",
        totalReserva: 120,
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

    const checkIn = await request(`/api/v1/reservations/${reservationId}/check-in`, { method: "POST" });
    assert.equal(checkIn.status, 201);
    const stayId = checkIn.body.data.id;

    const order = await request("/api/v1/food-orders", {
      method: "POST",
      body: JSON.stringify({ stayId, productos: "1 cena de prueba", total: 30 }),
    });
    assert.equal(order.status, 201);

    const delivered = await request(`/api/v1/food-orders/${order.body.data.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "Entregado" }),
    });
    assert.equal(delivered.status, 200);

    const accountBeforeCheckout = await request(`/api/v1/stays/${stayId}/account`);
    assert.equal(accountBeforeCheckout.body.data.total, 150);
    assert.equal(accountBeforeCheckout.body.data.balance, 150);

    const checkOut = await request(`/api/v1/stays/${stayId}/check-out`, { method: "POST" });
    assert.equal(checkOut.status, 200);

    await ensureCashSession();
    const payment = await request(`/api/v1/reservations/${reservationId}/payments`, {
      method: "POST",
      headers: { "Idempotency-Key": `post-checkout-payment-${cashSessionId}` },
      body: JSON.stringify({ amount: 50, paymentMethod: "Efectivo" }),
    });
    assert.equal(payment.status, 201);

    const reservationAccount = await request(`/api/v1/reservations/${reservationId}/account`);
    assert.equal(reservationAccount.status, 200);
    assert.equal(reservationAccount.body.data.balance, 100);

    const history = await request(`/api/v1/customers/${customerId}/history`);
    assert.equal(history.status, 200);
    assert.equal(history.body.data.stays[0].status, "Finalizada");
    assert.equal(history.body.data.stays[0].balance, 100);
    assert.equal(history.body.data.stays[0].payments.length, 1);
    assert.equal(history.body.data.stays[0].payments[0].amount, 50);
    assert.equal(history.body.data.summary.outstandingBalance, 100);
  });

  it("rejects invalid food-order transitions and locks orders included in an issued invoice", async () => {
    const customer = await request("/api/v1/customers", {
      method: "POST",
      body: JSON.stringify({
        nombre: "Factura",
        apellido: "Bloqueo",
        documento: "TEST-CUSTOMER-HISTORY-004",
      }),
    });
    assert.equal(customer.status, 201);

    const availability = await request("/api/v1/rooms/availability?from=2031-04-10&to=2031-04-12");
    const room = availability.body.data.find((item: { available: boolean }) => item.available);
    assert.ok(room);

    const reservation = await request("/api/v1/reservations", {
      method: "POST",
      body: JSON.stringify({
        customerId: customer.body.data.id,
        roomId: room.id,
        fechaEntrada: "2031-04-10",
        fechaSalida: "2031-04-12",
        totalReserva: 80,
        depositType: "FIXED",
        depositValue: 0,
      }),
    });
    assert.equal(reservation.status, 201);
    const reservationId = reservation.body.data.id;

    await request(`/api/v1/reservations/${reservationId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "Confirmada" }),
    });
    const checkIn = await request(`/api/v1/reservations/${reservationId}/check-in`, { method: "POST" });
    assert.equal(checkIn.status, 201);
    const stayId = checkIn.body.data.id;

    const order = await request("/api/v1/food-orders", {
      method: "POST",
      body: JSON.stringify({ stayId, productos: "1 almuerzo facturado", total: 15 }),
    });
    assert.equal(order.status, 201);
    const orderId = order.body.data.id;
    const consumptionId = order.body.data.serviceConsumptionId;

    const delivered = await request(`/api/v1/food-orders/${orderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "Entregado" }),
    });
    assert.equal(delivered.status, 200);

    const invalidTransition = await request(`/api/v1/food-orders/${orderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "Pendiente" }),
    });
    assert.equal(invalidTransition.status, 409);
    assert.equal(invalidTransition.body.error.code, "INVALID_STATUS_TRANSITION");

    const invoice = await request("/api/v1/invoices", {
      method: "POST",
      body: JSON.stringify({ stayId }),
    });
    assert.equal(invoice.status, 201);
    const invoiceId = invoice.body.data.id;
    const issued = await request(`/api/v1/invoices/${invoiceId}/issue`, { method: "POST" });
    assert.equal(issued.status, 200);

    const lockedStatus = await request(`/api/v1/food-orders/${orderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "Cancelado" }),
    });
    assert.equal(lockedStatus.status, 409);
    assert.equal(lockedStatus.body.error.code, "INVOICE_ISSUED");

    const lockedUpdate = await request(`/api/v1/food-orders/${orderId}`, {
      method: "PUT",
      body: JSON.stringify({ total: 1 }),
    });
    assert.equal(lockedUpdate.status, 409);
    assert.equal(lockedUpdate.body.error.code, "INVOICE_ISSUED");

    const blockedNewOrder = await request("/api/v1/food-orders", {
      method: "POST",
      body: JSON.stringify({ stayId, productos: "Cargo posterior a factura", total: 5 }),
    });
    assert.equal(blockedNewOrder.status, 409);
    assert.equal(blockedNewOrder.body.error.code, "INVOICE_ISSUED");

    const lockedConsumption = await request(`/api/v1/service-consumptions/${consumptionId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "Cancelado" }),
    });
    assert.equal(lockedConsumption.status, 409);
    assert.equal(lockedConsumption.body.error.code, "INVOICE_ISSUED");

    const blockedDirectService = await request(`/api/v1/stays/${stayId}/services`, {
      method: "POST",
      body: JSON.stringify({ serviceId: 1, cantidad: 1 }),
    });
    assert.equal(blockedDirectService.status, 409);
    assert.equal(blockedDirectService.body.error.code, "INVOICE_ISSUED");

    const blockedLaundry = await request("/api/v1/laundry", {
      method: "POST",
      body: JSON.stringify({ stayId, prendas: [{ tipo: "Camisa", cantidad: 1 }] }),
    });
    assert.equal(blockedLaundry.status, 409);
    assert.equal(blockedLaundry.body.error.code, "INVOICE_ISSUED");

    const voided = await request(`/api/v1/invoices/${invoiceId}/void`, {
      method: "POST",
      body: JSON.stringify({ reason: "Limpieza de la prueba de bloqueo" }),
    });
    assert.equal(voided.status, 200);
    const checkOut = await request(`/api/v1/stays/${stayId}/check-out`, { method: "POST" });
    assert.equal(checkOut.status, 200);
  });

  it("creates concurrent pre-check-in orders with distinct database IDs", async () => {
    const customer = await request("/api/v1/customers", {
      method: "POST",
      body: JSON.stringify({
        nombre: "Concurrente",
        apellido: "Pedidos",
        documento: "TEST-CUSTOMER-HISTORY-005",
      }),
    });
    assert.equal(customer.status, 201);

    const availability = await request("/api/v1/rooms/availability?from=2031-05-10&to=2031-05-12");
    const room = availability.body.data.find((item: { available: boolean }) => item.available);
    assert.ok(room);

    const reservation = await request("/api/v1/reservations", {
      method: "POST",
      body: JSON.stringify({
        customerId: customer.body.data.id,
        roomId: room.id,
        fechaEntrada: "2031-05-10",
        fechaSalida: "2031-05-12",
        totalReserva: 60,
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
