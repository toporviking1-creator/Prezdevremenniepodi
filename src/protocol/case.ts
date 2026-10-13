import type { Case, Clinical, ConclusionExtra, Delivery, Flags, Patient } from './types';

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export const emptyFlags = (): Flags => ({
  iufd: false,
  lethalAnomaly: false,
  severePreeclampsia: false,
  unstableBleeding: false,
  chorioamnionitis: false,
  abruption: false,
  scarFailure: false,
  maternalTocolysisContra: false,
  nifedipineContra: false,
  indomethacinContra: false,
  myasthenia: false,
  cardiacConduction: false,
  renalImpairment: false,
  placentaPrevia: false,
  diabetes: false,
  vaginalBleeding: false,
  infectionSigns: false,
  cervicalTrauma: false,
  intrauterineIntervention: false,
  penicillinAllergy: false,
});

const emptyPatient = (): Patient => ({ fullName: '', historyNo: '', department: '', riskFactors: [], notes: '' });

const emptyClinical = (): Clinical => ({
  scenario: 'threat',
  fetuses: 1,
  presentation: 'cephalic',
  membranes: 'intact',
  pretermTest: 'not-done',
  romTest: 'not-done',
  gbs: 'unknown',
  fgr: false,
  doppler: 'normal',
  plannedCs: false,
  flags: emptyFlags(),
});

const emptyDelivery = (): Delivery => ({ note: '' });

const emptyExtra = (): ConclusionExtra => ({
  doctor: '',
  head: '',
  members: '',
  offLabelDrug: 'nifedipine-load',
  consiliumDecision: '',
  freeText: '',
  excludedPlan: [],
});

export function newCase(now = new Date()): Case {
  const t = now.toISOString();
  return {
    id: uid(),
    createdAt: t,
    updatedAt: t,
    patient: { ...emptyPatient(), admittedAt: t },
    clinical: emptyClinical(),
    checks: {},
    meds: [],
    vitals: [],
    labs: [],
    delivery: emptyDelivery(),
    quality: {},
    extra: emptyExtra(),
    conclusions: [],
    log: [{ at: t, text: 'Случай создан' }],
  };
}

/** Приводит данные из хранилища/импорта к актуальной схеме. */
export function normalizeCase(raw: Partial<Case>): Case {
  const base = newCase(new Date(raw.createdAt ?? Date.now()));
  const clinical = { ...emptyClinical(), ...(raw.clinical ?? {}) } as Clinical;
  clinical.flags = { ...emptyFlags(), ...(raw.clinical?.flags ?? {}) };
  return {
    ...base,
    ...raw,
    id: raw.id ?? base.id,
    patient: { ...emptyPatient(), ...(raw.patient ?? {}) },
    clinical,
    checks: raw.checks ?? {},
    meds: raw.meds ?? [],
    vitals: raw.vitals ?? [],
    labs: raw.labs ?? [],
    delivery: { ...emptyDelivery(), ...(raw.delivery ?? {}) },
    quality: raw.quality ?? {},
    extra: { ...emptyExtra(), ...(raw.extra ?? {}) },
    conclusions: raw.conclusions ?? [],
    log: raw.log ?? [],
    updatedAt: raw.updatedAt ?? base.updatedAt,
  };
}
