import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../../src/app.js";
import { dbClient } from "../../src/db/client.js";

describe("Simplified PMS integration: rooms, reservation account and checkout", () => {
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
              observaciones: "Cierre de pruebas del PMS simplificado",
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

  async function ensureCashSession(): Promise<number> {
    const current = await request("/api/v1/cash-register/current");
    if (current.body.data && !current.body.data.isClosed) {
      cashSessionId = current.body.data.id;
      return cashSessionId;
    }
    const opened = await request("/api/v1/cash-register/open", {
      method: "POST",
      body: JSON.stringify({ fondoInicial: 100 }),
    });
    assert.equal(opened.status, 201);
    cashSessionId = opened.body.data.id;
    openedCashSession = true;
    return cashSessionId;
  }

  it("manages room name, category, price, availability and soft deactivation", async () => {
    const created = await request("/api/v1/rooms", {
      method: "POST",
      body: JSON.stringify({
        code: "PMS-ROOM-01",
        name: "Habitación PMS 01",
        category: "Deluxe",
        description: "Vista al jardín",
        pricePerNight: 75.5,
        active: true,
      }),
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.code, "PMS-ROOM-01");
    assert.equal(created.body.data.category, "Deluxe");
    assert.equal(created.body.data.pricePerNight, 75.5);
    const roomId = created.body.data.id;

    const duplicate = await request("/api/v1/rooms", {
      method: "POST",
      body: JSON.stringify({ code: "PMS-ROOM-01", name: "Duplicada", pricePerNight: 10 }),
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, "ROOM_CODE_EXISTS");

    const availability = await request("/api/v1/rooms/availability?from=2036-01-10&to=2036-01-12");
    assert.equal(availability.status, 200);
    const availableRoom = availability.body.data.find((item: { id: number }) => item.id === roomId);
    assert.ok(availableRoom);
    assert.equal(availableRoom.available, true);
    assert.equal(availableRoom.pricePerNight, 75.5);

    const updated = await request(`/api/v1/rooms/${roomId}`, {
      method: "PUT",
      body: JSON.stringify({ category: "Suite", pricePerNight: 90 }),
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.category, "Suite");
    assert.equal(updated.body.data.pricePerNight, 90);
    assert.equal(updated.body.data.name, "Habitación PMS 01");

    const deactivated = await request(`/api/v1/rooms/${roomId}`, { method: "DELETE" });
    assert.equal(deactivated.status, 200);
    assert.equal(deactivated.body.data.active, false);

    const afterDeactivation = await request("/api/v1/rooms/availability?from=2036-01-10&to=2036-01-12");
    assert.equal(
      afterDeactivation.body.data.some((item: { id: number }) => item.id === roomId),
      false
    );
    const allRooms = await request("/api/v1/rooms");
    const inactive = allRooms.body.data.find((item: { id: number }) => item.id === roomId);
    assert.ok(inactive);
    assert.equal(inactive.active, false);

    const audit = await dbClient.execute({
      sql: `SELECT action, user_id, entity_id, old_values, new_values, ip_address
            FROM audit_logs WHERE entity = 'room' AND entity_id = ? ORDER BY id ASC;`,
      args: [String(roomId)],
    });
    assert.deepEqual(audit.rows.map((row) => row.action), ["CREATE", "UPDATE", "DEACTIVATE"]);
    assert.ok(audit.rows.every((row) => row.user_id === "usr_admin_001" && row.ip_address));
    assert.equal(JSON.parse(String(audit.rows[0].new_values)).pricePerNightCents, 7550);
    assert.equal(JSON.parse(String(audit.rows[1].old_values)).category, "Deluxe");
    assert.equal(JSON.parse(String(audit.rows[1].new_values)).category, "Suite");
    assert.equal(JSON.parse(String(audit.rows[2].new_values)).active, false);
  });

  it("auto-registers the customer and freezes the room price at reservation time", async () => {
    const createdRoom = await request("/api/v1/rooms", {
      method: "POST",
      body: JSON.stringify({
        code: "PMS-ROOM-02",
        name: "Habitación PMS 02",
        category: "Estándar",
        pricePerNight: 60,
      }),
    });
    assert.equal(createdRoom.status, 201);
    const roomId = createdRoom.body.data.id;

    const reservation = await request("/api/v1/reservations", {
      method: "POST",
      body: JSON.stringify({
        customer: {
          nombre: "Huésped",
          apellido: "Auto Registrado",
          documento: "TEST-PMS-GUEST-001",
          telefono: "8888-0001",
        },
        roomId,
        fechaEntrada: "2036-02-10",
        fechaSalida: "2036-02-12",
        depositType: "FIXED",
        depositValue: 0,
      }),
    });
    assert.equal(reservation.status, 201);
    assert.equal(reservation.body.data.totalReserva, 120);
    assert.equal(reservation.body.data.roomPricePerNight, 60);
    assert.equal(reservation.body.data.lodgingTotal, 120);
    assert.equal(reservation.body.data.nights, 2);
    const reservationId = reservation.body.data.id;
    const customerId = reservation.body.data.customerId;

    const customer = await request(`/api/v1/customers/${customerId}`);
    assert.equal(customer.status, 200);
    assert.equal(customer.body.data.documento, "TEST-PMS-GUEST-001");

    const priceChange = await request(`/api/v1/rooms/${roomId}`, {
      method: "PUT",
      body: JSON.stringify({ pricePerNight: 999 }),
    });
    assert.equal(priceChange.status, 200);

    const frozen = await request(`/api/v1/reservations/${reservationId}`);
    assert.equal(frozen.status, 200);
    assert.equal(frozen.body.data.totalReserva, 120);
    assert.equal(frozen.body.data.roomPricePerNight, 60);
    assert.equal(frozen.body.data.lodgingTotal, 120);
  });

  it("opens the account, edits consumptions, charges services and issues an invoice on checkout", async () => {
    const room = await request("/api/v1/rooms", {
      method: "POST",
      body: JSON.stringify({
        code: "PMS-ROOM-03",
        name: "Habitación PMS 03",
        category: "Superior",
        pricePerNight: 60,
      }),
    });
    assert.equal(room.status, 201);

    const reservation = await request("/api/v1/reservations", {
      method: "POST",
      body: JSON.stringify({
        customer: {
          nombre: "Cuenta",
          apellido: "Unificada",
          documento: "TEST-PMS-GUEST-002",
        },
        roomId: room.body.data.id,
        fechaEntrada: "2036-03-10",
        fechaSalida: "2036-03-12",
        depositType: "FIXED",
        depositValue: 0,
      }),
    });
    assert.equal(reservation.status, 201);
    const reservationId = reservation.body.data.id;

    const beforeCheckIn = await request(`/api/v1/reservations/${reservationId}/account`);
    assert.equal(beforeCheckIn.status, 200);
    assert.equal(beforeCheckIn.body.data.lodging, 120);
    assert.equal(beforeCheckIn.body.data.services, 0);
    assert.equal(beforeCheckIn.body.data.total, 120);
    assert.equal(beforeCheckIn.body.data.balance, 120);
    assert.deepEqual(beforeCheckIn.body.data.consumptions, []);
    assert.equal(beforeCheckIn.body.data.stayId, undefined);

    const catalog = await request("/api/v1/service-catalog", {
      method: "POST",
      body: JSON.stringify({
        nombre: "Servicio PMS de prueba",
        categoria: "Otro",
        precio: 25,
        activo: true,
      }),
    });
    assert.equal(catalog.status, 201);
    const serviceId = catalog.body.data.id;

    const beforeCheckInConsumption = await request(`/api/v1/reservations/${reservationId}/consumptions`, {
      method: "POST",
      body: JSON.stringify({ serviceId, cantidad: 1 }),
    });
    assert.equal(beforeCheckInConsumption.status, 409);
    assert.equal(beforeCheckInConsumption.body.error.code, "STAY_NOT_OPENED");

    const confirmed = await request(`/api/v1/reservations/${reservationId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "Confirmada" }),
    });
    assert.equal(confirmed.status, 200);

    const checkIn = await request(`/api/v1/reservations/${reservationId}/check-in`, { method: "POST" });
    assert.equal(checkIn.status, 201);
    const stayId = checkIn.body.data.id;

    const withStay = await request(`/api/v1/reservations/${reservationId}/account`);
    assert.equal(withStay.body.data.stayId, stayId);
    assert.equal(withStay.body.data.status, "Activa");
    assert.ok(withStay.body.data.checkInAt);

    const consumption = await request(`/api/v1/reservations/${reservationId}/consumptions`, {
      method: "POST",
      body: JSON.stringify({ serviceId, cantidad: 2, observaciones: "Consumo directo" }),
    });
    assert.equal(consumption.status, 201);
    assert.equal(consumption.body.data.subtotal, 50);
    assert.equal(consumption.body.data.estado, "Registrado");
    const consumptionId = consumption.body.data.id;

    const pendingAccount = await request(`/api/v1/reservations/${reservationId}/account`);
    assert.equal(pendingAccount.body.data.services, 0);
    assert.equal(pendingAccount.body.data.pendingServicesAmount, 50);
    assert.equal(pendingAccount.body.data.total, 120);
    assert.equal(pendingAccount.body.data.pendingServiceCount, 1);

    const delivered = await request(`/api/v1/service-consumptions/${consumptionId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "Entregado" }),
    });
    assert.equal(delivered.status, 200);

    const activeAccount = await request(`/api/v1/reservations/${reservationId}/account`);
    assert.equal(activeAccount.body.data.services, 50);
    assert.equal(activeAccount.body.data.total, 170);
    assert.equal(activeAccount.body.data.balance, 170);

    const edited = await request(`/api/v1/service-consumptions/${consumptionId}`, {
      method: "PUT",
      body: JSON.stringify({ cantidad: 3 }),
    });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.data.cantidad, 3);
    assert.equal(edited.body.data.subtotal, 75);

    const afterEdit = await request(`/api/v1/reservations/${reservationId}/account`);
    assert.equal(afterEdit.body.data.total, 195);

    await ensureCashSession();
    const payment = await request(`/api/v1/reservations/${reservationId}/payments`, {
      method: "POST",
      headers: { "Idempotency-Key": `simplified-pms-${cashSessionId}` },
      body: JSON.stringify({ amount: 150, paymentMethod: "Efectivo" }),
    });
    assert.equal(payment.status, 201);
    assert.equal(payment.body.data.amount, 150);

    const checkout = await request(`/api/v1/reservations/${reservationId}/checkout`, { method: "POST" });
    assert.equal(checkout.status, 200);
    assert.equal(checkout.body.data.stay.estado, "Finalizada");
    assert.ok(checkout.body.data.invoice.id);
    assert.equal(checkout.body.data.invoice.total, 195);
    assert.equal(checkout.body.data.invoice.status, "Parcial");
    assert.equal(checkout.body.data.account.status, "Finalizada");
    assert.equal(checkout.body.data.account.invoice.total, 195);
    assert.equal(checkout.body.data.account.balance, 45);

    const finalReservation = await request(`/api/v1/reservations/${reservationId}`);
    assert.equal(finalReservation.body.data.estado, "Finalizada");
    assert.ok(finalReservation.body.data.checkOutAt);

    const afterCheckoutConsumption = await request(`/api/v1/reservations/${reservationId}/consumptions`, {
      method: "POST",
      body: JSON.stringify({ serviceId, cantidad: 1 }),
    });
    assert.equal(afterCheckoutConsumption.status, 409);
    assert.equal(afterCheckoutConsumption.body.error.code, "STAY_NOT_ACTIVE");
  });

  it("keeps independent accounts when the same customer has more than one stay", async () => {
    const room = await request("/api/v1/rooms", {
      method: "POST",
      body: JSON.stringify({
        code: "PMS-ROOM-04",
        name: "Habitación PMS 04",
        category: "Familiar",
        pricePerNight: 40,
      }),
    });
    assert.equal(room.status, 201);

    const first = await request("/api/v1/reservations", {
      method: "POST",
      body: JSON.stringify({
        customer: { nombre: "Cliente", apellido: "Repetido", documento: "TEST-PMS-GUEST-003" },
        roomId: room.body.data.id,
        fechaEntrada: "2036-04-10",
        fechaSalida: "2036-04-11",
        depositType: "FIXED",
        depositValue: 0,
      }),
    });
    assert.equal(first.status, 201);
    const second = await request("/api/v1/reservations", {
      method: "POST",
      body: JSON.stringify({
        customer: { nombre: "Cliente", apellido: "Repetido", documento: "TEST-PMS-GUEST-003" },
        roomId: room.body.data.id,
        fechaEntrada: "2036-05-10",
        fechaSalida: "2036-05-12",
        depositType: "FIXED",
        depositValue: 0,
      }),
    });
    assert.equal(second.status, 201);
    assert.equal(first.body.data.customerId, second.body.data.customerId);

    const firstAccount = await request(`/api/v1/reservations/${first.body.data.id}/account`);
    const secondAccount = await request(`/api/v1/reservations/${second.body.data.id}/account`);
    assert.equal(firstAccount.body.data.total, 40);
    assert.equal(secondAccount.body.data.total, 80);
    assert.deepEqual(firstAccount.body.data.payments, []);
    assert.deepEqual(secondAccount.body.data.payments, []);
  });

  it("serializes concurrent check-outs and issues exactly one invoice", async () => {
    const room = await request("/api/v1/rooms", {
      method: "POST",
      body: JSON.stringify({
        code: "PMS-RACE-05",
        name: "Habitación PMS Concurrencia",
        category: "Estándar",
        pricePerNight: 30,
      }),
    });
    assert.equal(room.status, 201);

    const reservation = await request("/api/v1/reservations", {
      method: "POST",
      body: JSON.stringify({
        customer: { nombre: "Check-out", apellido: "Concurrente", documento: "TEST-PMS-CHECKOUT-RACE" },
        roomId: room.body.data.id,
        fechaEntrada: "2036-06-10",
        fechaSalida: "2036-06-11",
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

    const deactivateViaUpdate = await request(`/api/v1/rooms/${room.body.data.id}`, {
      method: "PUT",
      body: JSON.stringify({ active: false }),
    });
    assert.equal(deactivateViaUpdate.status, 409);
    assert.equal(deactivateViaUpdate.body.error.code, "ROOM_OCCUPIED");

    const deactivateOccupiedRoom = await request(`/api/v1/rooms/${room.body.data.id}`, { method: "DELETE" });
    assert.equal(deactivateOccupiedRoom.status, 409);
    assert.equal(deactivateOccupiedRoom.body.error.code, "ROOM_OCCUPIED");
    const failedDeactivationAudit = await dbClient.execute({
      sql: "SELECT id FROM audit_logs WHERE entity = 'room' AND entity_id = ? AND action = 'DEACTIVATE';",
      args: [String(room.body.data.id)],
    });
    assert.equal(failedDeactivationAudit.rows.length, 0);

    const results = await Promise.all([
      request(`/api/v1/reservations/${reservationId}/checkout`, { method: "POST" }),
      request(`/api/v1/reservations/${reservationId}/checkout`, { method: "POST" }),
    ]);
    assert.deepEqual(results.map((result) => result.status), [200, 200]);
    assert.equal(results[0].body.data.invoice.id, results[1].body.data.invoice.id);
    assert.deepEqual(results.map((result) => result.body.data.stay.estado), ["Finalizada", "Finalizada"]);

    const deactivatedAfterCheckout = await request(`/api/v1/rooms/${room.body.data.id}`, { method: "DELETE" });
    assert.equal(deactivatedAfterCheckout.status, 200);
    assert.equal(deactivatedAfterCheckout.body.data.active, false);

    const invoices = await dbClient.execute({
      sql: "SELECT id FROM invoices WHERE stay_id = ? AND status <> 'Anulada';",
      args: [stayId],
    });
    assert.equal(invoices.rows.length, 1);
  });
});
