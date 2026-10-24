import { UserRepository } from "../repositories/user.repository.js";
import { CreateUserDto, UpdateUserDto, UserResponseDto } from "../dtos/user.dto.js";
import { UserModel, UserRole } from "../models/user.model.js";
import { PasswordHasher } from "../utils/hasher.js";
import { randomUUID } from "crypto";

const VALID_ROLES: UserRole[] = ["ADMIN", "RECEPTIONIST", "STAFF"];

export class UserService {
  constructor(private userRepo: UserRepository) {}

  private mapToResponse(user: UserModel): UserResponseDto {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      createdAt: user.createdAt,
    };
  }

  public async getAll(): Promise<UserResponseDto[]> {
    const users = await this.userRepo.findAll();
    return users.map((u) => this.mapToResponse(u));
  }

  public async getById(id: string): Promise<UserResponseDto> {
    const user = await this.userRepo.findById(id);
    if (!user) {
      throw { statusCode: 404, code: "NOT_FOUND", message: `Usuario con ID '${id}' no encontrado` };
    }
    return this.mapToResponse(user);
  }

  public async create(dto: CreateUserDto): Promise<UserResponseDto> {
    if (!dto.username || !dto.email || !dto.password) {
      throw {
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Nombre de usuario, email y contraseña son obligatorios",
      };
    }

    if (dto.password.trim().length < 4) {
      throw {
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "La contraseña debe tener al menos 4 caracteres",
      };
    }

    const role: UserRole = dto.role || "RECEPTIONIST";
    if (!VALID_ROLES.includes(role)) {
      throw {
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: `Rol inválido. Valores permitidos: ${VALID_ROLES.join(", ")}`,
      };
    }

    const usernameConflict = await this.userRepo.findByUsername(dto.username);
    if (usernameConflict) {
      throw { statusCode: 409, code: "CONFLICT", message: `El usuario '${dto.username}' ya existe` };
    }

    const emailConflict = await this.userRepo.findByEmail(dto.email);
    if (emailConflict) {
      throw { statusCode: 409, code: "CONFLICT", message: `El correo '${dto.email}' ya está registrado` };
    }

    const passwordHash = await PasswordHasher.hash(dto.password);
    const newUser: UserModel = {
      id: `usr_${randomUUID()}`,
      username: dto.username.trim(),
      email: dto.email.trim().toLowerCase(),
      passwordHash,
      role,
      fullName: dto.fullName?.trim() || dto.username.trim(),
      createdAt: new Date().toISOString(),
    };

    await this.userRepo.save(newUser);
    return this.mapToResponse(newUser);
  }

  public async update(id: string, dto: UpdateUserDto, _currentUserId?: string): Promise<UserResponseDto> {
    const user = await this.userRepo.findById(id);
    if (!user) {
      throw { statusCode: 404, code: "NOT_FOUND", message: `Usuario con ID '${id}' no encontrado` };
    }

    const isRootAdmin = user.id === "usr_admin_001" || user.username.toLowerCase() === "admin";

    // Validar protecciones de Root Admin
    if (isRootAdmin) {
      if (dto.role && dto.role !== "ADMIN") {
        throw {
          statusCode: 400,
          code: "PROTECTED_RESOURCE",
          message: "No se puede degradar o modificar el rol del administrador principal del sistema",
        };
      }
      if (dto.username && dto.username.trim().toLowerCase() !== "admin") {
        throw {
          statusCode: 400,
          code: "PROTECTED_RESOURCE",
          message: "No se puede cambiar el nombre de usuario del administrador principal",
        };
      }
    }

    // Validar rol si se proporciona
    if (dto.role) {
      if (!VALID_ROLES.includes(dto.role)) {
        throw {
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: `Rol inválido. Valores permitidos: ${VALID_ROLES.join(", ")}`,
        };
      }
      user.role = dto.role;
    }

    // Validar cambio de username
    if (dto.username && dto.username.trim().toLowerCase() !== user.username.toLowerCase()) {
      const existing = await this.userRepo.findByUsername(dto.username);
      if (existing && existing.id !== user.id) {
        throw {
          statusCode: 409,
          code: "CONFLICT",
          message: `El nombre de usuario '${dto.username}' ya está en uso`,
        };
      }
      user.username = dto.username.trim();
    }

    // Validar cambio de email
    if (dto.email && dto.email.trim().toLowerCase() !== user.email.toLowerCase()) {
      const existing = await this.userRepo.findByEmail(dto.email);
      if (existing && existing.id !== user.id) {
        throw {
          statusCode: 409,
          code: "CONFLICT",
          message: `El correo '${dto.email}' ya está registrado por otro usuario`,
        };
      }
      user.email = dto.email.trim().toLowerCase();
    }

    // Validar cambio de contraseña
    if (dto.password) {
      if (dto.password.trim().length < 4) {
        throw {
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "La contraseña debe tener al menos 4 caracteres",
        };
      }
      user.passwordHash = await PasswordHasher.hash(dto.password);
    }

    // Validar nombre completo
    if (dto.fullName !== undefined) {
      user.fullName = dto.fullName.trim();
    }

    await this.userRepo.save(user);
    return this.mapToResponse(user);
  }

  public async delete(id: string, currentUserId?: string): Promise<void> {
    const user = await this.userRepo.findById(id);
    if (!user) {
      throw { statusCode: 404, code: "NOT_FOUND", message: `Usuario con ID '${id}' no encontrado` };
    }

    if (currentUserId && (user.id === currentUserId || user.username === currentUserId)) {
      throw {
        statusCode: 400,
        code: "FORBIDDEN_OPERATION",
        message: "No puedes eliminar tu propia cuenta de usuario activa",
      };
    }

    if (user.id === "usr_admin_001" || user.username.toLowerCase() === "admin") {
      throw {
        statusCode: 400,
        code: "PROTECTED_RESOURCE",
        message: "El administrador principal del sistema no puede ser eliminado",
      };
    }

    await this.userRepo.delete(id);
  }
}
