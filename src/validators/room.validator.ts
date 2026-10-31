import { z } from "zod";

const money = z.union([z.number().nonnegative(), z.string().trim().min(1)]);

export const createRoomSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().max(80).optional(),
  description: z.string().trim().max(500).optional(),
  pricePerNight: money.optional(),
  active: z.boolean().optional(),
});

export const updateRoomSchema = createRoomSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Debe enviar al menos un campo",
  });
