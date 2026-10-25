import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../../src/app.js";
import { dbClient } from "../../src/db/client.js";

describe("Legacy administration integration", () => {
  let server: http.Server;
  let baseUrl: string;
  let token: string;

  async function request(path: string, options: RequestInit = {}) {
    const response = await fetch(baseUrl + path, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "", ...(options.headers || {}) },
    });
    return { status: response.status, body: await response.json() };
  }

  before(async () => {
    server = http.createServer(createApp());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://localhost:${(server.address() as any).port}`;
    const login = await request("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ usuario: "admin", password: "12345" }),
    });
    token = login.body.data.token;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("exposes preserved historical balances without altering accounting data", async () => {
    const response = await request("/api/v1/legacy-administration/historical-accounts?openOnly=true");
    assert.equal(response.status, 200);
    assert.ok(response.body.data.accounts.some((account: any) => account.sourceId === "88001" && account.balance === 150));
    assert.ok(response.body.data.summary.balance >= 150);
  });

  it("accepts an ambiguous record as unlinked with an atomic audit trail", async () => {
    const pending = await dbClient.execute(
      "SELECT id FROM legacy_migration_map WHERE source_table = 'food_orders' AND source_id = '88004' AND status = 'REVIEW' LIMIT 1;"
    );
    const id = Number(pending.rows[0].id);
    const response = await request(`/api/v1/legacy-administration/reviews/${id}/accept-unlinked`, {
      method: "PATCH",
      body: JSON.stringify({ reason: "Asociación ambigua revisada; se conserva únicamente como legado." }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.data.status, "SKIPPED");
    assert.equal(response.body.data.resolution, "ACCEPTED_UNLINKED");

    const audit = await dbClient.execute({
      sql: "SELECT user_id, action, new_values FROM audit_logs WHERE entity = 'legacy_migration_map' AND entity_id = ? ORDER BY id DESC LIMIT 1;",
      args: [String(id)],
    });
    assert.equal(audit.rows[0].user_id, "usr_admin_001");
    assert.equal(audit.rows[0].action, "ACCEPT_LEGACY_UNLINKED");
    assert.match(String(audit.rows[0].new_values), /Asociación ambigua/);
  });

  it("rejects resolution without a meaningful justification", async () => {
    const reviews = await request("/api/v1/legacy-administration/reviews");
    const unresolved = reviews.body.data.reviews.find((item: any) => item.status === "REVIEW");
    assert.ok(unresolved);
    const response = await request(`/api/v1/legacy-administration/reviews/${unresolved.id}/accept-unlinked`, {
      method: "PATCH",
      body: JSON.stringify({ reason: "breve" }),
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");
  });
});
