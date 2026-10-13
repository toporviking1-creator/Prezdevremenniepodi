import type { Case } from '../protocol/types';
import { buildDiagnosis, diagnosisText, oligoSeverity } from './diagnosis';
import { buildCtx, formatHours, recommendations, LEVEL_LABEL, type Rec } from '../protocol/rules';
import { fmtGa, fmtGaLong, gestationalAge, wd } from '../protocol/ga';
import { drugById, entriesOf, hoursSince, steroidCourses } from '../protocol/drugs';
import { GUIDELINE, QUALITY_CRITERIA, SCENARIO_LABEL, refText } from '../protocol/data';
import { qualityValue, QUALITY_LABEL } from '../protocol/quality';
import { tocolysisContraindications } from '../protocol/rules';

export interface Block {
  heading?: string;
  text: string;
}

export interface ConclusionDoc {
  title: string;
  blocks: Block[];
}

export type Field = 'doctor' | 'head' | 'members' | 'offLabelDrug' | 'consiliumDecision' | 'freeText' | 'plan';

export interface Template {
  id: string;
  title: string;
  description: string;
  fields: Field[];
  build: (c: Case, now: Date) => ConclusionDoc;
}

const fmtDT = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '___';
const fmtD = (d: Date) => d.toLocaleDateString('ru-RU');
const blank = (s?: string | number, w = 20) => (s === undefined || s === '' ? '_'.repeat(w) : String(s));

function header(c: Case, now: Date): string {
  const p = c.patient;
  const ga = gestationalAge(p, now);
  const src = ga ? { us: 'по УЗИ 11–13+6 нед', lmp: 'по последней менструации', manual: 'со слов / по документам' }[ga.source] : '';
  return [
    `Пациентка: ${blank(p.fullName, 30)}${p.age ? `, ${p.age} лет` : ''}`,
    `№ истории: ${blank(p.historyNo, 10)}${p.department ? `; отделение: ${p.department}` : ''}`,
    `Дата и время: ${fmtDT(now.toISOString())}`,
    `Срок беременности: ${fmtGaLong(ga?.days)}${src ? ` (${src})` : ''}`,
    p.gravidity || p.parity ? `Беременность ${p.gravidity ?? '_'}-я, роды ${p.parity !== undefined ? p.parity + 1 : '_'}-е` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function findings(c: Case): string {
  const cl = c.clinical;
  const lines: string[] = [];
  if (cl.membranes === 'ruptured') lines.push(`Плодные оболочки: разрыв${cl.rupturedAt ? ` с ${fmtDT(cl.rupturedAt)}` : ''}.`);
  else if (cl.membranes === 'prolapse') lines.push('Пролабирование плодного пузыря.');
  else lines.push('Плодный пузырь цел.');
  if (cl.cervixMm !== undefined) lines.push(`Длина шейки матки (УЗ-цервикометрия): ${cl.cervixMm} мм${cl.funnelMm ? `, расширение внутреннего зева ${cl.funnelMm} мм` : ''}.`);
  if (cl.dilationCm !== undefined) lines.push(`Открытие маточного зева: ${cl.dilationCm} см.`);
  if (cl.contractionsPer20 !== undefined) lines.push(`Схватки: ${cl.contractionsPer20} за 20 мин.`);
  if (cl.pretermTest !== 'not-done') lines.push(`Тест на ПР: ${cl.pretermTest === 'positive' ? 'положительный' : 'отрицательный'}.`);
  if (cl.romTest !== 'not-done') lines.push(`Тест на подтекание околоплодных вод: ${cl.romTest === 'positive' ? 'положительный' : 'отрицательный'}.`);
  lines.push(`СГВ: ${{ unknown: 'статус не установлен', positive: 'носительство', negative: `отрицательно${cl.gbsDate ? ` (${new Date(cl.gbsDate).toLocaleDateString('ru-RU')})` : ''}` }[cl.gbs]}.`);
  const pres = { cephalic: 'головное', breech: 'тазовое', transverse: 'поперечное положение', unknown: 'не определено' }[cl.presentation];
  const us = [`предлежание ${pres}`];
  if (cl.efwG) us.push(`ПМП ${cl.efwG} г`);
  if (cl.afiCm !== undefined) us.push(`ИАЖ ${cl.afiCm} см`);
  if (cl.mvpCm !== undefined) us.push(`МВК ${cl.mvpCm} см`);
  const oligo = oligoSeverity(cl.afiCm, cl.mvpCm);
  if (oligo) us.push(oligo);
  lines.push(`УЗИ: ${us.join(', ')}.`);
  const v = [...c.vitals].sort((a, b) => a.at.localeCompare(b.at)).at(-1);
  if (v) {
    const parts = [
      v.sbp !== undefined ? `АД ${v.sbp}/${v.dbp ?? '—'} мм рт. ст.` : '',
      v.hr !== undefined ? `пульс ${v.hr}/мин` : '',
      v.rr !== undefined ? `ЧДД ${v.rr}/мин` : '',
      v.temp !== undefined ? `t ${v.temp} °C` : '',
      v.fhr !== undefined ? `ЧСС плода ${v.fhr}/мин` : '',
    ].filter(Boolean);
    if (parts.length) lines.push(`${fmtDT(v.at)}: ${parts.join(', ')}.`);
  }
  const l = [...c.labs].sort((a, b) => a.at.localeCompare(b.at)).at(-1);
  if (l) lines.push(`Анализы (${fmtDT(l.at)}): ${[l.wbc !== undefined ? `лейкоциты ${l.wbc}×10⁹/л` : '', l.crp !== undefined ? `СРБ ${l.crp} мг/л` : ''].filter(Boolean).join(', ')}.`);
  return lines.join('\n');
}

function diagnosisBlock(c: Case, now: Date): Block[] {
  const d = buildDiagnosis(c, now);
  return [
    { heading: 'Диагноз', text: diagnosisText(d) || '________________' },
    { heading: 'Код по МКБ-10', text: d.codes.map((k) => `${k.code} — ${k.text}`).join('\n') || '—' },
  ];
}

const PLAN_LEVELS: Rec['level'][] = ['do', 'consider'];

export function planRecs(c: Case, now: Date): Rec[] {
  return recommendations(c, now).filter((r) => PLAN_LEVELS.includes(r.level));
}

function planText(c: Case, now: Date, categories?: Rec['category'][]): string {
  const recs = planRecs(c, now).filter((r) => !c.extra.excludedPlan.includes(r.id) && (!categories || categories.includes(r.category)));
  if (!recs.length) return '________________';
  return recs.map((r, i) => `${i + 1}. ${r.level === 'consider' ? 'Рассмотреть: ' : ''}${r.title}${r.ref ? ` [${refText(r.ref)}]` : ''}.`).join('\n');
}

function avoidText(c: Case, now: Date): string {
  const recs = recommendations(c, now).filter((r) => (r.level === 'avoid' || r.level === 'contra') && !c.extra.excludedPlan.includes(r.id));
  return recs.map((r) => `— ${LEVEL_LABEL[r.level]}: ${r.title}.`).join('\n');
}

function treatmentGiven(c: Case): string {
  if (!c.meds.length) return 'Не проводилось.';
  return c.meds.map((m) => `${fmtDT(m.at)} — ${drugById(m.drug)?.name ?? m.drug} ${m.dose}${m.note ? ` (${m.note})` : ''}`).join('\n');
}

function signature(c: Case, role = 'Врач акушер-гинеколог'): string {
  return `${role}: ${blank(c.extra.doctor, 25)} / ______________ (подпись)`;
}

export const OFF_LABEL_DRUGS = ['nifedipine-load', 'indomethacin-load', 'betamethasone', 'dexamethasone', 'ampicillin', 'amoxicillin', 'erythromycin', 'azithromycin'];

const OFF_LABEL_INDICATION: Record<string, string> = {
  'nifedipine-load': 'острый токолиз при начавшихся (неминуемых) преждевременных родах в 24–33+6 нед',
  nifedipine: 'острый токолиз при начавшихся (неминуемых) преждевременных родах в 24–33+6 нед',
  'indomethacin-load': 'токолиз второй линии при начавшихся преждевременных родах до 28+6 нед',
  betamethasone: 'антенатальная профилактика респираторного дистресс-синдрома плода',
  dexamethasone: 'антенатальная профилактика респираторного дистресс-синдрома плода',
  ampicillin: 'антибактериальная терапия при преждевременном разрыве плодных оболочек',
  amoxicillin: 'антибактериальная терапия при преждевременном разрыве плодных оболочек',
  erythromycin: 'антибактериальная терапия при преждевременном разрыве плодных оболочек',
  azithromycin: 'антибактериальная терапия при преждевременном разрыве плодных оболочек',
};

export const TEMPLATES: Template[] = [
  {
    id: 'admission',
    title: 'Осмотр и заключение при поступлении',
    description: 'Данные обследования, клинический диагноз с кодом МКБ-10, обоснование по критериям КР и план ведения.',
    fields: ['doctor', 'plan', 'freeText'],
    build: (c, now) => ({
      title: 'Осмотр врача акушера-гинеколога. Заключение',
      blocks: [
        { text: header(c, now) },
        { heading: 'Данные обследования', text: findings(c) },
        ...diagnosisBlock(c, now),
        { heading: 'Обоснование диагноза', text: buildDiagnosis(c, now).rationale.join('\n') || '________________' },
        { heading: 'План ведения', text: planText(c, now) },
        ...(avoidText(c, now) ? [{ heading: 'Не показано', text: avoidText(c, now) }] : []),
        ...(c.extra.freeText ? [{ heading: 'Дополнительно', text: c.extra.freeText }] : []),
        { text: `Тактика соответствует КР «${GUIDELINE.title}» (${GUIDELINE.author}, ${GUIDELINE.year}).\n\n${signature(c)}` },
      ],
    }),
  },
  {
    id: 'offlabel',
    title: 'Протокол ВК: препарат вне инструкции (off-label)',
    description: 'Заключение врачебной комиссии (зав. отделением + 2 врача) для #нифедипина, #ГКС, #антибиотиков, #индометацина — как требуют КР.',
    fields: ['head', 'members', 'offLabelDrug', 'doctor'],
    build: (c, now) => {
      const drug = drugById(c.extra.offLabelDrug) ?? drugById('nifedipine-load')!;
      const x = buildCtx(c, now);
      const contra = drug.group === 'tocolysis' ? tocolysisContraindications(c, x) : [];
      return {
        title: 'Протокол заседания врачебной комиссии о назначении лекарственного препарата вне инструкции по применению',
        blocks: [
          { text: header(c, now) },
          {
            heading: 'Состав комиссии',
            text: `Председатель (заведующий отделением): ${blank(c.extra.head, 25)}\nЧлены комиссии (врачи акушеры-гинекологи): ${blank(c.extra.members, 40)}`,
          },
          ...diagnosisBlock(c, now),
          {
            heading: 'Обоснование',
            text:
              `Показание: ${OFF_LABEL_INDICATION[drug.id] ?? '________________'}.\n` +
              `Препарат ${drug.name.replace(/ —.*$/, '')} в данном показании/дозировке не указан в инструкции по медицинскому применению; применение предусмотрено клиническими рекомендациями «${GUIDELINE.title}» (${GUIDELINE.year}), ${refText(drug.ref)}.\n` +
              (drug.group === 'tocolysis' ? `Противопоказания к токолизу: ${contra.length ? contra.join('; ') : 'не выявлены'}.\n` : '') +
              (drug.cautions ? `Учтены: ${drug.cautions}` : ''),
          },
          { heading: 'Схема применения', text: drug.scheme + (drug.monitoring ? `\nМониторинг: ${drug.monitoring}` : '') },
          {
            heading: 'Решение',
            text: `Назначение препарата ${drug.name.replace(/ —.*$/, '')} по указанной схеме признать обоснованным. Пациентка информирована о применении препарата вне инструкции, получено письменное информированное добровольное согласие.`,
          },
          { text: `Председатель: ______________ / ${blank(c.extra.head, 20)}\nЧлены комиссии: ______________ / ______________\n                ______________ / ______________\n${signature(c, 'Лечащий врач')}` },
        ],
      };
    },
  },
  {
    id: 'consent',
    title: 'ИДС на препарат вне инструкции',
    description: 'Информированное добровольное согласие пациентки на применение выбранного off-label препарата.',
    fields: ['offLabelDrug', 'doctor'],
    build: (c, now) => {
      const drug = drugById(c.extra.offLabelDrug) ?? drugById('nifedipine-load')!;
      const name = drug.name.replace(/ —.*$/, '');
      return {
        title: 'Информированное добровольное согласие на применение лекарственного препарата вне инструкции по применению',
        blocks: [
          {
            text:
              `Я, ${blank(c.patient.fullName, 35)}, проинформирована врачом ${blank(c.extra.doctor, 25)} о том, что в связи с ${OFF_LABEL_INDICATION[drug.id] ?? 'состоянием беременности'} мне рекомендовано применение препарата ${name} по схеме: ${drug.scheme}\n\n` +
              `Мне разъяснено, что данное показание (дозировка) не указано в инструкции по применению препарата, но предусмотрено клиническими рекомендациями «${GUIDELINE.title}» (РОАГ, ${GUIDELINE.year}); применение одобрено врачебной комиссией.\n\n` +
              `Мне разъяснены цель лечения, ожидаемый результат, возможные побочные эффекты${drug.cautions ? ` (${drug.cautions})` : ''}, альтернативные методы и последствия отказа. Я имела возможность задать вопросы и получила ответы.\n\n` +
              'Даю согласие на применение препарата.',
          },
          { text: `Дата: ${fmtD(now)}\nПациентка: ______________ / ${blank(c.patient.fullName, 20)}\n${signature(c)}` },
        ],
      };
    },
  },
  {
    id: 'consilium',
    title: 'Консилиум: тактика и способ родоразрешения',
    description: 'Обоснование срока и метода родоразрешения (тазовое предлежание, многоплодие, ЗРП, ПРПО), состав консилиума, решение.',
    fields: ['head', 'members', 'consiliumDecision', 'doctor'],
    build: (c, now) => {
      const x = buildCtx(c, now);
      const recs = recommendations(c, now).filter((r) => ['delivery', 'pprom', 'route'].includes(r.category) && !c.extra.excludedPlan.includes(r.id));
      const factors = recs.map((r) => `— ${LEVEL_LABEL[r.level]}: ${r.title}${r.ref ? ` [${refText(r.ref)}]` : ''}.`).join('\n');
      const prep = [
        steroidCourses(c.meds).length ? `профилактика РДС: ${steroidCourses(c.meds).map((k) => `${k.drug === 'betamethasone' ? '#бетаметазон' : '#дексаметазон'} ${k.doses.length}/${k.needed} доз с ${fmtDT(k.start)}`).join('; ')}` : 'профилактика РДС не проводилась',
        entriesOf(c.meds, 'mg-bolus').length ? `магния сульфат с ${fmtDT(entriesOf(c.meds, 'mg-bolus')[0].at)}` : 'магния сульфат не вводился',
      ];
      return {
        title: 'Протокол консилиума врачей',
        blocks: [
          { text: header(c, now) },
          { heading: 'Состав консилиума', text: `${blank(c.extra.head, 25)}${c.extra.members ? `, ${c.extra.members}` : ', ______________'}; врач-неонатолог ______________; врач-анестезиолог-реаниматолог ______________` },
          ...diagnosisBlock(c, now),
          { heading: 'Данные обследования', text: findings(c) },
          { heading: 'Проведённая подготовка', text: prep.join('\n') + (x.ga !== undefined && x.ga < wd(26) ? '\nПациентка и семья информированы о прогнозе для новорождённого и о преимуществах и возможных последствиях методов родоразрешения.' : '') },
          { heading: 'Положения клинических рекомендаций', text: factors || '—' },
          { heading: 'Решение консилиума', text: c.extra.consiliumDecision || suggestedDecision(c, now) },
          { text: 'С решением ознакомлена, согласна: ______________ (подпись пациентки)\n\nПодписи участников консилиума: ______________' },
        ],
      };
    },
  },
  {
    id: 'pprom-diary',
    title: 'Дневник наблюдения при ПРПО',
    description: 'Безводный промежуток, температура, лейкоциты/СРБ, ЧСС плода, день антибиотикотерапии, статус профилактики РДС.',
    fields: ['doctor', 'freeText'],
    build: (c, now) => {
      const x = buildCtx(c, now);
      const v = [...c.vitals].sort((a, b) => a.at.localeCompare(b.at)).at(-1);
      const l = [...c.labs].sort((a, b) => a.at.localeCompare(b.at)).at(-1);
      const abx = entriesOf(c.meds, ['ampicillin', 'amoxicillin', 'erythromycin', 'azithromycin']);
      const abxDay = abx.length ? Math.floor(hoursSince(abx[0].at, now) / 24) + 1 : undefined;
      const fever = v?.temp !== undefined && v.temp >= 38;
      const chorio = c.clinical.flags.chorioamnionitis || fever;
      const courses = steroidCourses(c.meds);
      return {
        title: `Дневник наблюдения (ПРПО) — ${fmtDT(now.toISOString())}`,
        blocks: [
          { text: `Срок беременности: ${fmtGa(x.ga)}. Безводный промежуток: ${x.latencyH !== undefined ? formatHours(x.latencyH) : '___'}.` },
          {
            heading: 'Объективно',
            text: [
              v ? `АД ${blank(v.sbp, 3)}/${blank(v.dbp, 2)} мм рт. ст., пульс ${blank(v.hr, 3)}/мин, ЧДД ${blank(v.rr, 2)}/мин, t ${blank(v.temp, 4)} °C. ЧСС плода ${blank(v.fhr, 3)}/мин.` : 'АД ___/___ мм рт. ст., пульс ___/мин, t ___ °C. ЧСС плода ___/мин.',
              'Матка ______________, тонус ______________. Подтекание вод: характер ______________.',
              l ? `Лейкоциты ${blank(l.wbc, 4)}×10⁹/л, СРБ ${blank(l.crp, 4)} мг/л (${fmtDT(l.at)}).` : 'Лейкоциты ___, СРБ ___.',
            ].join('\n'),
          },
          {
            heading: 'Оценка',
            text: chorio
              ? 'Имеются признаки, подозрительные на хориоамнионит — решение о тактике консилиумом (токолиз противопоказан).'
              : 'Клинических и лабораторных признаков хориоамнионита, ПОНРП, компрессии пуповины, родовой деятельности нет. Состояние плода удовлетворительное.',
          },
          {
            heading: 'Лечение',
            text: [
              abxDay ? `Антибактериальная терапия: ${abxDay}-е сутки из 10 (${[...new Set(abx.map((m) => drugById(m.drug)?.name ?? m.drug))].join(', ')}).` : 'Антибактериальная терапия: не начата.',
              courses.length ? `Профилактика РДС: ${courses.map((k) => `${k.doses.length}/${k.needed} доз${k.complete ? ' (курс завершён)' : ''}`).join('; ')}.` : 'Профилактика РДС: не проводилась.',
            ].join('\n'),
          },
          {
            heading: 'План',
            text:
              (c.clinical.gbs === 'positive' && x.ga !== undefined && x.ga >= wd(34)
                ? 'Носительство СГВ, срок ≥ 34 нед — родоразрешение.'
                : `Выжидательная тактика${c.clinical.gbs === 'positive' ? ' до 34+0 нед (носительство СГВ)' : ''}. Контроль температуры, пульса, ЧСС плода, лейкоцитов и СРБ; КТГ.`) +
              (c.extra.freeText ? `\n${c.extra.freeText}` : ''),
          },
          { text: signature(c) },
        ],
      };
    },
  },
  {
    id: 'transfer',
    title: 'Обоснование перевода в стационар 3-й группы',
    description: 'Для ПР и ПРПО до 34 нед: диагноз, проведённое лечение перед транспортировкой, состояние.',
    fields: ['doctor', 'freeText'],
    build: (c, now) => {
      const x = buildCtx(c, now);
      return {
        title: 'Обоснование перевода',
        blocks: [
          { text: header(c, now) },
          ...diagnosisBlock(c, now),
          {
            heading: 'Показания к переводу',
            text:
              x.ga !== undefined && x.ga >= wd(34)
                ? 'ПР/ПРПО в 34–36 нед: госпитализация в стационар 3а группы, при отсутствии возможности — 2-й группы с ОРИТН (КР «Преждевременные роды», раздел 6).'
                : 'ПР/ПРПО при сроке менее 34 нед — госпитализация в медицинскую организацию 3а группы при отсутствии противопоказаний к транспортировке (КР «Преждевременные роды», раздел 6). Токолиз проводится в том числе для обеспечения перевода (раздел 3.1).',
          },
          { heading: 'Проведённое лечение', text: treatmentGiven(c) },
          { heading: 'Состояние на момент перевода', text: findings(c) + '\nПротивопоказаний к транспортировке: ______________.' },
          ...(c.extra.freeText ? [{ heading: 'Дополнительно', text: c.extra.freeText }] : []),
          { text: signature(c) },
        ],
      };
    },
  },
  {
    id: 'epicrisis',
    title: 'Эпикриз родоразрешения и критерии качества',
    description: 'Итог случая: проведённое лечение, роды, новорождённый, выполнение 7 критериев качества КР.',
    fields: ['doctor', 'freeText'],
    build: (c, now) => {
      const d = c.delivery;
      const mode = d.mode ? { vaginal: 'через естественные родовые пути', cs: 'путём операции кесарева сечения', 'breech-vaginal': 'через естественные родовые пути в тазовом предлежании', forceps: 'с наложением акушерских щипцов' }[d.mode] : '______________';
      const ga = gestationalAge(c.patient, d.at ? new Date(d.at) : now);
      return {
        title: 'Эпикриз',
        blocks: [
          { text: header(c, now) },
          ...diagnosisBlock(c, now),
          { heading: 'Ситуация', text: SCENARIO_LABEL[c.clinical.scenario] },
          { heading: 'Проведённое лечение', text: treatmentGiven(c) },
          {
            heading: 'Родоразрешение',
            text: [
              `${fmtDT(d.at)} в сроке ${fmtGa(ga?.days)} — роды ${mode}${d.anesthesia ? `; анестезия: ${{ neuraxial: 'нейроаксиальная', general: 'общая', none: 'без анестезии' }[d.anesthesia]}` : ''}${d.enCaul ? '; извлечение в плодных оболочках' : ''}.`,
              `Новорождённый: масса ${blank(d.weightG, 5)} г, оценка по Апгар ${blank(d.apgar1, 2)}/${blank(d.apgar5, 2)} баллов.`,
              d.cordClampingSec !== undefined ? `Пережатие пуповины через ${d.cordClampingSec} с${d.neonatologist ? ' в присутствии неонатолога' : ''}${d.milking ? '; выполнено «доение» пуповины' : ''}.` : 'Пережатие пуповины: ______________.',
              d.thermalBag ? 'Новорождённый помещён в полиэтиленовый пакет под лучистое тепло.' : '',
              d.note,
            ]
              .filter(Boolean)
              .join('\n'),
          },
          {
            heading: 'Критерии качества (КР «Преждевременные роды», 2024)',
            text: QUALITY_CRITERIA.map((q, i) => `${i + 1}. ${q.text} — ${QUALITY_LABEL[qualityValue(c, q.id, now)]}`).join('\n'),
          },
          ...(c.extra.freeText ? [{ heading: 'Рекомендации', text: c.extra.freeText }] : []),
          { text: signature(c) },
        ],
      };
    },
  },
];

function suggestedDecision(c: Case, now: Date): string {
  const recs = recommendations(c, now).filter((r) => r.category === 'delivery' && (r.level === 'do' || r.level === 'consider') && !c.extra.excludedPlan.includes(r.id));
  const mode = recs.find((r) => /КС|кесар/i.test(r.title));
  return [
    `Родоразрешение ${mode ? 'путём операции кесарева сечения' : 'через естественные родовые пути'} в сроке ______ (обоснование: ${mode ? mode.title : 'КС не является методом выбора при ПР'}).`,
    'Анестезиологическое пособие: ______________.',
    'Присутствие неонатолога при родах; отсроченное пережатие пуповины при стабильном состоянии.',
  ].join('\n');
}

export function docToText(d: ConclusionDoc): string {
  return [d.title.toUpperCase(), ...d.blocks.map((b) => (b.heading ? `${b.heading}:\n${b.text}` : b.text))].join('\n\n');
}

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
