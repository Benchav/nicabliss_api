import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../../src/app.js";
import { dbClient } from "../../src/db/client.js";

describe("Security, RBAC, and audit integration", () => {
  let server: http.Server;
  let baseUrl = "";
  let adminToken = "";
  let staffToken = "";
  let staffId = "";
  let roleTargetId = "";
  let reservationId = 0;
  let attendanceId = 0;
  let cashSessionId = 0;

  before(async () => {
    server = http.createServer(createApp());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://localhost:${(server.address() as { port: number }).port}`;
    const login = await request(
      "/api/v1/auth/login",
      { method: "POST", body: JSON.stringify({ usuario: "admin", password: "12345" }) },
      undefined
    );
    assert.equal(login.status, 200);
    adminToken = login.body.data.token;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function request(path: string, options: RequestInit = {}, token: string | undefined = adminToken) {
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

  async function createUser(username: string, role: "ADMIN" | "RECEPTIONIST" | "STAFF") {
    const response = await request("/api/v1/users", {
      method: "POST",
      body: JSON.stringify({
        username,
        email: `${username}@nicabliss.test`,
        password: "secure123456",
        fullName: `Seguridad ${username}`,
        role,
      }),
    });
    assert.equal(response.status, 201);
    return response.body.data;
  }

  it("enforces the endpoint permission matrix for STAFF", async () => {
    const staff = await createUser("phase7_staff", "STAFF");
    staffId = staff.id;
    const login = await request(
      "/api/v1/auth/login",
      { method: "POST", body: JSON.stringify({ usuario: "phase7_staff", password: "secure123456" }) },
      undefined
    );
    staffToken = login.body.data.token;

    const forbiddenRequests: Array<[string, RequestInit]> = [
      ["/api/v1/reports/dashboard?date=2026-10-24", {}],
      ["/api/v1/reports/export.xlsx?period=daily&date=2026-10-24", {}],
      ["/api/v1/dashboard/metrics", {}],
      ["/api/v1/reports/receivables", {}],
      ["/api/v1/cash-register/current", {}],
      ["/api/v1/users", {}],
      ["/api/v1/attendance/report?from=2026-10-01&to=2026-10-31", {}],
      ["/api/v1/service-catalog", { method: "POST", body: JSON.stringify({ nombre: "No autorizado", categoria: "Otro", precio: 1 }) }],
    ];

    for (const [path, options] of forbiddenRequests) {
      const response = await request(path, options, staffToken);
      assert.equal(response.status, 403, path);
      assert.equal(response.body.error.code, "FORBIDDEN", path);
    }

    const ownAttendance = await request("/api/v1/attendance/check-in", { method: "POST" }, staffToken);
    assert.equal(ownAttendance.status, 201);
    attendanceId = ownAttendance.body.data.id;
    const serviceCatalog = await request("/api/v1/service-catalog", {}, staffToken);
    assert.equal(serviceCatalog.status, 200);
  });

  it("audits role changes and prevents changing the role of the active account", async () => {
    const target = await createUser("phase7_role_target", "STAFF");
    roleTargetId = target.id;
    const targetLogin = await request(
      "/api/v1/auth/login",
      { method: "POST", body: JSON.stringify({ usuario: "phase7_role_target", password: "secure123456" }) },
      undefined
    );
    const targetToken = targetLogin.body.data.token;
    const beforePromotion = await request("/api/v1/reports/dashboard?date=2026-10-24", {}, targetToken);
    assert.equal(beforePromotion.status, 403);
    const changed = await request(`/api/v1/users/${roleTargetId}`, {
      method: "PUT",
      body: JSON.stringify({ role: "RECEPTIONIST", fullName: "Objetivo promovido" }),
    });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.data.role, "RECEPTIONIST");
    const afterPromotion = await request("/api/v1/reports/dashboard?date=2026-10-24", {}, targetToken);
    assert.equal(afterPromotion.status, 401, "El cambio de rol debe revocar el JWT anterior");
    assert.equal(afterPromotion.body.error.code, "SESSION_REVOKED");
    const promotedLogin = await request(
      "/api/v1/auth/login",
      { method: "POST", body: JSON.stringify({ usuario: "phase7_role_target", password: "secure123456" }) },
      undefined
    );
    const afterFreshLogin = await request("/api/v1/reports/dashboard?date=2026-10-24", {}, promotedLogin.body.data.token);
    assert.equal(afterFreshLogin.status, 200);

    const audit = await dbClient.execute({
      sql: `SELECT * FROM audit_logs
            WHERE action = 'ROLE_CHANGE' AND entity = 'user' AND entity_id = ?
            ORDER BY id DESC LIMIT 1;`,
      args: [roleTargetId],
    });
    assert.equal(audit.rows.length, 1);
    assert.equal(audit.rows[0].user_id, "usr_admin_001");
    assert.deepEqual(JSON.parse(String(audit.rows[0].old_values)), { role: "STAFF" });
    assert.deepEqual(JSON.parse(String(audit.rows[0].new_values)), { role: "RECEPTIONIST" });
    assert.ok(audit.rows[0].ip_address);

    const secondaryAdmin = await createUser("phase7_admin", "ADMIN");
    const login = await request(
      "/api/v1/auth/login",
      { method: "POST", body: JSON.stringify({ usuario: "phase7_admin", password: "secure123456" }) },
      undefined
    );
    const selfChange = await request(
      `/api/v1/users/${secondaryAdmin.id}`,
      { method: "PUT", body: JSON.stringify({ role: "STAFF" }) },
      login.body.data.token
    );
    assert.equal(selfChange.status, 400);
    assert.equal(selfChange.body.error.code, "SELF_ROLE_CHANGE");
  });

  it("audits reservations and historical attendance edits", async () => {
    const customer = await request("/api/v1/customers", {
      method: "POST",
      body: JSON.stringify({ nombre: "Auditoría", apellido: "Reserva", documento: "PHASE7-AUDIT-001" }),
    });
    const availability = await request("/api/v1/rooms/availability?from=2033-04-10&to=2033-04-12");
    const room = availability.body.data.find((item: { available: boolean }) => item.available);
    assert.ok(room);
    const reservation = await request("/api/v1/reservations", {
      method: "POST",
      body: JSON.stringify({
        customerId: customer.body.data.id,
        roomId: room.id,
        fechaEntrada: "2033-04-10",
        fechaSalida: "2033-04-12",
        totalReserva: 120,
        depositType: "PERCENTAGE",
        depositValue: 50,
      }),
    });
    assert.equal(reservation.status, 201);
    reservationId = reservation.body.data.id;

    const attendance = await request(`/api/v1/attendance/${attendanceId}`, {
      method: "PUT",
      body: JSON.stringify({ status: "Permiso", justification: "Corrección autorizada de Fase 7" }),
    });
    assert.equal(attendance.status, 200);

    const audits = await dbClient.execute({
      sql: `SELECT action, entity, entity_id, user_id FROM audit_logs
            WHERE (entity = 'reservation' AND entity_id = ?)
               OR (entity = 'attendance' AND entity_id = ?)
            ORDER BY id;`,
      args: [String(reservationId), String(attendanceId)],
    });
    assert.ok(audits.rows.some((row) => row.entity === "reservation" && row.action === "CREATE"));
    assert.ok(audits.rows.some((row) => row.entity === "attendance" && row.action === "UPDATE"));
    assert.ok(audits.rows.every((row) => row.user_id === "usr_admin_001"));
  });

  it("writes the cash closing and its audit record atomically", async () => {
    const opened = await request("/api/v1/cash-register/open", {
      method: "POST",
      body: JSON.stringify({ fondoInicial: 75 }),
    });
    assert.equal(opened.status, 201);
    cashSessionId = opened.body.data.id;
    assert.equal(opened.body.data.openedBy, "usr_admin_001");
    assert.equal(opened.body.data.responsable, "Administrador Nicabliss");

    const openAudit = await dbClient.execute({
      sql: `SELECT action, user_id, ip_address, new_values FROM audit_logs
            WHERE entity = 'cash_session' AND entity_id = ? AND action = 'OPEN' LIMIT 1;`,
      args: [String(cashSessionId)],
    });
    assert.equal(openAudit.rows.length, 1);
    assert.equal(openAudit.rows[0].user_id, "usr_admin_001");
    assert.ok(openAudit.rows[0].ip_address);

    const closed = await request("/api/v1/cash-register/close", {
      method: "POST",
      body: JSON.stringify({ efectivoContado: 75, observaciones: "Cierre auditado" }),
    });
    assert.equal(closed.status, 200);
    assert.equal(closed.body.data.isClosed, true);

    const result = await dbClient.execute({
      sql: `SELECT cs.is_closed, al.action, al.user_id, al.old_values, al.new_values, al.ip_address
            FROM cash_sessions cs
            JOIN audit_logs al ON al.entity = 'cash_session' AND al.entity_id = CAST(cs.id AS TEXT)
            WHERE cs.id = ? AND al.action = 'CLOSE' LIMIT 1;`,
      args: [cashSessionId],
    });
    assert.equal(result.rows.length, 1);
    assert.equal(Number(result.rows[0].is_closed), 1);
    assert.equal(result.rows[0].user_id, "usr_admin_001");
    assert.deepEqual(JSON.parse(String(result.rows[0].old_values)), { isClosed: false, openedBy: "usr_admin_001" });
    assert.equal(JSON.parse(String(result.rows[0].new_values)).diferencia, 0);
    assert.ok(result.rows[0].ip_address);
  });

  it("requires a reason and audits an administrator closing another user's cash session", async () => {
    const overrideAdmin = await createUser("cash_override_admin", "ADMIN");
    let overrideSessionId = 0;
    try {
      const login = await request(
        "/api/v1/auth/login",
        { method: "POST", body: JSON.stringify({ usuario: "cash_override_admin", password: "secure123456" }) },
        undefined
      );
      assert.equal(login.status, 200);

      const opened = await request("/api/v1/cash-register/open", {
        method: "POST",
        body: JSON.stringify({ fondoInicial: 20 }),
      });
      assert.equal(opened.status, 201);
      overrideSessionId = opened.body.data.id;

      const withoutReason = await request("/api/v1/cash-register/close", {
        method: "POST",
        body: JSON.stringify({ efectivoContado: 20 }),
      }, login.body.data.token);
      assert.equal(withoutReason.status, 400);
      assert.equal(withoutReason.body.error.code, "ADMIN_CLOSE_REASON_REQUIRED");

      const closed = await request("/api/v1/cash-register/close", {
        method: "POST",
        body: JSON.stringify({ efectivoContado: 20, observaciones: "Responsable no disponible" }),
      }, login.body.data.token);
      assert.equal(closed.status, 200);
      assert.equal(closed.body.data.closedBy, overrideAdmin.id);

      const audit = await dbClient.execute({
        sql: `SELECT action, user_id FROM audit_logs
              WHERE entity = 'cash_session' AND entity_id = ? AND action = 'CLOSE_ADMIN_OVERRIDE' LIMIT 1;`,
        args: [String(overrideSessionId)],
      });
      assert.equal(audit.rows.length, 1);
      assert.equal(audit.rows[0].user_id, overrideAdmin.id);
    } finally {
      if (overrideSessionId) {
        await dbClient.execute({ sql: "DELETE FROM cash_sessions WHERE id = ?;", args: [overrideSessionId] });
      }
      await dbClient.execute({ sql: "DELETE FROM users WHERE id = ?;", args: [overrideAdmin.id] });
    }
  });
});
