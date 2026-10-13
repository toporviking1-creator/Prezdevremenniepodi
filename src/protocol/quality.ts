import type { Case } from './types';
import { QUALITY_CRITERIA } from './data';
import { buildCtx } from './rules';
import { wd } from './ga';
import { entriesOf, steroidCourses } from './drugs';

export type QualityValue = 'yes' | 'no' | 'na';

/** Автоматическая оценка критерия; ручная отметка (c.quality) имеет приоритет. */
export function autoQuality(c: Case, id: string, now: Date): QualityValue {
  const x = buildCtx(c, now);
  const in24_34 = x.ga !== undefined && x.ga >= wd(24) && x.ga < wd(34);
  const has = (ids: string | string[]) => entriesOf(c.meds, ids).length > 0;
  switch (id) {
    case 'q1':
      if (!x.ruptured) return 'na';
      return c.labs.some((l) => l.wbc !== undefined) && c.labs.some((l) => l.crp !== undefined) ? 'yes' : 'no';
    case 'q2':
      if (!(['threat', 'imminent'].includes(c.clinical.scenario) && in24_34) || x.objectiveNegative) return 'na';
      return has(['nifedipine-load', 'nifedipine', 'atosiban', 'indomethacin-load', 'indomethacin']) ? 'yes' : 'no';
    case 'q3':
      if (!(x.laborExpected && in24_34)) return 'na';
      return has('mg-bolus') ? 'yes' : 'no';
    case 'q4':
      if (c.clinical.gbs !== 'positive' || !(x.laborExpected || c.delivery.at)) return 'na';
      return has('gbs-iap') ? 'yes' : 'no';
    case 'q5':
      if (!x.ruptured) return 'na';
      return has(['ampicillin', 'amoxicillin', 'erythromycin', 'azithromycin']) ? 'yes' : 'no';
    case 'q6':
      if (!in24_34 || c.clinical.scenario === 'prevention' || (c.clinical.scenario === 'threat' && !x.objective)) return 'na';
      return steroidCourses(c.meds).length ? 'yes' : 'no';
    case 'q7':
      if (!c.delivery.at) return 'na';
      if (c.delivery.cordClampingSec === undefined) return 'no';
      return c.delivery.cordClampingSec >= 60 ? 'yes' : 'no';
  }
  return 'na';
}

export function qualityValue(c: Case, id: string, now: Date): QualityValue {
  const m = c.quality[id];
  if (m === true) return 'yes';
  if (m === false) return 'no';
  return autoQuality(c, id, now);
}

export function qualityScore(c: Case, now: Date): { yes: number; total: number } {
  let yes = 0;
  let total = 0;
  for (const q of QUALITY_CRITERIA) {
    const v = qualityValue(c, q.id, now);
    if (v === 'na') continue;
    total++;
    if (v === 'yes') yes++;
  }
  return { yes, total };
}

export const QUALITY_LABEL: Record<QualityValue, string> = { yes: 'Да', no: 'Нет', na: 'Н/П' };
