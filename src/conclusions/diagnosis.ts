import type { Case } from '../protocol/types';
import { buildCtx, formatHours } from '../protocol/rules';
import { fmtGaLong, gestationalAge, gaCategory, GA_CATEGORY_LABEL, wd } from '../protocol/ga';
import { entriesOf } from '../protocol/drugs';
import { RISK_FACTORS } from '../protocol/data';

export interface IcdCode {
  code: string;
  text: string;
}

export interface Diagnosis {
  /** Основной диагноз одной строкой. */
  main: string;
  /** Осложнения и сопутствующие состояния. */
  extra: string[];
  codes: IcdCode[];
  /** Обоснование: какие критерии КР выполнены. */
  rationale: string[];
}

const CHORION: Record<string, string> = {
  dichorionic: 'дихориальная диамниотическая',
  'monochorionic-diamniotic': 'монохориальная диамниотическая',
  'monochorionic-monoamniotic': 'монохориальная моноамниотическая',
};

const DOPPLER: Record<string, string> = {
  normal: '',
  mild: 'с нарушением гемодинамики (повышение ПИ в АП/МА или снижение ЦПО)',
  aedf: 'с нулевым диастолическим кровотоком в артерии пуповины',
  redf: 'с реверсным диастолическим кровотоком в артерии пуповины',
  dv: 'с нарушением кровотока в венозном протоке',
};

export function oligoSeverity(afi?: number, mvp?: number): string | undefined {
  if (afi !== undefined && afi <= 5) {
    if (afi <= 2) return 'тяжёлое маловодие';
    if (afi <= 4) return 'умеренное маловодие';
    return 'маловодие лёгкой степени';
  }
  if (mvp !== undefined && mvp <= 2) return 'маловодие';
  return undefined;
}

/** Формулировка клинического диагноза по введённым данным (черновик — врач редактирует). */
export function buildDiagnosis(c: Case, now: Date): Diagnosis {
  const cl = c.clinical;
  const x = buildCtx(c, now);
  const ga = gestationalAge(c.patient, now);
  const parts: string[] = [];
  const extra: string[] = [];
  const codes: IcdCode[] = [];
  const rationale: string[] = [];

  const n = cl.fetuses;
  const preg = n >= 2 ? `Беременность ${n === 2 ? 'двойней' : n === 3 ? 'тройней' : `${n} плодами`}${cl.chorionicity ? ` (${CHORION[cl.chorionicity]})` : ''}` : 'Беременность';
  parts.push(`${preg} ${fmtGaLong(ga?.days)}.`);

  const tocoGiven = entriesOf(c.meds, ['nifedipine-load', 'nifedipine', 'atosiban', 'indomethacin-load', 'indomethacin']).length > 0;
  const delivered = !!c.delivery.at;

  switch (cl.scenario) {
    case 'threat':
      parts.push('Угрожающие преждевременные роды.');
      codes.push({ code: 'O47.0', text: 'Ложные схватки до 37 полных недель беременности' });
      rationale.push('Жалобы, характерные для ПР, без объективных подтверждающих признаков (КР, раздел 2).');
      break;
    case 'imminent':
      parts.push('Начавшиеся преждевременные роды.');
      codes.push({ code: 'O60.0', text: 'Преждевременные роды без родоразрешения' });
      rationale.push('Жалобы, подтверждённые объективными признаками, без регулярной родовой деятельности (КР, раздел 2).');
      break;
    case 'active':
      parts.push('Преждевременные роды (активная фаза).');
      codes.push(delivered ? { code: 'O60.1', text: 'Преждевременные самопроизвольные роды с досрочным родоразрешением' } : { code: 'O60.0', text: 'Преждевременные роды без родоразрешения' });
      rationale.push('≥ 4 схваток за 20 мин (и/или ≥ 8 за 60 мин) и раскрытие шейки матки ≥ 4 см (КР, раздел 2).');
      break;
    case 'pprom': {
      parts.push(`Преждевременный разрыв плодных оболочек${x.latencyH !== undefined ? ` (безводный промежуток ${formatHours(x.latencyH)})` : ''}.`);
      if (x.activeLabor) parts.push('Преждевременные роды.');
      const code =
        tocoGiven && !delivered
          ? { code: 'O42.2', text: 'ПРПО, задержка родов, связанная с проводимой терапией' }
          : x.latencyH !== undefined && x.latencyH > 24
            ? { code: 'O42.1', text: 'ПРПО, начало родов после 24-часового безводного периода' }
            : x.activeLabor || delivered
              ? { code: 'O42.0', text: 'ПРПО, начало родов в последующие 24 ч' }
              : { code: 'O42.9', text: 'Преждевременный разрыв плодных оболочек неуточнённый' };
      codes.push(code);
      rationale.push('Подтекание околоплодных вод из цервикального канала при осмотре в зеркалах' + (cl.romTest === 'positive' ? ' / положительный тест ПСИФР-1 или ПАМГ-1' : '') + ' (КР, раздел 2).');
      break;
    }
    case 'induced':
      parts.push('Показания к досрочному родоразрешению.');
      codes.push({ code: 'O60.3', text: 'Преждевременное родоразрешение без самопроизвольных родов' });
      break;
    case 'prevention':
      break;
  }

  if (cl.cervixMm !== undefined && cl.cervixMm <= 25 && (cl.scenario === 'prevention' || cl.scenario === 'threat') && !x.ruptured) {
    extra.push(`Истмико-цервикальная недостаточность (длина шейки матки ${cl.cervixMm} мм)`);
    codes.push({ code: 'O34.3', text: 'Истмико-цервикальная недостаточность, требующая предоставления медицинской помощи матери' });
  }
  if (cl.presentation === 'breech') {
    extra.push('Тазовое предлежание плода');
    codes.push({ code: 'O32.1', text: 'Ягодичное предлежание плода, требующее предоставления медицинской помощи матери' });
  } else if (cl.presentation === 'transverse') {
    extra.push('Поперечное положение плода');
    codes.push({ code: 'O32.2', text: 'Поперечное или косое положение плода' });
  }
  if (n >= 2) codes.push({ code: n === 2 ? 'O30.0' : 'O30.1', text: n === 2 ? 'Беременность двойней' : 'Беременность тройней' });
  if (cl.fgr) {
    extra.push(`Задержка роста плода${ga && ga.days < wd(32) ? ' (ранняя)' : ''}${DOPPLER[cl.doppler] ? ` ${DOPPLER[cl.doppler]}` : ''}`);
    codes.push({ code: 'O36.5', text: 'Недостаточный рост плода, требующий предоставления медицинской помощи матери' });
  }
  const oligo = oligoSeverity(cl.afiCm, cl.mvpCm);
  if (oligo && cl.scenario !== 'pprom') {
    extra.push(cap(oligo));
    codes.push({ code: 'O41.0', text: 'Олигогидрамнион' });
  } else if (oligo) {
    extra.push(cap(oligo));
  }
  if (cl.flags.chorioamnionitis) {
    extra.push('Хориоамнионит');
    codes.push({ code: 'O41.1', text: 'Инфекция амниотической полости и плодных оболочек' });
  }
  if (cl.flags.severePreeclampsia) {
    extra.push('Тяжёлая преэклампсия');
    codes.push({ code: 'O14.1', text: 'Тяжёлая преэклампсия' });
  }
  if (cl.flags.abruption) extra.push('Преждевременная отслойка нормально расположенной плаценты');
  if (cl.flags.placentaPrevia) extra.push('Предлежание плаценты');
  if (cl.flags.diabetes) extra.push('Сахарный диабет');
  if (cl.gbs === 'positive') extra.push('Носительство стрептококка группы B');
  if (c.patient.riskFactors.some((id) => ['prev-ptb', 'late-miscarriage', 'prev-pprom'].includes(id))) {
    extra.push(
      'Отягощённый акушерский анамнез (' +
        RISK_FACTORS.filter((f) => ['prev-ptb', 'late-miscarriage', 'prev-pprom'].includes(f.id) && c.patient.riskFactors.includes(f.id))
          .map((f) => f.text.replace(' в анамнезе', '').toLowerCase())
          .join(', ') +
        ')',
    );
  }

  // Обоснование — объективные данные
  if (cl.cervixMm !== undefined) rationale.push(`УЗ-цервикометрия: длина шейки матки ${cl.cervixMm} мм${cl.cervixMm <= 25 ? ' (≤ 25 мм)' : ''}.`);
  if (cl.pretermTest !== 'not-done') rationale.push(`Тест на ПР (ПСИФР-1/ПАМГ-1/ИЛ-6): ${cl.pretermTest === 'positive' ? 'положительный' : 'отрицательный'}.`);
  if (cl.dilationCm !== undefined) rationale.push(`Раскрытие маточного зева ${cl.dilationCm} см.`);
  if (cl.contractionsPer20 !== undefined) rationale.push(`Сокращения матки: ${cl.contractionsPer20} за 20 мин.`);
  if (ga && ga.days >= wd(22) && ga.days < wd(37)) rationale.push(`Срок: ${GA_CATEGORY_LABEL[gaCategory(ga.days)]}.`);

  return { main: parts.join(' '), extra, codes, rationale };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function diagnosisText(d: Diagnosis): string {
  return [d.main, ...d.extra.map((e) => `${e}.`)].join(' ').replace(/\.\./g, '.').trim();
}
