import type { Appointment, WorkScheduleDay } from "@/store/app-store";
import { startOfDay } from "@/lib/dates";

/** "HH:MM" → minutos desde 00:00. Retorna 0 se inválido. */
export function parseHM(s: string | undefined | null): number {
  if (!s) return 0;
  const [h, m] = s.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function fmtHM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.floor(totalMinutes % 60);
  return `${h}h ${String(m).padStart(2, "0")}min`;
}

/** Retorna a configuração do dia ou um fallback 09:00–20:00 ativo. */
export function scheduleForDay(
  schedule: WorkScheduleDay[] | undefined,
  dayOfWeek: number,
): WorkScheduleDay {
  const found = schedule?.find((d) => d.day_of_week === dayOfWeek);
  if (found) return found;
  return { day_of_week: dayOfWeek, start_time: "09:00", end_time: "20:00", is_active: true };
}

export interface DayOccupancy {
  /** dia (00:00 local) */
  date: Date;
  /** minutos disponíveis (janela do expediente) */
  totalMinutes: number;
  /** minutos efetivamente trabalhados (clamped à janela) */
  workedMinutes: number;
  /** flag: dia marcado como fechado */
  closed: boolean;
}

/**
 * Calcula ocupação do DIA dado:
 * - Se schedule.is_active=false → totalMinutes=0, workedMinutes=0, closed=true.
 * - Se for hoje (today=true) e o expediente ainda não terminou,
 *   atendimentos sem ended_at usam Date.now() como fim.
 * - Cada atendimento é "clampado" para a janela [inicio_expediente, fim_expediente].
 */
export function dayOccupancy(
  date: Date,
  appointments: Appointment[],
  schedule: WorkScheduleDay[] | undefined,
  now: Date = new Date(),
): DayOccupancy {
  const dayStart = startOfDay(date);
  const dow = dayStart.getDay();
  const cfg = scheduleForDay(schedule, dow);

  if (!cfg.is_active) {
    return { date: dayStart, totalMinutes: 0, workedMinutes: 0, closed: true };
  }

  const startMin = parseHM(cfg.start_time);
  const endMin = parseHM(cfg.end_time);
  const totalMinutes = Math.max(0, endMin - startMin);
  if (totalMinutes <= 0) {
    return { date: dayStart, totalMinutes: 0, workedMinutes: 0, closed: false };
  }

  const winStart = new Date(dayStart);
  winStart.setMinutes(winStart.getMinutes() + startMin);
  const winEnd = new Date(dayStart);
  winEnd.setMinutes(winEnd.getMinutes() + endMin);

  const dayEnd = new Date(dayStart);
  dayEnd.setHours(23, 59, 59, 999);

  let workedMs = 0;
  for (const a of appointments) {
    const sd = new Date(a.started_at);
    if (sd < dayStart || sd > dayEnd) continue;
    const ed = a.ended_at ? new Date(a.ended_at) : now;
    const aStart = Math.max(sd.getTime(), winStart.getTime());
    const aEnd = Math.min(ed.getTime(), winEnd.getTime());
    if (aEnd > aStart) workedMs += aEnd - aStart;
  }

  return {
    date: dayStart,
    totalMinutes,
    workedMinutes: Math.round(workedMs / 60000),
    closed: false,
  };
}

export interface PeriodOccupancy {
  totalMinutes: number;
  workedMinutes: number;
  idleMinutes: number;
  occupancyPct: number; // 0..100
  daysOpen: number;
  perDay: DayOccupancy[];
}

/**
 * Soma a ocupação dia a dia entre `from` e `to` (inclusive).
 * Dias fechados não contam para o total.
 */
export function periodOccupancy(
  from: Date,
  to: Date,
  appointments: Appointment[],
  schedule: WorkScheduleDay[] | undefined,
  now: Date = new Date(),
): PeriodOccupancy {
  const start = startOfDay(from).getTime();
  const end = startOfDay(to).getTime();
  const perDay: DayOccupancy[] = [];
  let total = 0;
  let worked = 0;
  let daysOpen = 0;

  for (let t = start; t <= end; t += 86400000) {
    const d = new Date(t);
    const occ = dayOccupancy(d, appointments, schedule, now);
    perDay.push(occ);
    if (!occ.closed) {
      total += occ.totalMinutes;
      worked += occ.workedMinutes;
      if (occ.totalMinutes > 0) daysOpen += 1;
    }
  }

  const occupancyPct = total > 0 ? Math.min(100, (worked / total) * 100) : 0;
  return {
    totalMinutes: total,
    workedMinutes: worked,
    idleMinutes: Math.max(0, total - worked),
    occupancyPct,
    daysOpen,
    perDay,
  };
}

export interface DayGaps {
  /** minutos ociosos REAIS dentro do expediente (somatório dos gaps entre atendimentos + bordas) */
  idleMinutes: number;
  /** maior intervalo contínuo sem cliente, em minutos */
  longestGapMinutes: number;
  /** quantidade de gaps (intervalos sem cliente) */
  gapsCount: number;
}

/**
 * Calcula tempo ocioso REAL do dia somando os intervalos entre atendimentos
 * (e bordas: início do expediente até primeiro atendimento, e último até "agora" ou fim).
 */
export function dayGaps(
  date: Date,
  appointments: Appointment[],
  schedule: WorkScheduleDay[] | undefined,
  now: Date = new Date(),
): DayGaps {
  const dayStart = startOfDay(date);
  const dow = dayStart.getDay();
  const cfg = scheduleForDay(schedule, dow);
  if (!cfg.is_active) return { idleMinutes: 0, longestGapMinutes: 0, gapsCount: 0 };

  const startMin = parseHM(cfg.start_time);
  const endMin = parseHM(cfg.end_time);
  if (endMin <= startMin) return { idleMinutes: 0, longestGapMinutes: 0, gapsCount: 0 };

  const winStart = new Date(dayStart);
  winStart.setMinutes(winStart.getMinutes() + startMin);
  const winEnd = new Date(dayStart);
  winEnd.setMinutes(winEnd.getMinutes() + endMin);

  const dayEnd = new Date(dayStart);
  dayEnd.setHours(23, 59, 59, 999);

  // intervalos do dia, clampados, ordenados, e mesclados (caso se sobreponham)
  const ranges: Array<[number, number]> = [];
  for (const a of appointments) {
    const sd = new Date(a.started_at);
    if (sd < dayStart || sd > dayEnd) continue;
    const ed = a.ended_at ? new Date(a.ended_at) : now;
    const s = Math.max(sd.getTime(), winStart.getTime());
    const e = Math.min(ed.getTime(), winEnd.getTime());
    if (e > s) ranges.push([s, e]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }

  // limite superior do "ocioso": agora (se hoje) ou fim do expediente
  const isToday = startOfDay(now).getTime() === dayStart.getTime();
  const upper = isToday ? Math.min(now.getTime(), winEnd.getTime()) : winEnd.getTime();
  if (upper <= winStart.getTime()) return { idleMinutes: 0, longestGapMinutes: 0, gapsCount: 0 };

  let cursor = winStart.getTime();
  let idleMs = 0;
  let longest = 0;
  let count = 0;
  for (const [s, e] of merged) {
    if (s > cursor) {
      const gap = s - cursor;
      if (gap > 60_000) {
        // ignora micro-gaps < 1min
        idleMs += gap;
        longest = Math.max(longest, gap);
        count += 1;
      }
    }
    cursor = Math.max(cursor, e);
  }
  if (upper > cursor) {
    const gap = upper - cursor;
    if (gap > 60_000) {
      idleMs += gap;
      longest = Math.max(longest, gap);
      count += 1;
    }
  }

  return {
    idleMinutes: Math.round(idleMs / 60000),
    longestGapMinutes: Math.round(longest / 60000),
    gapsCount: count,
  };
}
