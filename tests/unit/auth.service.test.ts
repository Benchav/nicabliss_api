import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { AuthService } from "../../src/services/auth.service.js";
import { UserRepository } from "../../src/repositories/user.repository.js";
import { JwtProvider } from "../../src/utils/jwt.js";

describe("AuthService Unit Tests", () => {
  let userRepo: UserRepository;
  let authService: AuthService;

  beforeEach(async () => {
    userRepo = new UserRepository();
    await userRepo.reset();
    authService = new AuthService(userRepo);
  });

  it("debe iniciar sesión exitosamente con credenciales válidas (admin / 12345)", async () => {
    const res = await authService.login({
      usuario: "admin",
      password: "12345",
    });

    assert.ok(res.token, "Debe retornar un token JWT");
    assert.equal(res.user.username, "admin");
    assert.equal(res.user.role, "ADMIN");

    const decoded = JwtProvider.verify(res.token);
    assert.equal(decoded.username, "admin");
    assert.equal(decoded.role, "ADMIN");
  });

  it("debe rechazar el inicio de sesión con contraseña incorrecta", async () => {
    await assert.rejects(
      async () => {
        await authService.login({
          usuario: "admin",
          password: "password_incorrecta",
        });
      },
      (err: any) => {
        assert.equal(err.statusCode, 401);
        assert.equal(err.code, "UNAUTHORIZED");
        return true;
      }
    );
  });

  it("debe rechazar usuario no existente", async () => {
    await assert.rejects(
      async () => {
        await authService.login({
          usuario: "usuario_fantasma",
          password: "cualquiera",
        });
      },
      (err: any) => {
        assert.equal(err.statusCode, 401);
        return true;
      }
    );
  });

  it("debe registrar un nuevo usuario con contraseña hasheada", async () => {
    const nuevo = await authService.register({
      username: "recepcionista1",
      email: "recepcion@nicabliss.com",
      password: "claveSegura2026",
      fullName: "Recepcionista Turno A",
      role: "RECEPTIONIST",
    });

    assert.equal(nuevo.username, "recepcionista1");
    assert.equal(nuevo.role, "RECEPTIONIST");

    // Verificar que puede iniciar sesión
    const login = await authService.login({
      usuario: "recepcionista1",
      password: "claveSegura2026",
    });

    assert.ok(login.token);
  });

  it("debe rechazar registro con username duplicado", async () => {
    await assert.rejects(
      async () => {
        await authService.register({
          username: "admin",
          email: "admin2@nicabliss.com",
          password: "password123!",
          fullName: "Admin Duplicado",
        });
      },
      (err: any) => {
        assert.equal(err.statusCode, 409);
        assert.equal(err.code, "CONFLICT");
        return true;
      }
    );
  });
});
