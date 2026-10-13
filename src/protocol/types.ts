/** Клиническая ситуация (ведущий сценарий). */
export type Scenario =
  | 'prevention' // бессимптомная пациентка группы риска (профилактика ПР)
  | 'threat' // угрожающие ПР
  | 'imminent' // начавшиеся (неминуемые) ПР
  | 'active' // активные ПР
  | 'pprom' // ПРПО
  | 'induced'; // индуцированные (запланированные) ПР

export type Presentation = 'cephalic' | 'breech' | 'transverse' | 'unknown';
export type Chorionicity = 'dichorionic' | 'monochorionic-diamniotic' | 'monochorionic-monoamniotic';
export type TestResult = 'not-done' | 'negative' | 'positive';
export type GbsStatus = 'unknown' | 'positive' | 'negative';
export type Doppler = 'normal' | 'mild' | 'aedf' | 'redf' | 'dv';

export interface Patient {
  fullName: string;
  historyNo: string;
  age?: number;
  weightKg?: number;
  department: string;
  admittedAt?: string;
  /** Первый день последней менструации (YYYY-MM-DD). */
  lmp?: string;
  /** Дата УЗИ 11–13+6 нед и срок по нему. */
  usDate?: string;
  usWeeks?: number;
  usDays?: number;
  /** Срок, указанный вручную (при отсутствии данных датировки), и момент, на который он указан. */
  manualWeeks?: number;
  manualDays?: number;
  manualAt?: string;
  gravidity?: number;
  parity?: number;
  /** Факторы риска ПР (id из RISK_FACTORS). */
  riskFactors: string[];
  notes: string;
}

/** Противопоказания и особые состояния, влияющие на тактику. */
export interface Flags {
  // противопоказания к токолизу (КР, раздел 3.1)
  iufd: boolean;
  lethalAnomaly: boolean;
  severePreeclampsia: boolean;
  unstableBleeding: boolean;
  chorioamnionitis: boolean;
  abruption: boolean;
  scarFailure: boolean;
  maternalTocolysisContra: boolean;
  // для выбора препарата
  nifedipineContra: boolean;
  indomethacinContra: boolean;
  // магния сульфат
  myasthenia: boolean;
  cardiacConduction: boolean;
  renalImpairment: boolean;
  // прочее
  placentaPrevia: boolean;
  diabetes: boolean;
  vaginalBleeding: boolean;
  infectionSigns: boolean;
  cervicalTrauma: boolean;
  intrauterineIntervention: boolean;
  penicillinAllergy: boolean;
}

export interface Clinical {
  scenario: Scenario;
  fetuses: number;
  chorionicity?: Chorionicity;
  presentation: Presentation;
  /** Длина шейки матки по УЗ-цервикометрии, мм. */
  cervixMm?: number;
  /** Срок (нед) на момент цервикометрии — для критериев 16–24 нед. */
  cervixAtWeeks?: number;
  /** Расширение внутреннего зева по УЗИ, мм. */
  funnelMm?: number;
  /** Раскрытие маточного зева, см. */
  dilationCm?: number;
  contractionsPer20?: number;
  membranes: 'intact' | 'ruptured' | 'prolapse';
  rupturedAt?: string;
  /** Тест ПСИФР-1 / ПАМГ-1 / тройной тест на ПР. */
  pretermTest: TestResult;
  /** Тест на подтекание околоплодных вод (ПСИФР-1/ПАМГ-1) при неясной картине в зеркалах. */
  romTest: TestResult;
  gbs: GbsStatus;
  gbsDate?: string;
  efwG?: number;
  /** ПМП не соответствует сроку (ЗРП/МГВ). */
  fgr: boolean;
  doppler: Doppler;
  mvpCm?: number;
  afiCm?: number;
  plannedCs: boolean;
  flags: Flags;
}

export interface CheckState {
  done?: boolean;
  na?: boolean;
  at?: string;
  note?: string;
}

export interface MedEntry {
  id: string;
  drug: string;
  dose: string;
  at: string;
  note?: string;
}

export interface VitalEntry {
  id: string;
  at: string;
  sbp?: number;
  dbp?: number;
  hr?: number;
  rr?: number;
  temp?: number;
  fhr?: number;
  reflexes?: 'normal' | 'reduced' | 'absent';
  diuresisMlH?: number;
}

export interface LabEntry {
  id: string;
  at: string;
  wbc?: number;
  crp?: number;
  note?: string;
}

export interface Delivery {
  at?: string;
  mode?: 'vaginal' | 'cs' | 'breech-vaginal' | 'forceps';
  anesthesia?: 'neuraxial' | 'general' | 'none';
  cordClampingSec?: number;
  milking?: boolean;
  neonatologist?: boolean;
  thermalBag?: boolean;
  enCaul?: boolean;
  weightG?: number;
  apgar1?: number;
  apgar5?: number;
  note: string;
}

export interface LogEntry {
  at: string;
  text: string;
}

/** Поля конструктора заключений, которые не выводятся из клинических данных. */
export interface ConclusionExtra {
  doctor: string;
  head: string;
  members: string;
  offLabelDrug: string;
  consiliumDecision: string;
  freeText: string;
  /** Отключённые пункты плана (id рекомендаций). */
  excludedPlan: string[];
}

export interface SavedConclusion {
  id: string;
  template: string;
  title: string;
  text: string;
  at: string;
}

export interface Case {
  id: string;
  createdAt: string;
  updatedAt: string;
  patient: Patient;
  clinical: Clinical;
  checks: Record<string, CheckState>;
  meds: MedEntry[];
  vitals: VitalEntry[];
  labs: LabEntry[];
  delivery: Delivery;
  quality: Record<string, boolean | undefined>;
  extra: ConclusionExtra;
  conclusions: SavedConclusion[];
  log: LogEntry[];
}
