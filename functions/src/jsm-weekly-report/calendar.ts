import { parse } from "csv-parse/sync";
import { requireValue } from "./model";

const DAY = 86_400_000;
export function localDate(time: number): string {
  return new Date(time + 8 * 3_600_000).toISOString().slice(0, 10);
}
export function validDate(date: unknown): date is string {
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}
export function shiftDate(date: string, days: number): string {
  requireValue(validDate(date));
  return new Date(Date.parse(date) + days * DAY).toISOString().slice(0, 10);
}
export function weekStart(date: string): string {
  requireValue(validDate(date));
  return shiftDate(date, -((new Date(date).getUTCDay() + 6) % 7));
}
export function cutoffAt(date: string): string {
  requireValue(validDate(date));
  return new Date(`${date}T17:30:00+08:00`).toISOString();
}
export function initialStart(date: string): string {
  return cutoffAt(shiftDate(weekStart(date), -3));
}

export function lastWorkday(monday: string, days: Record<string, boolean>): string | null {
  let last: string | null = null;
  for (let i = 0; i < 7; i++) {
    const date = shiftDate(monday, i);
    requireValue(typeof days[date] === "boolean", "CALENDAR_MISSING", 503);
    if (days[date]) last = date;
  }
  return last;
}

// 若更新後的最後工作日已過，保留先前預定日，涵蓋臨時停班。
export function plannedDate(today: string, latest: string | null, previous: string | null): string | null {
  if (latest && latest >= today) return latest;
  if (previous && previous >= today) return previous;
  return latest;
}

export function parseGovernmentCalendar(csv: string, year: number): Record<string, boolean> {
  requireValue(Number.isInteger(year) && year >= 2000 && year <= 2100, "INVALID_CALENDAR");
  const rows = parse(csv, { bom: true, columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
  const days: Record<string, boolean> = {};
  for (const row of rows) {
    const raw = row["西元日期"];
    requireValue(typeof raw === "string" && /^\d{8}$/.test(raw), "INVALID_CALENDAR");
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    requireValue(validDate(date) && date.startsWith(`${year}-`) && !(date in days), "INVALID_CALENDAR");
    requireValue(row["是否放假"] === "0" || row["是否放假"] === "2", "INVALID_CALENDAR");
    days[date] = row["是否放假"] === "0";
  }
  for (let date = `${year}-01-01`; date.startsWith(`${year}-`); date = shiftDate(date, 1)) {
    requireValue(typeof days[date] === "boolean", "INCOMPLETE_CALENDAR");
  }
  return days;
}
