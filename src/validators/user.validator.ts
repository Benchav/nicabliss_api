import { z } from "zod";

const role = z.enum(["ADMIN", "RECEPTIONIST", "STAFF"]);
const username = z.string().trim().min(3).max(80);
const email = z.string().trim().email().max(254);
const password = z.string().min(12).max(128);
const fullName = z.string().trim().min(1).max(160);

export const createUserSchema = z.object({
  username,
  email,
  password,
  fullName,
  role: role.optional(),
});

export const updateUserSchema = z.object({
  username: username.optional(),
  email: email.optional(),
  password: password.optional(),
  fullName: fullName.optional(),
  role: role.optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "Debe enviar al menos un campo",
});
