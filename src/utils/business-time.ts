export interface UtcRange {
  startUtc: string;
  endUtc: string;
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function zonedParts(value: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get("year"), month: get("month"), day: get("day"),
    hour: get("hour"), minute: get("minute"), second: get("second"),
  };
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

export function businessClockParts(now: Date, timeZone: string) {
  const parts = zonedParts(now, timeZone);
  const date = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  return {
    date,
    time: `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`,
    dayOfWeek: new Date(`${date}T12:00:00.000Z`).getUTCDay(),
  };
}

export function businessToday(timeZone: string, now = new Date()): string {
  return businessClockParts(now, timeZone).date;
}

export function formatBusinessDateTime(value: Date | string, timeZone: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("La fecha no es válida");
  return new Intl.DateTimeFormat("es-NI", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function zonedStartOfDayUtc(date: string, timeZone: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const desired = Date.UTC(year, month - 1, day, 0, 0, 0);
  let candidate = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = zonedParts(new Date(candidate), timeZone);
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const difference = represented - desired;
    if (difference === 0) break;
    candidate -= difference;
  }
  return new Date(candidate).toISOString();
}

export function businessDateRange(from: string, to: string, timeZone: string): UtcRange {
  return {
    startUtc: zonedStartOfDayUtc(from, timeZone),
    endUtc: zonedStartOfDayUtc(addDays(to, 1), timeZone),
  };
}

export function businessMonthRanges(year: number, timeZone: string): Array<UtcRange & { month: number }> {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    return {
      month,
      startUtc: zonedStartOfDayUtc(`${year}-${String(month).padStart(2, "0")}-01`, timeZone),
      endUtc: zonedStartOfDayUtc(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01`, timeZone),
    };
  });
}
