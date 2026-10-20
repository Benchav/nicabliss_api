import { UserRole } from "../models/user.model.js";
import { UserResponseDto } from "./auth.dto.js";

export { UserResponseDto };

export interface CreateUserDto {
  username: string;
  email: string;
  password: string;
  fullName: string;
  role?: UserRole;
}

export interface UpdateUserDto {
  username?: string;
  email?: string;
  password?: string;
  fullName?: string;
  role?: UserRole;
}
