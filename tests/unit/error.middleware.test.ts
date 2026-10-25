import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { errorMiddleware } from "../../src/middlewares/error.middleware.js";

function responseDouble() {
  let statusCode = 0;
  let body: any;
  const response = {
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { body = value; return this; },
  };
  return { response, read: () => ({ statusCode, body }) };
}

describe("Error middleware", () => {
  it("does not expose internal database messages or details", () => {
    const target = responseDouble();
    errorMiddleware(
      Object.assign(new Error("SQLITE_CONSTRAINT: users.password_hash"), { details: { table: "users" } }),
      {} as any,
      target.response as any,
      (() => undefined) as any
    );
    const result = target.read();
    assert.equal(result.statusCode, 500);
    assert.equal(result.body.error.code, "INTERNAL_ERROR");
    assert.equal(result.body.error.message, "Error interno del servidor");
    assert.equal(result.body.error.details, undefined);
    assert.doesNotMatch(JSON.stringify(result.body), /password_hash|SQLITE/);
  });

  it("preserves controlled validation errors", () => {
    const target = responseDouble();
    errorMiddleware(
      { statusCode: 400, code: "VALIDATION_ERROR", message: "Dato inválido", details: [{ field: "name" }] },
      {} as any,
      target.response as any,
      (() => undefined) as any
    );
    const result = target.read();
    assert.equal(result.statusCode, 400);
    assert.equal(result.body.error.message, "Dato inválido");
    assert.deepEqual(result.body.error.details, [{ field: "name" }]);
  });
});
