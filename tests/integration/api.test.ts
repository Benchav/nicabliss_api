import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../../src/app.js";

describe("API Integration & Security Tests (E2E)", () => {
  let server: http.Server;
  let baseUrl: string;
  let authToken: string;

  before(async () => {
    const app = createApp();
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address() as any;
    baseUrl = `http://localhost:${addr.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function api(path: string, options: RequestInit = {}) {
    const res = await fetch(baseUrl + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const json = await res.json();
    return { status: res.status, body: json };
  }

  it("GET /health -> responde 200 OK con metadatos del sistema", async () => {
    const res = await api("/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
    assert.equal(res.body.system, "Nicabliss Hotel Management API");
  });

  it("GET /ready -> confirma conexión y versión del esquema", async () => {
    const res = await api("/ready");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ready");
    assert.equal(res.body.database, "connected");
    assert.equal(res.body.schemaVersion, "010");
  });

  it("POST /api/v1/auth/login -> autentica con credenciales admin y emite JWT", async () => {
    const res = await api("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ usuario: "admin", password: "12345" }),
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.data.token);
    assert.equal(res.body.data.user.username, "admin");
    authToken = res.body.data.token;
  });

  it("GET /api/v1/dashboard/metrics -> rechaza 401 si no hay token", async () => {
    const res = await api("/api/v1/dashboard/metrics");
    assert.equal(res.status, 401);
  });

  it("GET /api/v1/dashboard/metrics -> responde 200 con Bearer token válido", async () => {
    const res = await api("/api/v1/dashboard/metrics", {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.stats);
  });

  it("GET /api/v1/guests -> retorna lista de huéspedes autenticado", async () => {
    const res = await api("/api/v1/guests", {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 4);
  });

  it("GET /ruta-inexistente -> responde 404 semántico", async () => {
    const res = await api("/api/v1/ruta-no-existe");
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, "NOT_FOUND");
  });

  it("PUT /api/v1/guests/:id -> mantiene el recurso heredado en solo lectura", async () => {
    const res = await api("/api/v1/guests/1", {
      method: "PUT",
      headers: { Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ habitacion: "Habitación 10" }),
    });
    assert.equal(res.status, 405);
    assert.equal(res.body.error.code, "LEGACY_READ_ONLY");
  });

  it("POST /api/v1/billing -> mantiene la contabilidad heredada en solo lectura", async () => {
    const res = await api("/api/v1/billing", {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        huesped: "No debe crearse",
        habitacion: "Habitación 99",
        concepto: "Prueba",
        total: 10,
      }),
    });
    assert.equal(res.status, 405);
    assert.equal(res.body.error.code, "LEGACY_READ_ONLY");
  });

  // --- Tests de Gestión de Usuarios y Roles (RBAC) ---
  it("GET /api/v1/users -> rechaza 401 sin autenticación", async () => {
    const res = await api("/api/v1/users");
    assert.equal(res.status, 401);
  });

  it("GET /api/v1/users -> retorna 200 OK con lista de usuarios para rol ADMIN", async () => {
    const res = await api("/api/v1/users", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.length >= 1);
  });

  it("POST /api/v1/users -> crea nuevo usuario con rol asignado", async () => {
    const res = await api("/api/v1/users", {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        username: "e2e_receptionist",
        email: "e2e_rec@nicabliss.com",
        password: "securePassword123",
        fullName: "Recepcionista E2E",
        role: "RECEPTIONIST",
      }),
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.username, "e2e_receptionist");
    assert.equal(res.body.data.role, "RECEPTIONIST");
  });

  it("RBAC Check: usuario no ADMIN recibe 403 FORBIDDEN en /api/v1/users", async () => {
    // Iniciar sesión como recepcionista creado previamente
    const loginRes = await api("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ usuario: "e2e_receptionist", password: "securePassword123" }),
    });
    assert.equal(loginRes.status, 200);
    const receptionistToken = loginRes.body.data.token;

    // Intentar acceder a /api/v1/users
    const userRes = await api("/api/v1/users", {
      headers: { Authorization: `Bearer ${receptionistToken}` },
    });
    assert.equal(userRes.status, 403);
    assert.equal(userRes.body.error.code, "FORBIDDEN");
  });

  it("PUT /api/v1/users/:id -> actualiza rol y datos de usuario", async () => {
    // Obtener lista para hallar ID de e2e_receptionist
    const listRes = await api("/api/v1/users", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const target = listRes.body.data.find((u: any) => u.username === "e2e_receptionist");
    assert.ok(target);

    const updateRes = await api(`/api/v1/users/${target.id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        fullName: "Recepcionista Jefe",
        role: "STAFF",
      }),
    });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.data.fullName, "Recepcionista Jefe");
    assert.equal(updateRes.body.data.role, "STAFF");
  });

  it("DELETE /api/v1/users/:id -> impide auto-eliminación del admin en sesión", async () => {
    const listRes = await api("/api/v1/users", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const adminUser = listRes.body.data.find((u: any) => u.username === "admin");
    assert.ok(adminUser);

    const deleteRes = await api(`/api/v1/users/${adminUser.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authToken}` },
    });

    assert.equal(deleteRes.status, 400);
    assert.ok(deleteRes.body.error);
  });

  it("DELETE /api/v1/users/:id -> elimina usuario regular correctamente", async () => {
    const listRes = await api("/api/v1/users", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const target = listRes.body.data.find((u: any) => u.username === "e2e_receptionist");
    assert.ok(target);

    const deleteRes = await api(`/api/v1/users/${target.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authToken}` },
    });

    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body.success, true);
  });
});
