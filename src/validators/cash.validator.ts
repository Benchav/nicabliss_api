import { z } from "zod";

const amount = z.number().finite().nonnegative().max(1_000_000_000)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7, "El monto admite máximo dos decimales");

export const openCashSchema = z.object({
  fondoInicial: amount,
});

export const addCashMovementSchema = z.object({
  tipo: z.enum(["Ingreso", "Salida"]),
  concepto: z.enum(["Hospedaje", "Alimentos", "Lavandería", "Otro ingreso", "Gasto operativo", "Retiro de efectivo"]),
  descripcion: z.string().trim().min(1).max(500),
  metodo: z.enum(["Efectivo", "Transferencia", "Tarjeta"]),
  monto: amount.positive(),
});

export const closeCashSchema = z.object({
  efectivoContado: amount,
  observaciones: z.string().trim().max(500).optional(),
});
