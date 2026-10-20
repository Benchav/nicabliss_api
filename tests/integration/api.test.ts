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
});
