import { dbClient } from "../db/client.js";
import { AttendanceRecordModel, AttendanceStatus, StaffScheduleModel } from "../models/attendance.model.js";

const recordSelect = `SELECT ar.*, u.full_name AS user_name FROM attendance_records ar JOIN users u ON u.id = ar.user_id`;
const scheduleSelect = `SELECT ss.*, u.full_name AS user_name FROM staff_schedules ss JOIN users u ON u.id = ss.user_id`;

function mapRecord(row: Record<string, unknown>): AttendanceRecordModel {
  return { id: Number(row.id), userId: String(row.user_id), userName: String(row.user_name),
    attendanceDate: String(row.attendance_date), checkIn: row.check_in ? String(row.check_in) : undefined,
    checkOut: row.check_out ? String(row.check_out) : undefined, status: row.status as AttendanceStatus,
    justification: row.justification ? String(row.justification) : undefined,
    registeredBy: String(row.registered_by), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}

function mapSchedule(row: Record<string, unknown>): StaffScheduleModel {
  return { id: Number(row.id), userId: String(row.user_id), userName: String(row.user_name),
    dayOfWeek: Number(row.day_of_week), startTime: String(row.start_time), endTime: String(row.end_time), active: Number(row.active) === 1 };
}

export class AttendanceRepository {
  public async findRecord(userId: string, date: string) {
    const result = await dbClient.execute({ sql: `${recordSelect} WHERE ar.user_id = ? AND ar.attendance_date = ? LIMIT 1;`, args: [userId, date] });
    return result.rows[0] ? mapRecord(result.rows[0] as Record<string, unknown>) : null;
  }
  public async getSchedule(userId: string, day: number) {
    const result = await dbClient.execute({ sql: `${scheduleSelect} WHERE ss.user_id = ? AND ss.day_of_week = ? AND ss.active = 1 LIMIT 1;`, args: [userId, day] });
    return result.rows[0] ? mapSchedule(result.rows[0] as Record<string, unknown>) : null;
  }
  public async checkIn(userId: string, date: string, now: string, status: AttendanceStatus) {
    try {
      await dbClient.execute({ sql: `INSERT INTO attendance_records (user_id, attendance_date, check_in, status, registered_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?);`, args: [userId, date, now, status, userId, now, now] });
    } catch (error: any) {
      if (String(error?.message).includes("UNIQUE")) throw { statusCode: 409, code: "ATTENDANCE_ALREADY_REGISTERED", message: "La entrada de hoy ya fue registrada" };
      throw error;
    }
    return (await this.findRecord(userId, date))!;
  }
  public async checkOut(userId: string, date: string, now: string) {
    const result = await dbClient.execute({ sql: "UPDATE attendance_records SET check_out = ?, updated_at = ? WHERE user_id = ? AND attendance_date = ? AND check_in IS NOT NULL AND check_out IS NULL;", args: [now, now, userId, date] });
    if (Number(result.rowsAffected) === 0) throw { statusCode: 409, code: "CHECK_IN_REQUIRED", message: "No existe una entrada pendiente de salida para hoy" };
    return (await this.findRecord(userId, date))!;
  }
  public async saveAbsence(input: { userId: string; date: string; status: AttendanceStatus; justification: string; registeredBy: string; now: string }) {
    await dbClient.execute({ sql: `INSERT INTO attendance_records (user_id, attendance_date, status, justification, registered_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, attendance_date) DO UPDATE SET status = excluded.status, justification = excluded.justification, registered_by = excluded.registered_by, updated_at = excluded.updated_at;`, args: [input.userId, input.date, input.status, input.justification, input.registeredBy, input.now, input.now] });
    return (await this.findRecord(input.userId, input.date))!;
  }
  public async findAll(filters: { from: string; to: string; userId?: string; status?: AttendanceStatus }) {
    const conditions = ["ar.attendance_date BETWEEN ? AND ?"]; const args: string[] = [filters.from, filters.to];
    if (filters.userId) { conditions.push("ar.user_id = ?"); args.push(filters.userId); }
    if (filters.status) { conditions.push("ar.status = ?"); args.push(filters.status); }
    const result = await dbClient.execute({ sql: `${recordSelect} WHERE ${conditions.join(" AND ")} ORDER BY ar.attendance_date DESC, u.full_name;`, args });
    return result.rows.map((row) => mapRecord(row as Record<string, unknown>));
  }
  public async update(id: number, values: { checkIn?: string | null; checkOut?: string | null; status?: AttendanceStatus; justification?: string | null }, userId: string) {
    const current = await dbClient.execute({ sql: "SELECT * FROM attendance_records WHERE id = ? LIMIT 1;", args: [id] });
    if (!current.rows[0]) throw { statusCode: 404, code: "NOT_FOUND", message: "Registro de asistencia no encontrado" };
    const row = current.rows[0]; const now = new Date().toISOString();
    const next = { checkIn: values.checkIn === undefined ? row.check_in : values.checkIn, checkOut: values.checkOut === undefined ? row.check_out : values.checkOut,
      status: values.status ?? row.status, justification: values.justification === undefined ? row.justification : values.justification };
    if (next.checkOut && (!next.checkIn || String(next.checkOut) < String(next.checkIn))) throw { statusCode: 400, code: "VALIDATION_ERROR", message: "La salida no puede ser anterior a la entrada" };
    await dbClient.batch([{ sql: "UPDATE attendance_records SET check_in = ?, check_out = ?, status = ?, justification = ?, updated_at = ? WHERE id = ?;", args: [next.checkIn, next.checkOut, next.status, next.justification, now, id] },
      { sql: `INSERT INTO audit_logs (user_id, action, entity, entity_id, old_values, new_values, created_at) VALUES (?, 'UPDATE', 'attendance', ?, ?, ?, ?);`, args: [userId, String(id), JSON.stringify(row), JSON.stringify(next), now] }], "write");
    const result = await dbClient.execute({ sql: `${recordSelect} WHERE ar.id = ?;`, args: [id] }); return mapRecord(result.rows[0] as Record<string, unknown>);
  }
  public async getSchedules(userId?: string) {
    const result = userId ? await dbClient.execute({ sql: `${scheduleSelect} WHERE ss.user_id = ? ORDER BY ss.day_of_week;`, args: [userId] }) : await dbClient.execute(`${scheduleSelect} ORDER BY u.full_name, ss.day_of_week;`);
    return result.rows.map((row) => mapSchedule(row as Record<string, unknown>));
  }
  public async upsertSchedule(input: { userId: string; dayOfWeek: number; startTime: string; endTime: string; active: boolean }) {
    const now = new Date().toISOString();
    await dbClient.execute({ sql: `INSERT INTO staff_schedules (user_id, day_of_week, start_time, end_time, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, day_of_week) DO UPDATE SET start_time = excluded.start_time, end_time = excluded.end_time, active = excluded.active, updated_at = excluded.updated_at;`, args: [input.userId, input.dayOfWeek, input.startTime, input.endTime, input.active ? 1 : 0, now, now] });
    return (await this.getSchedules(input.userId)).find((item) => item.dayOfWeek === input.dayOfWeek)!;
  }
}
