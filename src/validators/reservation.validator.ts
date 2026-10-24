import { z } from "zod";

const moneyValue = z.union([z.number().positive(), z.string().trim().min(1)]);

export const createReservationSchema = z.object({
  customerId: z.coerce.number().int().positive(),
  roomId: z.coerce.number().int().positive(),
  fechaEntrada: z.string().trim(),
  fechaSalida: z.string().trim(),
  totalReserva: moneyValue,
  depositType: z.enum(["PERCENTAGE", "FIXED"]).default("PERCENTAGE"),
  depositValue: z.union([z.number().nonnegative(), z.string().trim().min(1)]).default(50),
  observaciones: z.string().trim().max(1000).optional(),
});

export const updateReservationSchema = z.object({
  roomId: z.coerce.number().int().positive().optional(),
  fechaEntrada: z.string().trim().optional(),
  fechaSalida: z.string().trim().optional(),
  totalReserva: moneyValue.optional(),
  observaciones: z.string().trim().max(1000).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "Debe enviar al menos un campo",
});

export const updateReservationStatusSchema = z.object({
  estado: z.enum(["Pendiente", "Confirmada", "Cancelada", "CheckIn", "Finalizada", "NoShow"]),
});

export const createPaymentSchema = z.object({
  amount: moneyValue,
  paymentMethod: z.enum(["Efectivo", "Tarjeta", "Transferencia"]),
  reference: z.string().trim().max(160).optional(),
});

export const voidPaymentSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
