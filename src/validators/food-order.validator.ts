import { z } from "zod";

const moneyValue = z.union([z.number().positive(), z.string().trim().min(1)]);
const statusValue = z.enum(["Pendiente", "En preparación", "En camino", "Entregado", "Cancelado"]);

export const createFoodOrderSchema = z.object({
  stayId: z.coerce.number().int().positive().optional(),
  reservationId: z.coerce.number().int().positive().optional(),
  huesped: z.string().trim().max(160).optional(),
  habitacion: z.string().trim().max(120).optional(),
  productos: z.string().trim().min(1).max(1000),
  total: moneyValue,
}).superRefine((value, context) => {
  if (value.stayId && value.reservationId) {
    context.addIssue({
      code: "custom",
      path: ["reservationId"],
      message: "Selecciona una estancia o una reserva, no ambas",
    });
  }
  if (!value.stayId && !value.reservationId && (!value.huesped || !value.habitacion)) {
    context.addIssue({
      code: "custom",
      path: ["huesped"],
      message: "Huésped y habitación son obligatorios para un pedido sin estancia",
    });
  }
});

export const updateFoodOrderSchema = z.object({
  huesped: z.string().trim().min(1).max(160).optional(),
  habitacion: z.string().trim().min(1).max(120).optional(),
  productos: z.string().trim().min(1).max(1000).optional(),
  total: moneyValue.optional(),
  estado: statusValue.optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "Debe enviar al menos un campo",
});

export const updateFoodOrderStatusSchema = z.object({
  estado: statusValue,
});
