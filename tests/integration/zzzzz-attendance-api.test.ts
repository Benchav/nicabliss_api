import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../../src/app.js";

describe("Staff attendance integration", () => {
  let server: http.Server; let baseUrl = ""; let token = ""; let staffToken = ""; let staffId = ""; let absenceId = 0;
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Managua", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const day = new Date(`${local}T12:00:00Z`).getUTCDay();
  before(async () => {
    server = http.createServer(createApp()); await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://localhost:${(server.address() as { port: number }).port}`;
    token = (await request("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ usuario: "admin", password: "12345" }) }, false)).body.data.token;
  });
  after(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
  async function request(path: string, options: RequestInit = {}, authenticated = true, overrideToken?: string) {
    const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { "Content-Type": "application/json", ...(authenticated ? { Authorization: `Bearer ${overrideToken ?? token}` } : {}), ...(options.headers || {}) } });
    return { status: response.status, body: await response.json() };
  }

  it("configures a schedule and records an idempotency-safe late check-in and check-out", async () => {
    const staff = await request("/api/v1/users", { method: "POST", body: JSON.stringify({ username: "attendance_staff", email: "attendance@nicabliss.test", password: "12345", fullName: "Personal Asistencia", role: "STAFF" }) });
    assert.equal(staff.status, 201); staffId = staff.body.data.id;
    staffToken = (await request("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ usuario: "attendance_staff", password: "12345" }) }, false)).body.data.token;
    const schedule = await request("/api/v1/attendance/schedules", { method: "PUT", body: JSON.stringify({ userId: "usr_admin_001", dayOfWeek: day, startTime: "00:00", endTime: "23:59", active: true }) });
    assert.equal(schedule.status, 200);
    const checkIn = await request("/api/v1/attendance/check-in", { method: "POST" });
    assert.equal(checkIn.status, 201); assert.equal(checkIn.body.data.status, "Tarde");
    const duplicate = await request("/api/v1/attendance/check-in", { method: "POST" });
    assert.equal(duplicate.status, 409); assert.equal(duplicate.body.error.code, "ATTENDANCE_ALREADY_REGISTERED");
    const checkOut = await request("/api/v1/attendance/check-out", { method: "POST" });
    assert.equal(checkOut.status, 200); assert.ok(checkOut.body.data.checkOut);
  });

  it("records and audits an absence while restricting historical reports", async () => {
    const absence = await request("/api/v1/attendance/absence", { method: "POST", body: JSON.stringify({ userId: staffId, attendanceDate: local, status: "Ausente", justification: "Ausencia de integración" }) });
    assert.equal(absence.status, 201); absenceId = absence.body.data.id;
    const updated = await request(`/api/v1/attendance/${absenceId}`, { method: "PUT", body: JSON.stringify({ status: "Permiso", justification: "Permiso autorizado" }) });
    assert.equal(updated.status, 200); assert.equal(updated.body.data.status, "Permiso");
    const today = await request("/api/v1/attendance/today");
    assert.equal(today.status, 200); assert.ok(today.body.data.some((row: { userId: string }) => row.userId === staffId));
    const report = await request(`/api/v1/attendance/report?from=${local}&to=${local}`);
    assert.equal(report.status, 200); assert.equal(report.body.data.totals.records, 2); assert.equal(report.body.data.totals.late, 1); assert.equal(report.body.data.totals.absences, 1);
    const forbidden = await request(`/api/v1/attendance/report?from=${local}&to=${local}`, {}, true, staffToken);
    assert.equal(forbidden.status, 403);
    const ownToday = await request("/api/v1/attendance/today", {}, true, staffToken);
    assert.equal(ownToday.status, 200); assert.equal(ownToday.body.data.length, 1); assert.equal(ownToday.body.data[0].userId, staffId);
  });
});
