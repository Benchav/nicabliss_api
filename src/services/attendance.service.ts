import { AttendanceStatus } from "../models/attendance.model.js";
import { AttendanceRepository } from "../repositories/attendance.repository.js";
import { config } from "../config/env.js";
import { businessClockParts } from "../utils/business-time.js";

function localParts(now = new Date()) {
  const parts = businessClockParts(now, config.businessTimezone);
  return { date: parts.date, time: parts.time, day: parts.dayOfWeek };
}

export class AttendanceService {
  public constructor(private readonly repository: AttendanceRepository) {}
  public async checkIn(userId: string) {
    const now = new Date(); const local = localParts(now); const schedule = await this.repository.getSchedule(userId, local.day);
    const status: AttendanceStatus = schedule && local.time > schedule.startTime ? "Tarde" : "Presente";
    return this.repository.checkIn(userId, local.date, now.toISOString(), status);
  }
  public async checkOut(userId: string) { const now = new Date(); return this.repository.checkOut(userId, localParts(now).date, now.toISOString()); }
  public async absence(dto: { userId: string; attendanceDate: string; status: AttendanceStatus; justification: string }, registeredBy: string) {
    return this.repository.saveAbsence({ userId: dto.userId, date: dto.attendanceDate, status: dto.status, justification: dto.justification.trim(), registeredBy, now: new Date().toISOString() });
  }
  public async today(requesterId: string, requesterRole: string) {
    const date = localParts().date; return this.repository.findAll({ from: date, to: date, userId: requesterRole === "STAFF" ? requesterId : undefined });
  }
  public async findAll(query: { from?: string; to?: string; userId?: string; status?: AttendanceStatus }) {
    const today = localParts().date; const from = query.from ?? `${today.slice(0, 7)}-01`; const to = query.to ?? today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) throw { statusCode: 400, code: "VALIDATION_ERROR", message: "Rango de fechas inválido" };
    return this.repository.findAll({ from, to, userId: query.userId, status: query.status });
  }
  public async report(query: { from?: string; to?: string; userId?: string }) {
    const records = await this.findAll(query);
    const users = new Map<string, { userId: string; userName: string; presente: number; tarde: number; ausente: number; permiso: number; incapacidad: number; total: number }>();
    for (const record of records) {
      const row = users.get(record.userId) ?? { userId: record.userId, userName: record.userName, presente: 0, tarde: 0, ausente: 0, permiso: 0, incapacidad: 0, total: 0 };
      row[record.status.toLowerCase() as "presente"] += 1; row.total += 1; users.set(record.userId, row);
    }
    return { totals: { records: records.length, late: records.filter((item) => item.status === "Tarde").length, absences: records.filter((item) => ["Ausente", "Permiso", "Incapacidad"].includes(item.status)).length }, users: [...users.values()], records };
  }
  public async update(id: number, dto: any, userId: string) { return this.repository.update(id, dto, userId); }
  public async getSchedules(userId?: string) { return this.repository.getSchedules(userId); }
  public async saveSchedule(dto: { userId: string; dayOfWeek: number; startTime: string; endTime: string; active?: boolean }) { return this.repository.upsertSchedule({ ...dto, active: dto.active ?? true }); }
}
