export type AttendanceStatus = "Presente" | "Tarde" | "Ausente" | "Permiso" | "Incapacidad";

export interface AttendanceRecordModel {
  id: number;
  userId: string;
  userName: string;
  attendanceDate: string;
  checkIn?: string;
  checkOut?: string;
  status: AttendanceStatus;
  justification?: string;
  registeredBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface StaffScheduleModel {
  id: number;
  userId: string;
  userName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  active: boolean;
}
