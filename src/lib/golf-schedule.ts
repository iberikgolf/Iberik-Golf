export const TEE_START_MINUTES = 8 * 60 + 30; // 08:30
export const TEE_END_MINUTES = 19 * 60; // 19:00
export const TEE_INTERVAL_MINUTES = 10;
export const MAX_PLAYERS_PER_FLIGHT = 4;
export const ROUND_9_HOLES_DURATION_MINUTES = 120; // 2 horas aprox. para completar 9 hoyos
export const VEHICLE_ROUND_DURATION_MINUTES = 240; // 4 horas aprox. para completar 18 hoyos
export const GUITIRIZ_CROSSOVER_OFFSET_MINUTES = 120; // 2 horas de cruce para paso por hoyo 9

export function getRoundDurationMinutes(holes: number): number {
  return holes === 9 ? ROUND_9_HOLES_DURATION_MINUTES : VEHICLE_ROUND_DURATION_MINUTES;
}

export const ACADEMY_INSTRUCTOR = 'Víctor López';
export const ACADEMY_MAX_STUDENTS = 4;
export const ACADEMY_MORNING_SLOTS = ['11:00', '11:30', '12:00', '12:30', '13:00', '13:30'] as const;
export const ACADEMY_AFTERNOON_SLOTS = ['16:00', '16:30', '17:00', '17:30'] as const;
export const ACADEMY_ALL_SLOTS: readonly string[] = [
  ...ACADEMY_MORNING_SLOTS,
  ...ACADEMY_AFTERNOON_SLOTS,
];

export function minutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMinutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function timeToMinutes(hhmm: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return -1;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return -1;
  return h * 60 + m;
}

export function generateTeeTimeSlots(): string[] {
  const slots: string[] = [];
  for (let mins = TEE_START_MINUTES; mins <= TEE_END_MINUTES; mins += TEE_INTERVAL_MINUTES) {
    slots.push(minutesToTime(mins));
  }
  return slots;
}

export const TEE_TIME_SLOTS = generateTeeTimeSlots();

export function isValidTeeTimeSlot(slotTime: string): boolean {
  return TEE_TIME_SLOTS.includes(slotTime);
}

export function getOffsetTeeTimeSlot(slotTime: string, deltaMinutes: number): string | null {
  const base = timeToMinutes(slotTime);
  if (base < 0) return null;
  const target = base + deltaMinutes;
  if (target < TEE_START_MINUTES || target > TEE_END_MINUTES) return null;
  const candidate = minutesToTime(target);
  return isValidTeeTimeSlot(candidate) ? candidate : null;
}

export function addMinutesToTime(hhmm: string, deltaMinutes: number): string {
  const base = timeToMinutes(hhmm);
  if (base < 0) return hhmm;
  return minutesToTime(base + deltaMinutes);
}

export function timesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  const a0 = timeToMinutes(startA);
  const a1 = timeToMinutes(endA);
  const b0 = timeToMinutes(startB);
  const b1 = timeToMinutes(endB);
  if (a0 < 0 || a1 < 0 || b0 < 0 || b1 < 0) return false;
  return a0 < b1 && b0 < a1;
}

export function isValidIsoDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const dt = new Date(`${dateStr}T12:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === dateStr;
}

export function isWednesdayIsoDate(dateStr: string): boolean {
  if (!isValidIsoDate(dateStr)) return false;
  const dt = new Date(`${dateStr}T12:00:00Z`);
  return dt.getUTCDay() === 3;
}

export function getNextWednesdayIsoDate(fromDateStr?: string): string {
  const base =
    fromDateStr && isValidIsoDate(fromDateStr)
      ? new Date(`${fromDateStr}T12:00:00Z`)
      : new Date();
  const dt = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 12, 0, 0)
  );
  const day = dt.getUTCDay();
  const diff = (3 - day + 7) % 7;
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().slice(0, 10);
}

export function getUpcomingWednesdays(count = 6, fromDateStr?: string): string[] {
  const first = getNextWednesdayIsoDate(fromDateStr);
  const dt = new Date(`${first}T12:00:00Z`);
  const list: string[] = [];
  for (let i = 0; i < count; i++) {
    list.push(dt.toISOString().slice(0, 10));
    dt.setUTCDate(dt.getUTCDate() + 7);
  }
  return list;
}

export const COURSE_TIME_ZONE = 'Europe/Madrid';

export function getCourseTodayIsoDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: COURSE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function getTodayIsoDate(now: Date = new Date()): string {
  return getCourseTodayIsoDate(now);
}

export function getCourseCurrentMinutes(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: COURSE_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? -1);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? -1);
  if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || minute < 0) {
    return -1;
  }
  return hour * 60 + minute;
}

export function formatSpanishDate(dateStr: string): string {
  if (!isValidIsoDate(dateStr)) return dateStr;
  const dt = new Date(`${dateStr}T12:00:00Z`);
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dt);
}

export function formatEuropeanDate(dateStr: string): string {
  if (!isValidIsoDate(dateStr)) return dateStr;
  const [year, month, day] = dateStr.split('-');
  return `${day}-${month}-${year}`;
}

export function parseEuropeanDate(input: string): string | null {
  const trimmed = input.trim();
  const euMatch = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(trimmed);
  if (euMatch) {
    const [, day, month, year] = euMatch;
    const iso = `${year}-${month}-${day}`;
    return isValidIsoDate(iso) ? iso : null;
  }
  if (isValidIsoDate(trimmed)) {
    return trimmed;
  }
  return null;
}

export function formatEuropeanDateTime(input: string | Date): string {
  const dt = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(dt.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: COURSE_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(dt);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const day = get('day');
  const month = get('month');
  const year = get('year');
  const hour = get('hour');
  const minute = get('minute');
  if (!day || !month || !year) return '';
  return hour && minute ? `${day}-${month}-${year} ${hour}:${minute}` : `${day}-${month}-${year}`;
}
