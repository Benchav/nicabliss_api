import { z } from "zod";

export const createInvoiceSchema = z.object({
  stayId: z.coerce.number().int().positive(),
});

export const voidInvoiceSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
