import type { KrRef } from './data';
import type { MedEntry } from './types';

export type DrugGroup = 'tocolysis' | 'steroid' | 'mg' | 'abx' | 'gbs' | 'prevention' | 'other';

export interface DrugDef {
  id: string;
  name: string;
  group: DrugGroup;
  /** «#» — применение вне инструкции: нужны заключение ВК и письменное ИДС. */
  offLabel: boolean;
  doses: string[];
  scheme: string;
  /** Интервал между введениями, ч. */
  intervalH?: number;
  /** Максимальная длительность от первого введения, ч. */
  maxH?: number;
  monitoring?: string;
  cautions?: string;
  ref: KrRef;
}

export const DRUG_GROUP_LABEL: Record<DrugGroup, string> = {
  tocolysis: 'Токолиз',
  steroid: 'Профилактика РДС плода',
  mg: 'Нейропротекция',
  abx: 'Антибактериальная терапия при ПРПО',
  gbs: 'Профилактика СГВ-инфекции',
  prevention: 'Профилактика ПР',
  other: 'Другое',
};

const TOCO_MONITORING =
  'ЧСС плода периодически; пульс и АД каждые 30 мин в течение 1-го часа, затем каждый час в течение 24 ч, затем каждые 4 ч.';

export const DRUGS: DrugDef[] = [
  {
    id: 'nifedipine-load',
    name: '#Нифедипин — нагрузочная доза',
    group: 'tocolysis',
    offLabel: true,
    doses: ['20 мг внутрь'],
    scheme: '20 мг внутрь; далее, если сокращения матки сохраняются, по 10 мг каждые 6 ч в течение 3–7 дней или до завершения перевода.',
    maxH: 7 * 24,
    monitoring: TOCO_MONITORING,
    cautions: 'Побочные эффекты: артериальная гипотензия (снизить дозу), тахикардия, головная боль, головокружение, тошнота.',
    ref: { section: '3.1', grade: 'A', level: 1 },
  },
  {
    id: 'nifedipine',
    name: '#Нифедипин — поддерживающая доза',
    group: 'tocolysis',
    offLabel: true,
    doses: ['10 мг внутрь'],
    scheme: '10 мг внутрь каждые 6 ч, пока сохраняются сокращения матки (3–7 дней или до завершения перевода).',
    intervalH: 6,
    monitoring: TOCO_MONITORING,
    ref: { section: '3.1', grade: 'A', level: 1 },
  },
  {
    id: 'atosiban',
    name: 'Атозибан',
    group: 'tocolysis',
    offLabel: false,
    doses: ['этап 1: 6,75 мг в/в болюсно', 'этап 2: 300 мкг/мин (18 мг/ч) 3 ч', 'этап 3: 100 мкг/мин (6 мг/ч)'],
    scheme:
      'В/в в 3 последовательных этапа согласно инструкции. Курс не более 48 ч, максимальная доза не более 330 мг. Повторный курс — в любое время, до 3 циклов. Назначается при противопоказаниях к #нифедипину, особенно в 32–33+6 нед.',
    maxH: 48,
    monitoring: TOCO_MONITORING,
    cautions: 'Тошнота, рвота, гипергликемия, головная боль, головокружение, тахикардия, гипотензия (снизить дозу), зуд, сыпь.',
    ref: { section: '3.1', grade: 'A', level: 1 },
  },
  {
    id: 'indomethacin-load',
    name: '#Индометацин — начальная доза (2-я линия, до 28+6 нед)',
    group: 'tocolysis',
    offLabel: true,
    doses: ['50 мг ректально', '100 мг ректально', '50 мг внутрь', '100 мг внутрь'],
    scheme: '50–100 мг ректально или внутрь, затем по 25 мг каждые 6 ч, не более 48 ч.',
    maxH: 48,
    cautions:
      'Противопоказания: коагулопатия, кровоточивость, болезни печени, язвенная болезнь, бронхиальная астма, непереносимость аспирина, ЗРП, ВПР почек плода. После 31 нед — риск преждевременного закрытия артериального протока, олигурии и маловодия плода. Маловодие / сужение протока — прекратить.',
    ref: { section: '3.1', grade: 'A', level: 1 },
  },
  {
    id: 'indomethacin',
    name: '#Индометацин — поддерживающая доза',
    group: 'tocolysis',
    offLabel: true,
    doses: ['25 мг'],
    scheme: '25 мг каждые 6 ч (суммарно не более 48 ч от начала).',
    intervalH: 6,
    ref: { section: '3.1', grade: 'A', level: 1 },
  },
  {
    id: 'betamethasone',
    name: '#Бетаметазон',
    group: 'steroid',
    offLabel: true,
    doses: ['12 мг в/м'],
    scheme: '12 мг в/м 2 раза с интервалом 24 ч.',
    intervalH: 24,
    cautions: 'После рождения — контроль глюкозы у новорождённого (гипогликемия чаще при бетаметазоне).',
    ref: { section: '5.1', grade: 'A', level: 1 },
  },
  {
    id: 'dexamethasone',
    name: '#Дексаметазон',
    group: 'steroid',
    offLabel: true,
    doses: ['6 мг в/м', '12 мг в/м'],
    scheme: '6 мг в/м 4 раза с интервалом 12 ч или 12 мг в/м 2 раза с интервалом 24 ч.',
    cautions: '«Ускоренные» курсы преимуществ не показали.',
    ref: { section: '5.1', grade: 'A', level: 1 },
  },
  {
    id: 'mg-bolus',
    name: 'Магния сульфат — болюс',
    group: 'mg',
    offLabel: false,
    doses: ['4 г в/в за 20–30 мин'],
    scheme: '4 г в/в за 20–30 мин, далее 1 г/ч до родов или 24 ч (что наступит раньше). Лучше начинать в ближайшие 4 ч до родов.',
    maxH: 24,
    monitoring: 'Признаки токсичности не реже чем каждые 4 ч: пульс, АД, ЧДД, глубокие сухожильные (коленные) рефлексы.',
    cautions: 'Противопоказан при миастении; избегать при нарушениях проводимости сердца; при нарушении функции почек — индивидуальный подбор дозы.',
    ref: { section: '3.1', grade: 'A', level: 1 },
  },
  {
    id: 'mg-infusion',
    name: 'Магния сульфат — поддерживающая инфузия',
    group: 'mg',
    offLabel: false,
    doses: ['1 г/ч в/в'],
    scheme: '1 г/ч в/в до родов или в течение 24 ч.',
    ref: { section: '3.1', grade: 'A', level: 1 },
  },
  {
    id: 'mg-stop',
    name: 'Магния сульфат — инфузия прекращена',
    group: 'mg',
    offLabel: false,
    doses: ['—'],
    scheme: 'Отметка окончания инфузии.',
    ref: { section: '3.1' },
  },
  {
    id: 'ampicillin',
    name: '#Ампициллин',
    group: 'abx',
    offLabel: true,
    doses: ['2 г в/в'],
    scheme: '2 г в/в каждые 6 ч в течение 48 ч, затем #амоксициллин 250 мг каждые 8 ч 5 дней.',
    intervalH: 6,
    maxH: 48,
    ref: { section: '3.1', grade: 'A', level: 1 },
  },
  {
    id: 'amoxicillin',
    name: '#Амоксициллин',
    group: 'abx',
    offLabel: true,
    doses: ['250 мг внутрь'],
    scheme: '250 мг каждые 8 ч в течение 5 дней.',
    intervalH: 8,
    maxH: 5 * 24,
    ref: { section: '3.1', grade: 'A', level: 1 },
  },
  {
    id: 'erythromycin',
    name: '#Эритромицин',
    group: 'abx',
    offLabel: true,
    doses: ['250 мг внутрь'],
    scheme: '250 мг каждые 6 ч, максимум до 10 дней.',
    intervalH: 6,
    maxH: 10 * 24,
    ref: { section: '3.1', grade: 'A', level: 1 },
  },
  {
    id: 'azithromycin',
    name: '#Азитромицин',
    group: 'abx',
    offLabel: true,
    doses: ['1000 мг внутрь однократно', '500 мг внутрь (1-й день)', '250 мг внутрь', '500 мг в/в'],
    scheme:
      'Варианты: 1000 мг внутрь однократно (в т.ч. в сочетании с парентеральными пенициллинами); 500 мг внутрь, затем 250 мг 4 дня; 500 мг в/в 2 дня, затем 500 мг внутрь 5 дней. При противопоказаниях к эритромицину возможен однодневный курс.',
    ref: { section: '3.1', grade: 'A', level: 1 },
  },
  {
    id: 'gbs-iap',
    name: 'Интранатальная антибиотикопрофилактика СГВ',
    group: 'gbs',
    offLabel: false,
    doses: ['по локальному протоколу'],
    scheme:
      'Начать с началом родов (при невозможности — в любой момент родов). Эффективная экспозиция — 4 ч до рождения (колонизация снижается уже через 2 ч). Препарат и дозу КР «Преждевременные роды» не регламентирует — по локальному протоколу.',
    ref: { section: '5.2', grade: 'C', level: 5 },
  },
  {
    id: 'progesterone',
    name: 'Прогестерон микронизированный',
    group: 'prevention',
    offLabel: false,
    doses: ['200 мг вагинально'],
    scheme: '200 мг/сут вагинально (на ночь) с 16 до 34 нед.',
    intervalH: 24,
    ref: { section: '5.3', grade: 'A', level: 1 },
  },
];

export const drugById = (id: string) => DRUGS.find((d) => d.id === id);

export function drugName(id: string): string {
  return drugById(id)?.name ?? id;
}

const H = 3_600_000;

export function entriesOf(meds: MedEntry[], ids: string | string[]): MedEntry[] {
  const set = new Set(Array.isArray(ids) ? ids : [ids]);
  return meds.filter((m) => set.has(m.drug)).sort((a, b) => a.at.localeCompare(b.at));
}

export function hoursSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / H;
}

/** Курс профилактики РДС: введения, сгруппированные по курсам (новый курс — если пауза > 72 ч). */
export interface SteroidCourse {
  drug: 'betamethasone' | 'dexamethasone';
  doses: MedEntry[];
  /** Положено доз в курсе. */
  needed: number;
  intervalH: number;
  start: string;
  complete: boolean;
}

export function steroidCourses(meds: MedEntry[]): SteroidCourse[] {
  const list = entriesOf(meds, ['betamethasone', 'dexamethasone']);
  const courses: SteroidCourse[] = [];
  for (const m of list) {
    const last = courses.at(-1);
    const lastDose = last?.doses.at(-1);
    if (last && lastDose && (new Date(m.at).getTime() - new Date(lastDose.at).getTime()) / H <= 72 && !last.complete) {
      last.doses.push(m);
      last.complete = last.doses.length >= last.needed;
      continue;
    }
    const drug = m.drug as SteroidCourse['drug'];
    const dex6 = drug === 'dexamethasone' && /^6\b|^6 /.test(m.dose.trim());
    const needed = dex6 ? 4 : 2;
    const intervalH = dex6 ? 12 : 24;
    courses.push({ drug, doses: [m], needed, intervalH, start: m.at, complete: needed <= 1 });
  }
  return courses;
}
