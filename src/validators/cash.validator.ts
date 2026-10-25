import { z } from "zod";

const amount = z.number().finite().nonnegative().max(1_000_000_000);

export const openCashSchema = z.object({
  responsable: z.string().trim().min(1).max(160),
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
