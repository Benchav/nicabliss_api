import { z } from "zod";

const status = z.enum(["Presente", "Tarde", "Ausente", "Permiso", "Incapacidad"]);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const absenceSchema = z.object({
  userId: z.string().min(1), attendanceDate: date,
  status: z.enum(["Ausente", "Permiso", "Incapacidad"]),
  justification: z.string().trim().min(3).max(500),
});

export const updateAttendanceSchema = z.object({
  checkIn: z.string().datetime().nullable().optional(),
  checkOut: z.string().datetime().nullable().optional(),
  status: status.optional(),
  justification: z.string().trim().max(500).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "Debe enviar al menos un campo");

export const scheduleSchema = z.object({
  userId: z.string().min(1), dayOfWeek: z.number().int().min(0).max(6),
  startTime: time, endTime: time, active: z.boolean().optional(),
}).refine((value) => value.endTime > value.startTime, { message: "La salida debe ser posterior a la entrada", path: ["endTime"] });
