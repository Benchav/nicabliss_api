import { z } from "zod";

export const loginSchema = z
  .object({
    usuario: z.string().trim().min(1).optional(),
    username: z.string().trim().min(1).optional(),
    password: z.string().min(1),
  })
  .refine((value) => Boolean(value.usuario || value.username), {
    message: "El usuario es obligatorio",
    path: ["usuario"],
  });

export const registerSchema = z.object({
  username: z.string().trim().min(3).max(80),
  email: z.string().trim().email().max(254),
  password: z.string().min(4).max(128),
  fullName: z.string().trim().min(1).max(160).optional(),
  role: z.enum(["ADMIN", "RECEPTIONIST", "STAFF"]).optional(),
});
