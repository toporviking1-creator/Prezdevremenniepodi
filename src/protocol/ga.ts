import type { Patient } from './types';

const DAY = 86_400_000;

/** Срок беременности в днях; источник датировки. */
export interface GestationalAge {
  days: number;
  source: 'us' | 'lmp' | 'manual';
  /** Расхождение срока по ПМ и по УЗИ, дней (если известны оба). */
  discrepancyDays?: number;
}

function parseDate(s?: string): number | undefined {
  if (!s) return undefined;
  // YYYY-MM-DD трактуем как локальную полночь.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const t = m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : new Date(s).getTime();
  return Number.isNaN(t) ? undefined : t;
}

function daysBetween(fromMs: number, to: Date): number {
  // Считаем по календарным дням (без влияния часов и перевода времени).
  const a = new Date(fromMs);
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const a0 = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  return Math.round((b.getTime() - a0.getTime()) / DAY);
}

/**
 * Срок определяется по 1-му дню последней менструации и УЗИ в 11–13+6 нед (КР, раздел 1.1).
 * Приоритет — УЗИ первого триместра, затем ПМ, затем срок, указанный вручную.
 */
export function gestationalAge(p: Patient, at: Date): GestationalAge | undefined {
  const lmp = parseDate(p.lmp);
  const lmpDays = lmp !== undefined ? daysBetween(lmp, at) : undefined;
  const us = parseDate(p.usDate);
  const usDays = us !== undefined && p.usWeeks !== undefined ? daysBetween(us, at) + p.usWeeks * 7 + (p.usDays ?? 0) : undefined;
  if (usDays !== undefined) {
    return { days: usDays, source: 'us', discrepancyDays: lmpDays !== undefined ? lmpDays - usDays : undefined };
  }
  if (lmpDays !== undefined) return { days: lmpDays, source: 'lmp' };
  if (p.manualWeeks !== undefined) {
    const base = p.manualWeeks * 7 + (p.manualDays ?? 0);
    const since = p.manualAt ? Math.max(0, daysBetween(new Date(p.manualAt).getTime(), at)) : 0;
    return { days: base + since, source: 'manual' };
  }
  return undefined;
}

export const wd = (weeks: number, days = 0) => weeks * 7 + days;

/** «30+2 нед» */
export function fmtGa(days?: number): string {
  if (days === undefined) return '—';
  return `${Math.floor(days / 7)}+${days % 7} нед`;
}

/** «30 недель 2 дня» — для заключений. */
export function fmtGaLong(days?: number): string {
  if (days === undefined) return '___ недель ___ дней';
  const w = Math.floor(days / 7);
  const d = days % 7;
  return `${w} ${plural(w, 'неделя', 'недели', 'недель')}${d ? ` ${d} ${plural(d, 'день', 'дня', 'дней')}` : ''}`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** Предполагаемая дата родов (280 дней). */
export function dueDate(p: Patient, at: Date): Date | undefined {
  const ga = gestationalAge(p, at);
  if (!ga) return undefined;
  const d = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  d.setDate(d.getDate() + (280 - ga.days));
  return d;
}

export type GaCategory = 'before22' | 'extreme' | 'very' | 'moderate' | 'late' | 'term';

/** Классификация ПР по сроку (ВОЗ; КР, раздел 1.5). */
export function gaCategory(days: number): GaCategory {
  if (days < wd(22)) return 'before22';
  if (days < wd(28)) return 'extreme';
  if (days < wd(32)) return 'very';
  if (days < wd(34)) return 'moderate';
  if (days < wd(37)) return 'late';
  return 'term';
}

export const GA_CATEGORY_LABEL: Record<GaCategory, string> = {
  before22: 'менее 22 нед — не относится к ПР',
  extreme: 'экстремально ранние ПР (22–27+6 нед)',
  very: 'очень ранние ПР (28–31+6 нед)',
  moderate: 'ранние (умеренные) ПР (32–33+6 нед)',
  late: 'поздние ПР (34–36+6 нед)',
  term: 'доношенный срок (≥ 37 нед) — не ПР',
};
