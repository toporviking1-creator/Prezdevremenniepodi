import type { Case, Clinical, ConclusionExtra, Delivery, Flags, LabEntry, MedEntry, Patient, SavedConclusion, VitalEntry } from '../protocol/types';
import { uid } from '../protocol/case';
import { SCENARIO_LABEL } from '../protocol/data';
import { drugById, steroidCourses } from '../protocol/drugs';

const touch = (c: Case, t: string, text?: string): Case => ({
  ...c,
  updatedAt: t,
  log: text ? [...c.log, { at: t, text }] : c.log,
});

/** Пункт чек-листа, который закрывается введением препарата. */
const DRUG_CHECK: Record<string, string> = {
  'nifedipine-load': 'toco',
  nifedipine: 'toco',
  atosiban: 'toco',
  'indomethacin-load': 'toco',
  betamethasone: 'rds',
  dexamethasone: 'rds',
  'mg-bolus': 'mg',
  ampicillin: 'abx-pprom',
  amoxicillin: 'abx-pprom',
  erythromycin: 'abx-pprom',
  azithromycin: 'abx-pprom',
  'gbs-iap': 'gbs-iap',
  progesterone: 'prev-progesterone',
};

export function setCheck(c: Case, id: string, done: boolean, t: string, label?: string): Case {
  const prev = c.checks[id] ?? {};
  const next = { ...c.checks, [id]: done ? { ...prev, done: true, na: false, at: prev.at && prev.done ? prev.at : t } : { ...prev, done: false, at: undefined } };
  return touch({ ...c, checks: next }, t, label ? `${done ? '✓' : '✗ снята отметка'}: ${label}` : undefined);
}

export function setCheckNa(c: Case, id: string, na: boolean, t: string): Case {
  const prev = c.checks[id] ?? {};
  return touch({ ...c, checks: { ...c.checks, [id]: { ...prev, na, done: na ? false : prev.done } } }, t);
}

export function setCheckNote(c: Case, id: string, note: string, t: string): Case {
  const prev = c.checks[id] ?? {};
  return touch({ ...c, checks: { ...c.checks, [id]: { ...prev, note } } }, t);
}

export function setCheckTime(c: Case, id: string, at: string | undefined, t: string): Case {
  const prev = c.checks[id] ?? {};
  return touch({ ...c, checks: { ...c.checks, [id]: { ...prev, at } } }, t);
}

export function addMed(c: Case, drug: string, dose: string, at: string, t: string, note?: string): Case {
  const entry: MedEntry = { id: uid(), drug, dose, at, note };
  const name = drugById(drug)?.name ?? drug;
  let next: Case = { ...c, meds: [...c.meds, entry].sort((a, b) => a.at.localeCompare(b.at)) };
  const checkId = DRUG_CHECK[drug];
  if (checkId && !next.checks[checkId]?.done) {
    next = { ...next, checks: { ...next.checks, [checkId]: { ...next.checks[checkId], done: true, na: false, at } } };
  }
  if ((drug === 'betamethasone' || drug === 'dexamethasone') && steroidCourses(next.meds).some((k) => k.complete) && !next.checks['rds-complete']?.done) {
    next = { ...next, checks: { ...next.checks, 'rds-complete': { done: true, at } } };
  }
  return touch(next, t, `Введено: ${name} — ${dose}${note ? ` (${note})` : ''}`);
}

export function removeMed(c: Case, id: string, t: string): Case {
  const m = c.meds.find((x) => x.id === id);
  return touch({ ...c, meds: c.meds.filter((x) => x.id !== id) }, t, m ? `Удалена запись: ${drugById(m.drug)?.name ?? m.drug} — ${m.dose}` : undefined);
}

export function addVital(c: Case, v: Omit<VitalEntry, 'id'>, t: string): Case {
  const parts = [
    v.sbp !== undefined ? `АД ${v.sbp}/${v.dbp ?? '—'}` : '',
    v.hr !== undefined ? `ЧСС ${v.hr}` : '',
    v.rr !== undefined ? `ЧДД ${v.rr}` : '',
    v.temp !== undefined ? `t ${v.temp}°` : '',
    v.fhr !== undefined ? `ЧСС плода ${v.fhr}` : '',
    v.reflexes ? `рефлексы: ${REFLEX_LABEL[v.reflexes]}` : '',
    v.diuresisMlH !== undefined ? `диурез ${v.diuresisMlH} мл/ч` : '',
  ].filter(Boolean);
  let next: Case = { ...c, vitals: [...c.vitals, { ...v, id: uid() }].sort((a, b) => a.at.localeCompare(b.at)) };
  if (v.sbp !== undefined && !next.checks['dx-vitals']?.done) next = { ...next, checks: { ...next.checks, 'dx-vitals': { done: true, at: v.at } } };
  if (v.reflexes && c.meds.some((m) => m.drug === 'mg-bolus') && !next.checks['mg-tox']?.done) next = { ...next, checks: { ...next.checks, 'mg-tox': { done: true, at: v.at } } };
  return touch(next, t, `Наблюдение: ${parts.join(', ')}`);
}

export const REFLEX_LABEL = { normal: 'сохранены', reduced: 'снижены', absent: 'отсутствуют' } as const;

export function removeVital(c: Case, id: string, t: string): Case {
  return touch({ ...c, vitals: c.vitals.filter((x) => x.id !== id) }, t);
}

export function addLab(c: Case, l: Omit<LabEntry, 'id'>, t: string): Case {
  let next: Case = { ...c, labs: [...c.labs, { ...l, id: uid() }].sort((a, b) => a.at.localeCompare(b.at)) };
  const all = next.labs;
  if (all.some((x) => x.wbc !== undefined) && all.some((x) => x.crp !== undefined) && !next.checks['dx-wbc-crp']?.done) {
    next = { ...next, checks: { ...next.checks, 'dx-wbc-crp': { done: true, at: l.at } } };
  }
  const parts = [l.wbc !== undefined ? `лейкоциты ${l.wbc}×10⁹/л` : '', l.crp !== undefined ? `СРБ ${l.crp} мг/л` : '', l.note ?? ''].filter(Boolean);
  return touch(next, t, `Анализы: ${parts.join(', ')}`);
}

export function removeLab(c: Case, id: string, t: string): Case {
  return touch({ ...c, labs: c.labs.filter((x) => x.id !== id) }, t);
}

export function updatePatient(c: Case, patch: Partial<Patient>, t: string): Case {
  return touch({ ...c, patient: { ...c.patient, ...patch } }, t);
}

export function updateClinical(c: Case, patch: Partial<Clinical>, t: string): Case {
  const log = patch.scenario && patch.scenario !== c.clinical.scenario ? `Ситуация: ${SCENARIO_LABEL[patch.scenario]}` : undefined;
  const next = { ...c.clinical, ...patch };
  if (patch.scenario === 'pprom' && next.membranes === 'intact') next.membranes = 'ruptured';
  if (next.membranes === 'ruptured' && c.clinical.membranes !== 'ruptured' && !next.rupturedAt) next.rupturedAt = t;
  return touch({ ...c, clinical: next }, t, log);
}

export function setFlag(c: Case, id: keyof Flags, v: boolean, t: string): Case {
  return touch({ ...c, clinical: { ...c.clinical, flags: { ...c.clinical.flags, [id]: v } } }, t);
}

export function updateDelivery(c: Case, patch: Partial<Delivery>, t: string): Case {
  const log = patch.at && !c.delivery.at ? 'Роды / родоразрешение' : undefined;
  let next: Case = { ...c, delivery: { ...c.delivery, ...patch } };
  if (patch.cordClampingSec !== undefined && patch.cordClampingSec >= 60 && !next.checks['nb-cord']?.done) {
    next = { ...next, checks: { ...next.checks, 'nb-cord': { done: true, at: next.delivery.at ?? t } } };
  }
  if (patch.thermalBag && !next.checks['nb-bag']?.done) next = { ...next, checks: { ...next.checks, 'nb-bag': { done: true, at: next.delivery.at ?? t } } };
  if (patch.enCaul && !next.checks['del-en-caul']?.done) next = { ...next, checks: { ...next.checks, 'del-en-caul': { done: true, at: next.delivery.at ?? t } } };
  return touch(next, t, log);
}

export function updateExtra(c: Case, patch: Partial<ConclusionExtra>, t: string): Case {
  return touch({ ...c, extra: { ...c.extra, ...patch } }, t);
}

export function saveConclusion(c: Case, s: Omit<SavedConclusion, 'id'>, t: string): Case {
  return touch({ ...c, conclusions: [{ ...s, id: uid() }, ...c.conclusions] }, t, `Сохранено заключение: ${s.title}`);
}

export function removeConclusion(c: Case, id: string, t: string): Case {
  return touch({ ...c, conclusions: c.conclusions.filter((x) => x.id !== id) }, t);
}

export function setQuality(c: Case, id: string, v: boolean | undefined, t: string): Case {
  return touch({ ...c, quality: { ...c.quality, [id]: v } }, t);
}

export function addNote(c: Case, text: string, t: string): Case {
  return touch(c, t, text);
}
