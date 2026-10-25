export type UserRole = "ADMIN" | "RECEPTIONIST" | "STAFF";

export interface UserModel {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  fullName: string;
  createdAt: string;
  tokenVersion: number;
}
