import { z } from "zod";

export const createCustomerSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  apellido: z.string().trim().max(120).optional(),
  documento: z.string().trim().min(3).max(80),
  telefono: z.string().trim().max(40).optional(),
  correo: z.string().trim().email().max(254).optional().or(z.literal("")),
  direccion: z.string().trim().max(300).optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "Debe enviar al menos un campo" }
);
