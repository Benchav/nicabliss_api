import { UserRepository } from "../repositories/user.repository.js";
import { LoginDto, RegisterUserDto, LoginResponseDto, UserResponseDto } from "../dtos/auth.dto.js";
import { PasswordHasher } from "../utils/hasher.js";
import { JwtProvider } from "../utils/jwt.js";

export class AuthService {
  constructor(private userRepo: UserRepository) {}

  public async login(dto: LoginDto): Promise<LoginResponseDto> {
    if (!dto.usuario || !dto.password) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "Usuario y contraseña son obligatorios" };
    }

    const user = await this.userRepo.findByUsername(dto.usuario);
    if (!user) {
      throw { statusCode: 401, code: "UNAUTHORIZED", message: "Usuario o contraseña incorrectos" };
    }

    const isValid = await PasswordHasher.compare(dto.password, user.passwordHash);
    if (!isValid) {
      throw { statusCode: 401, code: "UNAUTHORIZED", message: "Usuario o contraseña incorrectos" };
    }

    const token = JwtProvider.sign({
      sub: user.id,
      username: user.username,
      role: user.role,
      email: user.email,
    });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        createdAt: user.createdAt,
      },
    };
  }

  public async register(dto: RegisterUserDto): Promise<UserResponseDto> {
    if (!dto.username || !dto.password || !dto.email) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "Nombre de usuario, email y contraseña son obligatorios" };
    }

    const existsByUsername = await this.userRepo.findByUsername(dto.username);
    if (existsByUsername) {
      throw { statusCode: 409, code: "CONFLICT", message: `El usuario '${dto.username}' ya existe` };
    }

    const existsByEmail = await this.userRepo.findByEmail(dto.email);
    if (existsByEmail) {
      throw { statusCode: 409, code: "CONFLICT", message: `El correo '${dto.email}' ya está registrado` };
    }

    const passwordHash = await PasswordHasher.hash(dto.password);
    const newUser = {
      id: "usr_" + Math.random().toString(36).substring(2, 9),
      username: dto.username.trim(),
      email: dto.email.trim(),
      passwordHash,
      role: dto.role || "RECEPTIONIST",
      fullName: dto.fullName || dto.username,
      createdAt: new Date().toISOString(),
    };

    await this.userRepo.save(newUser);

    return {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      fullName: newUser.fullName,
      role: newUser.role,
      createdAt: newUser.createdAt,
    };
  }

  public async getProfile(userId: string): Promise<UserResponseDto> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw { statusCode: 404, code: "NOT_FOUND", message: "Usuario no encontrado" };
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      createdAt: user.createdAt,
    };
  }
}
