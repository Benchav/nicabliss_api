import { UserRole } from "../models/user.model.js";

export interface LoginDto {
  usuario?: string;
  username?: string;
  password: string;
}

export interface RegisterUserDto {
  username: string;
  email: string;
  password: string;
  fullName: string;
  role?: UserRole;
}

export interface UserResponseDto {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  createdAt: string;
}

export interface LoginResponseDto {
  token: string;
  user: UserResponseDto;
}
