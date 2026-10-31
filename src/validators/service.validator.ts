import { z } from "zod";

const money = z.union([z.number().nonnegative(), z.string().trim().min(1)]);
const category = z.enum(["Alimentos", "Lavandería", "Hospedaje", "Minibar", "Transporte", "Otro"]);
const status = z.enum(["Registrado", "EnProceso", "Entregado", "Consumido", "Cancelado"]);

export const createCatalogSchema = z.object({
  nombre: z.string().trim().min(1).max(160), categoria: category,
  descripcion: z.string().trim().max(500).optional(), precio: money,
  impuesto: z.number().min(0).max(100).optional(), activo: z.boolean().optional(),
});
export const updateCatalogSchema = createCatalogSchema.partial().refine((value) => Object.keys(value).length > 0);
export const createConsumptionSchema = z.object({
  serviceId: z.coerce.number().int().positive(), cantidad: z.coerce.number().int().positive(),
  precioUnitario: money.optional(), observaciones: z.string().trim().max(1000).optional(), estado: status.optional(),
});
export const updateConsumptionStatusSchema = z.object({ estado: status });

export const updateConsumptionSchema = z.object({
  cantidad: z.coerce.number().int().positive().optional(),
  precioUnitario: money.optional(),
  observaciones: z.string().trim().max(1000).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "Debe enviar al menos un campo",
});
