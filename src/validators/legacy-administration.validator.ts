import { z } from "zod";

export const acceptLegacyUnlinkedSchema = z.object({
  reason: z.string().trim().min(10, "La justificación debe tener al menos 10 caracteres").max(500),
});
