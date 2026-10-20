import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { UserService } from "../../src/services/user.service.js";
import { UserRepository } from "../../src/repositories/user.repository.js";
import { PasswordHasher } from "../../src/utils/hasher.js";

describe("UserService Unit Tests (Senior Guardrails & RBAC)", () => {
  let userRepo: UserRepository;
  let userService: UserService;

  beforeEach(async () => {
    userRepo = new UserRepository();
    await userRepo.reset();
    userService = new UserService(userRepo);
  });

  it("debe listar todos los usuarios sin exponer contraseñas", async () => {
    const list = await userService.getAll();
    assert.ok(Array.isArray(list));
    assert.ok(list.length >= 1);
    for (const u of list) {
      assert.ok(u.id);
      assert.ok(u.username);
      assert.ok(u.role);
      assert.equal((u as any).passwordHash, undefined, "No debe incluir passwordHash");
      assert.equal((u as any).password, undefined, "No debe incluir password");
    }
  });

  it("debe obtener un usuario por su ID", async () => {
    const admin = await userRepo.findByUsername("admin");
    assert.ok(admin);

    const user = await userService.getById(admin.id);
    assert.equal(user.id, admin.id);
    assert.equal(user.username, "admin");
    assert.equal(user.role, "ADMIN");
  });

  it("debe rechazar con 404 al buscar un ID inexistente", async () => {
    await assert.rejects(
      async () => {
        await userService.getById("usr_inexistente_999");
      },
      (err: any) => {
        assert.equal(err.statusCode, 404);
        assert.equal(err.code, "NOT_FOUND");
        return true;
      }
    );
  });

  it("debe crear un nuevo usuario con rol asignado y password cifrado", async () => {
    const created = await userService.create({
      username: "juan_recepcion",
      email: "juan@nicabliss.com",
      password: "password123",
      fullName: "Juan Pérez",
      role: "RECEPTIONIST",
    });

    assert.ok(created.id.startsWith("usr_"));
    assert.equal(created.username, "juan_recepcion");
    assert.equal(created.email, "juan@nicabliss.com");
    assert.equal(created.role, "RECEPTIONIST");
    assert.equal(created.fullName, "Juan Pérez");

    // Verificar en BD que la contraseña está hasheada
    const dbUser = await userRepo.findById(created.id);
    assert.ok(dbUser);
    assert.notEqual(dbUser.passwordHash, "password123");
    const valid = await PasswordHasher.compare("password123", dbUser.passwordHash);
    assert.equal(valid, true);
  });

  it("debe rechazar creación con rol inválido", async () => {
    await assert.rejects(
      async () => {
        await userService.create({
          username: "invalido",
          email: "invalido@test.com",
          password: "password123",
          fullName: "Invalido",
          role: "SUPER_GOD" as any,
        });
      },
      (err: any) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, "VALIDATION_ERROR");
        return true;
      }
    );
  });

  it("debe rechazar creación con contraseña menor a 4 caracteres", async () => {
    await assert.rejects(
      async () => {
        await userService.create({
          username: "corto",
          email: "corto@test.com",
          password: "12",
          fullName: "Corto",
        });
      },
      (err: any) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, "VALIDATION_ERROR");
        return true;
      }
    );
  });

  it("debe rechazar creación con username duplicado", async () => {
    await assert.rejects(
      async () => {
        await userService.create({
          username: "admin",
          email: "otro_admin@nicabliss.com",
          password: "password123",
          fullName: "Admin Fake",
        });
      },
      (err: any) => {
        assert.equal(err.statusCode, 409);
        assert.equal(err.code, "CONFLICT");
        return true;
      }
    );
  });

  it("debe actualizar información y rol de un usuario existente", async () => {
    const created = await userService.create({
      username: "carlos_staff",
      email: "carlos@nicabliss.com",
      password: "password123",
      fullName: "Carlos Personal",
      role: "STAFF",
    });

    const updated = await userService.update(created.id, {
      fullName: "Carlos Promovido",
      role: "RECEPTIONIST",
    });

    assert.equal(updated.fullName, "Carlos Promovido");
    assert.equal(updated.role, "RECEPTIONIST");
  });

  it("debe impedir degradar el rol del administrador principal raíz", async () => {
    const admin = await userRepo.findByUsername("admin");
    assert.ok(admin);

    await assert.rejects(
      async () => {
        await userService.update(admin.id, { role: "STAFF" });
      },
      (err: any) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, "PROTECTED_RESOURCE");
        return true;
      }
    );
  });

  it("debe impedir renombrar el username del administrador raíz", async () => {
    const admin = await userRepo.findByUsername("admin");
    assert.ok(admin);

    await assert.rejects(
      async () => {
        await userService.update(admin.id, { username: "superadmin" });
      },
      (err: any) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, "PROTECTED_RESOURCE");
        return true;
      }
    );
  });

  it("debe impedir eliminar al administrador principal del sistema", async () => {
    const admin = await userRepo.findByUsername("admin");
    assert.ok(admin);

    await assert.rejects(
      async () => {
        await userService.delete(admin.id, "otro_admin_id");
      },
      (err: any) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, "PROTECTED_RESOURCE");
        return true;
      }
    );
  });

  it("debe impedir auto-eliminación de la propia cuenta activa", async () => {
    const user = await userService.create({
      username: "sub_admin",
      email: "subadmin@nicabliss.com",
      password: "password123",
      fullName: "Sub Administrador",
      role: "ADMIN",
    });

    await assert.rejects(
      async () => {
        // Intenta eliminarse a sí mismo pasando su propio user ID
        await userService.delete(user.id, user.id);
      },
      (err: any) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, "FORBIDDEN_OPERATION");
        return true;
      }
    );
  });

  it("debe permitir eliminar un usuario regular por un administrador distinto", async () => {
    const user = await userService.create({
      username: "eliminar_me",
      email: "eliminar@nicabliss.com",
      password: "password123",
      fullName: "Para Borrar",
      role: "STAFF",
    });

    await userService.delete(user.id, "usr_admin_001");

    const search = await userRepo.findById(user.id);
    assert.equal(search, null, "El usuario debe haber sido eliminado");
  });
});
