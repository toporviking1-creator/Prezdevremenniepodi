import type { Case, Scenario } from './types';
import { RISK_FACTORS, type KrRef } from './data';
import { gestationalAge, wd, fmtGa } from './ga';
import { entriesOf, hoursSince, steroidCourses } from './drugs';

export type RecLevel = 'do' | 'consider' | 'avoid' | 'contra' | 'info';
export type RecCategory = 'dx' | 'route' | 'pprom' | 'tocolysis' | 'steroid' | 'mg' | 'abx' | 'prevention' | 'delivery' | 'newborn';

export const CATEGORY_LABEL: Record<RecCategory, string> = {
  dx: 'Диагностика',
  route: 'Маршрутизация',
  pprom: 'Тактика при ПРПО',
  tocolysis: 'Токолиз',
  steroid: 'Профилактика РДС плода',
  mg: 'Нейропротекция (магния сульфат)',
  abx: 'Антибактериальная терапия',
  prevention: 'Профилактика ПР',
  delivery: 'Родоразрешение',
  newborn: 'Новорождённый и после родов',
};

export const LEVEL_LABEL: Record<RecLevel, string> = {
  do: 'Показано',
  consider: 'Рассмотреть',
  avoid: 'Не рекомендовано',
  contra: 'Противопоказано',
  info: 'К сведению',
};

export interface Rec {
  id: string;
  category: RecCategory;
  level: RecLevel;
  title: string;
  detail?: string;
  ref?: KrRef;
  /** Пункт чек-листа, который закрывает рекомендацию. */
  checkId?: string;
  /** Препараты для быстрого введения. */
  drugs?: string[];
}

export interface Ctx {
  ga?: number;
  scenario: Scenario;
  ruptured: boolean;
  /** Объективные признаки ПР (укорочение шейки ≤ 25 мм, положительный тест, раскрытие ≥ 2 см). */
  objective: boolean;
  /** Объективные признаки достоверно отсутствуют (шейка > 25 мм и тест не положительный). */
  objectiveNegative: boolean;
  activeLabor: boolean;
  twins: boolean;
  historyHigh: boolean;
  shortCervixMidTrimester: boolean;
  laborExpected: boolean;
  oligohydramnios: boolean;
  gbsNeedsIap: boolean;
  latencyH?: number;
}

export function buildCtx(c: Case, now: Date): Ctx {
  const cl = c.clinical;
  const ga = gestationalAge(c.patient, now)?.days;
  const ruptured = cl.membranes === 'ruptured' || cl.scenario === 'pprom';
  const dil = cl.dilationCm ?? 0;
  const objective = (cl.cervixMm !== undefined && cl.cervixMm <= 25) || cl.pretermTest === 'positive' || dil >= 2;
  const objectiveNegative = cl.cervixMm !== undefined && cl.cervixMm > 25 && cl.pretermTest !== 'positive' && dil < 2;
  const activeLabor = cl.scenario === 'active' || ((cl.contractionsPer20 ?? 0) >= 4 && dil >= 4);
  const historyHigh = c.patient.riskFactors.some((id) => RISK_FACTORS.find((f) => f.id === id)?.historyHigh);
  const cervixWeeks = cl.cervixAtWeeks ?? (ga !== undefined ? Math.floor(ga / 7) : undefined);
  const shortCervixMidTrimester =
    cl.cervixMm !== undefined && cl.cervixMm < 25 && cervixWeeks !== undefined && cervixWeeks >= 16 && cervixWeeks <= 24;
  const laborExpected = ['imminent', 'active', 'pprom', 'induced'].includes(cl.scenario) || activeLabor;
  const oligohydramnios = (cl.mvpCm !== undefined && cl.mvpCm <= 2) || (cl.afiCm !== undefined && cl.afiCm <= 5);
  const gbsNegFresh =
    cl.gbs === 'negative' && (!cl.gbsDate || (now.getTime() - new Date(cl.gbsDate).getTime()) / 86_400_000 <= 35);
  const gbsNeedsIap = !gbsNegFresh && !(cl.plannedCs && !ruptured && !activeLabor);
  const latencyH = ruptured && cl.rupturedAt ? hoursSince(cl.rupturedAt, now) : undefined;
  return {
    ga,
    scenario: cl.scenario,
    ruptured,
    objective,
    objectiveNegative,
    activeLabor,
    twins: cl.fetuses >= 2,
    historyHigh,
    shortCervixMidTrimester,
    laborExpected,
    oligohydramnios,
    gbsNeedsIap,
    latencyH,
  };
}

/** Какой сценарий соответствует введённым данным (подсказка, решение — за врачом). */
export function suggestedScenario(c: Case, now: Date): Scenario | undefined {
  const x = buildCtx(c, now);
  if (c.clinical.scenario === 'induced' || c.clinical.scenario === 'prevention') return undefined;
  if (x.ruptured) return 'pprom';
  if (x.activeLabor) return 'active';
  if (x.objective) return 'imminent';
  if (x.objectiveNegative) return 'threat';
  return undefined;
}

export function tocolysisContraindications(c: Case, x: Ctx): string[] {
  const f = c.clinical.flags;
  const out: string[] = [];
  if (f.iufd) out.push('внутриутробная гибель плода');
  if (f.lethalAnomaly) out.push('ВПР, несовместимые с жизнью');
  if (f.severePreeclampsia) out.push('тяжёлая преэклампсия / эклампсия');
  if (f.unstableBleeding) out.push('кровотечение с нестабильной гемодинамикой');
  if (f.chorioamnionitis) out.push('хориоамнионит');
  if (f.abruption) out.push('ПОНРП');
  if (f.scarFailure) out.push('несостоятельность рубца на матке');
  if (f.maternalTocolysisContra) out.push('противопоказания со стороны матери');
  if (x.ruptured && x.ga !== undefined && x.ga >= wd(32)) out.push('ПРПО при сроке более 32 нед');
  if ((c.clinical.dilationCm ?? 0) > 4) out.push('раскрытие маточного зева более 4 см');
  return out;
}

const inRange = (ga: number | undefined, from: number, toExcl: number) => ga !== undefined && ga >= from && ga < toExcl;

/** Рекомендации по КР «Преждевременные роды» (2024) и смежным КР для текущей ситуации. */
export function recommendations(c: Case, now: Date): Rec[] {
  const cl = c.clinical;
  const f = cl.flags;
  const x = buildCtx(c, now);
  const ga = x.ga;
  const out: Rec[] = [];
  const add = (r: Rec) => out.push(r);
  const prev = cl.scenario === 'prevention';
  const preterm = inRange(ga, wd(22), wd(37));

  // --- Срок ---
  if (ga === undefined) {
    add({ id: 'ga-unknown', category: 'dx', level: 'info', title: 'Укажите срок беременности (ПМ, УЗИ 11–13+6 нед или вручную) — от него зависит тактика.', ref: { section: '1.1' } });
  } else if (ga < wd(22) && !prev) {
    add({ id: 'ga-early', category: 'dx', level: 'info', title: `Срок ${fmtGa(ga)}: менее 22 нед — не относится к преждевременным родам.`, ref: { section: '1.1' } });
  } else if (ga >= wd(37)) {
    add({ id: 'ga-term', category: 'dx', level: 'info', title: `Срок ${fmtGa(ga)}: доношенная беременность — КР «Преждевременные роды» не применяются.`, ref: { section: '1.1' } });
  }

  const sug = suggestedScenario(c, now);
  if (sug && sug !== cl.scenario) {
    const names: Record<Scenario, string> = {
      prevention: 'профилактика',
      threat: 'угрожающие ПР',
      imminent: 'начавшиеся (неминуемые) ПР',
      active: 'активные ПР',
      pprom: 'ПРПО',
      induced: 'индуцированные ПР',
    };
    add({
      id: 'scenario-mismatch',
      category: 'dx',
      level: 'info',
      title: `По введённым данным ситуация соответствует: ${names[sug]}. Проверьте выбранный сценарий.`,
      detail:
        'Угрожающие ПР — жалобы без объективных признаков; начавшиеся — жалобы, подтверждённые цервикометрией/влагалищным исследованием/тестами; активные — ≥ 4 схваток за 20 мин и раскрытие ≥ 4 см.',
      ref: { section: '2' },
    });
  }

  // --- Диагностика ---
  if (!prev) {
    add({ id: 'dx-vitals', category: 'dx', level: 'do', title: 'АД, пульс, ЧДД — оценка витальных функций', ref: { section: '2.2', grade: 'C', level: 4 }, checkId: 'dx-vitals' });
    add({
      id: 'dx-fetal',
      category: 'dx',
      level: 'do',
      title: 'Аускультация плода; частота, продолжительность и интенсивность сокращений матки',
      ref: { section: '2.2', grade: 'C', level: 4 },
      checkId: 'dx-fetal',
    });
    add({
      id: 'dx-speculum',
      category: 'dx',
      level: 'do',
      title: 'Осмотр шейки матки в стерильных одноразовых зеркалах (по Куско)',
      detail: 'Оценка цервикального канала, кровянистых выделений, пролабирования плодного пузыря, выпадения петель пуповины/мелких частей при ПРПО, воспаления.',
      ref: { section: '2.2', grade: 'C', level: 5 },
      checkId: 'dx-speculum',
    });
    if (x.ruptured && !x.activeLabor) {
      add({
        id: 'dx-no-vaginal',
        category: 'dx',
        level: 'avoid',
        title: 'Влагалищное исследование при ПРПО без родовой деятельности не проводить',
        detail: 'Не даёт дополнительной информации, но увеличивает риск восходящей инфекции.',
        ref: { section: '2.2', grade: 'C', level: 5 },
      });
    } else {
      add({
        id: 'dx-vaginal',
        category: 'dx',
        level: f.placentaPrevia ? 'avoid' : 'consider',
        title: f.placentaPrevia
          ? 'Влагалищное исследование — только после исключения предлежания плаценты (УЗИ)'
          : 'Влагалищное исследование — после исключения предлежания плаценты и ПРПО',
        ref: { section: '2.2', grade: 'C', level: 5 },
        checkId: 'dx-vaginal',
      });
    }
    if (cl.scenario === 'pprom' && cl.romTest === 'not-done') {
      add({
        id: 'dx-romtest',
        category: 'dx',
        level: 'consider',
        title: 'Если подтекание вод в зеркалах достоверно не видно — тест на ПСИФР-1 / ПАМГ-1',
        detail: 'Подтекание вод из цервикального канала или скопление жидкости во влагалище в зеркалах — дальнейшие тесты не нужны. Симптом «папоротника» — > 20% ложноотрицательных; нитразиновый тест — 5–30% ложноположительных. Роль ИАЖ/МВК неясна.',
        ref: { section: '2.3', grade: 'C', level: 5 },
        checkId: 'dx-romtest',
      });
    }
    if (['threat', 'imminent'].includes(cl.scenario) && inRange(ga, wd(24), wd(34))) {
      add({
        id: 'dx-tests',
        category: 'dx',
        level: cl.pretermTest === 'not-done' ? 'do' : 'info',
        title: 'Тесты на вероятность ПР в ближайшие 7–14 дней: ИЛ-6, ПСИФР-1, ПАМГ-1 (комбинация)',
        detail: 'Отрицательный тройной тест — низкий риск ПР в течение 7 дней (98,5%). ПАМГ-1: чувствительность 84%, специфичность 95%.',
        ref: { section: '2.3', grade: 'A', level: 2 },
        checkId: 'dx-tests',
      });
    }
    if (['threat', 'imminent'].includes(cl.scenario) && cl.cervixMm === undefined) {
      add({ id: 'dx-cervicometry', category: 'dx', level: 'do', title: 'УЗ-цервикометрия (трансвагинально)', ref: { section: '2.4', grade: 'A', level: 1 }, checkId: 'dx-cervicometry' });
    }
    if (['threat', 'imminent', 'active', 'pprom'].includes(cl.scenario)) {
      add({
        id: 'dx-gbs',
        category: 'dx',
        level: cl.gbs === 'unknown' ? 'do' : 'info',
        title: 'Обследование на СГВ: ПЦР отделяемого цервикального канала и/или влагалищного и ректального мазков, и/или посев',
        detail: cl.gbs === 'unknown' ? undefined : `Статус СГВ: ${cl.gbs === 'positive' ? 'носительство' : 'отрицательный'}.`,
        ref: { section: '2.3', grade: 'B', level: 2 },
        checkId: 'dx-gbs',
      });
    }
    if (x.ruptured) {
      add({
        id: 'dx-wbc-crp',
        category: 'dx',
        level: 'do',
        title: 'Лейкоциты крови и С-реактивный белок — ранняя диагностика септических осложнений',
        detail: 'Лейкоцитоз возрастает через 24 ч после ГКС и возвращается к исходному через 3 дня. СРБ точнее (Se 68,7%, Sp 77,1%). Хориоамнионит — по сочетанию клинических и лабораторных признаков.',
        ref: { section: '2.3', grade: 'B', level: 2 },
        checkId: 'dx-wbc-crp',
      });
    }
    add({
      id: 'dx-us',
      category: 'dx',
      level: 'do',
      title: 'УЗИ плода: предлежание, ПМП, ИАЖ/МВК, плацента, допплерометрия',
      detail: 'Маловодие: МВК ≤ 2 см или ИАЖ ≤ 5 см (МВК точнее для маловодия).',
      ref: { section: '1.4', doc: 'aj', grade: 'C', level: 5 },
      checkId: 'dx-us',
    });
  }
  if (cl.cervixMm !== undefined && cl.cervixMm <= 25 && inRange(ga, wd(22), wd(24)) && !x.ruptured) {
    add({
      id: 'dx-amnio',
      category: 'dx',
      level: 'consider',
      title: 'Диагностический трансабдоминальный амниоцентез (консилиум) — перед решением о хирургической коррекции ИЦН',
      detail: 'Частота хориоамнионита при родоразрешении в 22–23+6 нед — 94,4%. При подтверждении внутриамниотической инфекции серкляж, как правило, не проводят.',
      ref: { section: '2.5', grade: 'C', level: 4 },
      checkId: 'dx-amnio',
    });
  }

  // --- Маршрутизация ---
  if (!prev && preterm && cl.scenario !== 'threat') {
    add({
      id: 'route',
      category: 'route',
      level: 'do',
      title:
        ga! < wd(34)
          ? 'Госпитализация (перевод) в медицинскую организацию 3а группы — при отсутствии противопоказаний к транспортировке'
          : 'Госпитализация в стационар 3а группы, при отсутствии возможности — 2-й группы с ОРИТН (палатами) для новорождённых',
      ref: { section: '6' },
      checkId: 'route',
    });
  }
  if (cl.scenario === 'threat' && x.objectiveNegative) {
    add({
      id: 'route-low',
      category: 'route',
      level: 'info',
      title: 'Низкий риск ПР в ближайшие 7 дней: оценить целесообразность госпитализации, провести беседу с пациенткой',
      ref: { section: 'Прил. Б' },
    });
  }
  if (inRange(ga, wd(22), wd(26)) && !prev) {
    add({
      id: 'counsel',
      category: 'route',
      level: 'do',
      title: 'Информировать пациентку и семью (акушер-гинеколог + неонатолог) о прогнозе для новорождённого и о преимуществах/последствиях методов родоразрешения',
      detail: 'Родившиеся в 22–23+6 нед: смертность 97–98%; в 24–24+6 нед выживают 55%, без неврологического дефицита к 18–22 мес — 32%.',
      ref: { section: '1.3; 3.4' },
      checkId: 'counsel',
    });
  }

  // --- ПРПО ---
  if (x.ruptured && !prev) {
    if (inRange(ga, wd(24), wd(37))) {
      const gbsPos = cl.gbs === 'positive';
      if (gbsPos && ga! >= wd(34)) {
        add({
          id: 'pprom-gbs34',
          category: 'pprom',
          level: 'do',
          title: 'Носительство СГВ и срок ≥ 34 нед: выжидательная тактика не рекомендована — родоразрешение',
          detail: 'Пролонгирование беременности у носительниц СГВ после 34 нед связано с более высоким риском инфекционных перинатальных осложнений.',
          ref: { section: '3.3', grade: 'A', level: 1 },
        });
      } else {
        add({
          id: 'pprom-expectant',
          category: 'pprom',
          level: 'do',
          title: gbsPos
            ? 'Выжидательная тактика до 34+0 нед (носительство СГВ) под контролем состояния беременной и плода'
            : 'Выжидательная тактика, направленная на пролонгирование беременности, под контролем состояния беременной и плода',
          detail: 'Периодическая клинико-лабораторная оценка: исключение инфекции, ПОНРП, компрессии пуповины, начала родовой деятельности; оценка состояния плода.',
          ref: { section: '3.3', grade: 'A', level: 1 },
          checkId: 'pprom-expectant',
        });
      }
    } else if (inRange(ga, wd(22), wd(24))) {
      add({
        id: 'pprom-periviable',
        category: 'pprom',
        level: 'info',
        title: 'ПРПО в 22–23+6 нед: тактика определяется индивидуально (консилиум), с информированием семьи о прогнозе',
        ref: { section: '3.1; 5.1' },
      });
    }
    add({ id: 'pprom-inpatient', category: 'pprom', level: 'do', title: 'Наблюдение в условиях круглосуточного стационара', ref: { section: '3.3', grade: 'A', level: 1 }, checkId: 'pprom-inpatient' });
    add({ id: 'pprom-no-amnioinfusion', category: 'pprom', level: 'avoid', title: 'Рутинная амниоинфузия', ref: { section: '3.1', grade: 'A', level: 1 } });
    if (f.chorioamnionitis) {
      add({
        id: 'pprom-chorio',
        category: 'pprom',
        level: 'info',
        title: 'Хориоамнионит: токолиз противопоказан, пролонгирование беременности нецелесообразно — решение о родоразрешении консилиумом; ГКС при хориоамнионите безопасны',
        ref: { section: '3.1; 5.1' },
      });
    }
    if (x.latencyH !== undefined) {
      add({
        id: 'pprom-latency',
        category: 'pprom',
        level: 'info',
        title: `Безводный промежуток: ${formatHours(x.latencyH)}`,
        detail: 'Код МКБ-10: O42.0 — роды в течение 24 ч; O42.1 — после 24 ч; O42.2 — задержка родов, связанная с терапией.',
      });
    }
  }

  // --- Токолиз ---
  const tocoScenario = ['threat', 'imminent', 'active', 'pprom'].includes(cl.scenario);
  if (tocoScenario && preterm) {
    const contra = tocolysisContraindications(c, x);
    const pprNoContractions = cl.scenario === 'pprom' && !(cl.contractionsPer20 ?? 0);
    if (ga! >= wd(34)) {
      add({ id: 'toco-34', category: 'tocolysis', level: 'avoid', title: 'Токолиз после 34+0 нед не проводится', detail: 'Порог, при котором перинатальная заболеваемость и смертность достаточно низки.', ref: { section: '3.1' } });
    } else if (contra.length) {
      add({ id: 'toco-contra', category: 'tocolysis', level: 'contra', title: `Токолиз противопоказан: ${contra.join('; ')}`, ref: { section: '3.1' } });
    } else if (cl.scenario === 'threat' && x.objectiveNegative) {
      add({
        id: 'toco-no-objective',
        category: 'tocolysis',
        level: 'avoid',
        title: 'Токолиз при отсутствии объективных признаков ПР (шейка > 25 мм, тесты отрицательные)',
        detail: 'У 75–95% пациенток ПР в течение 7 дней не происходят; токолиз — только при неминуемых ПР.',
        ref: { section: '3.1', grade: 'C', level: 2 },
      });
    } else if (cl.scenario === 'threat' && !x.objective) {
      add({ id: 'toco-objectify', category: 'tocolysis', level: 'info', title: 'Сначала объективизировать диагноз (цервикометрия, тесты на ПР): токолиз проводится только при начавшихся (неминуемых) ПР', ref: { section: '3.1', grade: 'C', level: 2 } });
    } else if (pprNoContractions) {
      add({ id: 'toco-pprom-none', category: 'tocolysis', level: 'info', title: 'Сократительной активности нет — токолиз не требуется', ref: { section: '3.1' } });
    } else if (ga! < wd(24)) {
      add({ id: 'toco-periviable', category: 'tocolysis', level: 'consider', title: 'Токолиз до 24 нед — индивидуально, с разъяснением семье неблагоприятного прогноза', ref: { section: '3.1' } });
    } else {
      const atoFirst = f.nifedipineContra;
      add({
        id: 'toco',
        category: 'tocolysis',
        level: 'do',
        title: `Острый токолиз на 48 ч — ${atoFirst ? 'атозибан (противопоказания к #нифедипину)' : '#нифедипин (1-я линия) или атозибан'}`,
        detail:
          'Цель — выиграть 48 ч для профилактики РДС, нейропротекции магния сульфатом и перевода в стационар 3-й группы. #Нифедипин: 20 мг внутрь, далее 10 мг каждые 6 ч (3–7 дней или до перевода). Атозибан — при противопоказаниях к нифедипину, особенно в 32–33+6 нед.',
        ref: { section: '3.1', grade: 'A', level: 1 },
        checkId: 'toco',
        drugs: atoFirst ? ['atosiban'] : ['nifedipine-load', 'atosiban'],
      });
      if (ga! <= wd(28, 6)) {
        add({
          id: 'toco-indo',
          category: 'tocolysis',
          level: f.indomethacinContra ? 'contra' : 'consider',
          title: f.indomethacinContra ? '#Индометацин противопоказан' : '2-я линия: #индометацин (до 28+6 нед) — 50–100 мг, затем 25 мг каждые 6 ч, не более 48 ч',
          ref: { section: '3.1', grade: 'A', level: 1 },
          drugs: f.indomethacinContra ? undefined : ['indomethacin-load'],
        });
      }
      if (!atoFirst) {
        add({
          id: 'toco-vk',
          category: 'tocolysis',
          level: 'do',
          title: '#Нифедипин — off-label: заключение врачебной комиссии (зав. отделением + 2 акушера-гинеколога) и письменное ИДС пациентки',
          ref: { section: '3.1' },
          checkId: 'vk-nifedipine',
        });
      }
    }
    add({ id: 'toco-no-beta', category: 'tocolysis', level: 'avoid', title: 'β-адреномиметики (в т.ч. гексопреналин) для токолиза — риск астмы у детей', ref: { section: '3.1', grade: 'B', level: 3 } });
    add({ id: 'toco-no-mg', category: 'tocolysis', level: 'avoid', title: 'Магния сульфат как токолитик', ref: { section: '3.1', grade: 'A', level: 1 } });
    add({ id: 'toco-no-multi', category: 'tocolysis', level: 'avoid', title: 'Многокомпонентный токолиз (≥ 3 препаратов)', ref: { section: '3.1', grade: 'A', level: 1 } });
    add({ id: 'toco-no-maint', category: 'tocolysis', level: 'avoid', title: 'Рутинный поддерживающий токолиз после острого', ref: { section: '3.1', grade: 'A', level: 1 } });
  }

  // --- Профилактика РДС ---
  if (!prev && preterm) {
    const courses = steroidCourses(c.meds);
    const running = courses.find((k) => !k.complete);
    const done = courses.filter((k) => k.complete);
    const eligibleScenario =
      cl.scenario === 'imminent' || cl.scenario === 'active' || cl.scenario === 'pprom' || cl.scenario === 'induced' || (cl.scenario === 'threat' && x.objective);
    if (running) {
      const last = running.doses.at(-1)!;
      const next = new Date(new Date(last.at).getTime() + running.intervalH * 3_600_000);
      add({
        id: 'rds-running',
        category: 'steroid',
        level: 'info',
        title: `Курс профилактики РДС: введено ${running.doses.length} из ${running.needed}; следующая доза — ${next.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
        detail: 'Если полный курс провести не удаётся — профилактику всё равно начинают (эффект «неполной дозы»).',
        ref: { section: '5.1' },
        drugs: [running.drug],
      });
    } else if (cl.scenario === 'threat' && x.objectiveNegative) {
      add({ id: 'rds-no', category: 'steroid', level: 'avoid', title: 'Профилактика РДС при отсутствии данных о неминуемых ПР (шейка > 25 мм, тест отрицательный)', ref: { section: '3.3', grade: 'C', level: 5 } });
    } else if (eligibleScenario) {
      if (ga! < wd(24)) {
        add({
          id: 'rds-22',
          category: 'steroid',
          level: 'avoid',
          title: 'Профилактика РДС в 22–23+6 нед не рекомендована (может быть рассмотрена индивидуально после информирования семьи акушером и неонатологом)',
          ref: { section: '5.1', grade: 'A', level: 3 },
        });
      } else if (ga! < wd(34)) {
        if (!done.length) {
          add({
            id: 'rds',
            category: 'steroid',
            level: 'do',
            title: 'Антенатальная профилактика РДС плода: #бетаметазон 12 мг в/м × 2 через 24 ч или #дексаметазон 6 мг в/м × 4 через 12 ч (или 12 мг × 2 через 24 ч)',
            detail: 'Максимальный эффект — на 2–7 сутки. Off-label — письменное ИДС пациентки' + (x.twins ? '; при многоплодии — также заключение ВК.' : '.'),
            ref: { section: '5.1', grade: 'A', level: 1 },
            checkId: 'rds',
            drugs: ['betamethasone', 'dexamethasone'],
          });
        } else {
          const lastStart = done.at(-1)!.start;
          const days = hoursSince(lastStart, now) / 24;
          if (done.length >= 2) {
            add({ id: 'rds-max', category: 'steroid', level: 'avoid', title: `Проведено ${done.length} курса — регулярные/серийные повторные курсы (более 2) не рекомендованы`, ref: { section: '5.1', grade: 'B', level: 2 } });
          } else if (days >= 14 && cl.scenario !== 'pprom') {
            add({
              id: 'rds-repeat',
              category: 'steroid',
              level: 'consider',
              title: `Однократный повторный курс (с прошлого — ${Math.floor(days)} сут ≥ 14) при сохраняющихся симптомах начавшихся ПР, особенно < 28 нед`,
              detail: 'Решение — по времени от последнего курса, сроку и вероятности родоразрешения в ближайшие 48 ч.',
              ref: { section: '5.1', grade: 'A', level: 1 },
              drugs: ['betamethasone', 'dexamethasone'],
            });
          } else if (days >= 7) {
            add({
              id: 'rds-rescue',
              category: 'steroid',
              level: 'consider',
              title: `«Спасительный» (rescue) курс возможен через 7 сут (прошло ${Math.floor(days)} сут) при клинической целесообразности${cl.scenario === 'pprom' ? ' — при ПРПО вопрос спорный' : ''}`,
              ref: { section: '5.1', grade: 'A', level: 1 },
              drugs: ['betamethasone', 'dexamethasone'],
            });
          } else {
            add({ id: 'rds-done', category: 'steroid', level: 'info', title: `Курс профилактики РДС завершён ${Math.floor(days)} сут назад — повторный не ранее чем через 7 (rescue) / 14 сут`, ref: { section: '5.1' } });
          }
        }
      } else if (ga! < wd(36)) {
        add({
          id: 'rds-34',
          category: 'steroid',
          level: done.length ? 'info' : f.diabetes ? 'consider' : 'info',
          title: done.length
            ? 'Курс уже проводился — в 34–35+6 нед повторно не показан'
            : 'В 34–35+6 нед профилактика РДС может быть рекомендована, если ранее не проводилась, при клинической целесообразности (сахарный диабет)',
          ref: { section: '5.1', grade: 'A', level: 2 },
          drugs: done.length ? undefined : ['betamethasone', 'dexamethasone'],
        });
      }
    }
  }

  // --- Магния сульфат ---
  const mgScenario = ['imminent', 'active', 'pprom', 'induced'].includes(cl.scenario) || x.activeLabor;
  const mgFgr = cl.fgr && cl.scenario === 'induced' && inRange(ga, wd(24), wd(32));
  if (!prev && mgScenario && inRange(ga, wd(24), wd(34))) {
    const bolus = entriesOf(c.meds, 'mg-bolus').at(-1);
    const stop = entriesOf(c.meds, 'mg-stop').at(-1);
    const runningMg = bolus && (!stop || stop.at < bolus.at) && hoursSince(bolus.at, now) < 24;
    if (f.myasthenia) {
      add({ id: 'mg-contra', category: 'mg', level: 'contra', title: 'Магния сульфат противопоказан при миастении (риск миастенического криза)', ref: { section: '3.1' } });
    } else if (runningMg) {
      add({
        id: 'mg-running',
        category: 'mg',
        level: 'info',
        title: `Магния сульфат: ${formatHours(hoursSince(bolus!.at, now))} от болюса — прекратить через 24 ч, если роды не наступили`,
        detail: 'Контроль токсичности не реже чем каждые 4 ч: пульс, АД, ЧДД, коленные рефлексы.',
        ref: { section: '3.1' },
      });
    } else {
      add({
        id: 'mg',
        category: 'mg',
        level: 'do',
        title: 'Магния сульфат для нейропротекции плода: 4 г в/в за 20–30 мин, затем 1 г/ч до родов или 24 ч',
        detail:
          'Начинать, когда ПР планируются или ожидаются, лучше в ближайшие 4 ч до родов; независимо от причины ПР и при многоплодии. Максимальный эффект — до 30+6 нед.' +
          (mgFgr ? ' При ЗРП до 32 нед — не менее 12 ч, но не более 24 ч (КР «ЗРП»).' : ''),
        ref: { section: '3.1', grade: 'A', level: 1 },
        checkId: 'mg',
        drugs: ['mg-bolus'],
      });
    }
    if (f.cardiacConduction) add({ id: 'mg-cardiac', category: 'mg', level: 'avoid', title: 'Нарушения сердечной проводимости — избегать магния сульфата (антиинотропное действие)', ref: { section: '3.1' } });
    if (f.renalImpairment) add({ id: 'mg-renal', category: 'mg', level: 'info', title: 'Нарушение функции почек — дозу магния сульфата подбирать индивидуально (риск гипермагниемии)', ref: { section: '3.1' } });
  }

  // --- Антибактериальная терапия ---
  if (x.ruptured && preterm && !prev) {
    add({
      id: 'abx-pprom',
      category: 'abx',
      level: 'do',
      title: f.penicillinAllergy
        ? 'Антибактериальная терапия при ПРПО 10 дней (или до родов): #эритромицин 250 мг каждые 6 ч (аллергия на пенициллины) или #азитромицин'
        : 'Антибактериальная терапия при ПРПО с момента диагноза 10 дней (или до родов): #ампициллин 2 г в/в каждые 6 ч 48 ч + #амоксициллин 250 мг каждые 8 ч 5 дней, или #эритромицин 250 мг каждые 6 ч до 10 дней',
      detail: 'Возможна комбинация парентеральных пенициллинов и #азитромицина 1000 мг внутрь однократно. #Азитромицин — заключение ВК и письменное ИДС.',
      ref: { section: '3.1', grade: 'A', level: 1 },
      checkId: 'abx-pprom',
      drugs: f.penicillinAllergy ? ['erythromycin', 'azithromycin'] : ['ampicillin', 'erythromycin', 'azithromycin'],
    });
    add({ id: 'abx-no-amoxiclav', category: 'abx', level: 'avoid', title: 'Амоксициллин + клавулановая кислота при ПРПО — риск НЭК у новорождённых', ref: { section: '3.1', grade: 'C', level: 5 } });
  } else if (['threat', 'imminent'].includes(cl.scenario) && !f.infectionSigns) {
    add({
      id: 'abx-no',
      category: 'abx',
      level: 'avoid',
      title: 'Антибиотики для пролонгирования беременности при интактных оболочках без признаков инфекции',
      detail: 'Не распространяется на ПРПО и носительниц СГВ.',
      ref: { section: '5.2', grade: 'A', level: 1 },
    });
  }
  if (!prev && preterm && (x.laborExpected || cl.scenario === 'threat')) {
    if (x.gbsNeedsIap) {
      add({
        id: 'gbs-iap',
        category: 'abx',
        level: x.laborExpected ? 'do' : 'info',
        title:
          cl.gbs === 'positive'
            ? 'Носительство СГВ: интранатальная антибиотикопрофилактика с началом родов'
            : 'Статус СГВ не установлен: интранатальная антибиотикопрофилактика с началом родов',
        detail: 'Эффективная экспозиция — 4 ч до рождения. После купирования ПР и при новой угрозе — повторить.',
        ref: { section: '5.2', grade: 'C', level: 5 },
        checkId: 'gbs-iap',
        drugs: ['gbs-iap'],
      });
    } else {
      add({
        id: 'gbs-none',
        category: 'abx',
        level: 'info',
        title: 'Интранатальная профилактика СГВ не требуется (отрицательный посев ≤ 5 нед или КС при целом плодном пузыре)',
        ref: { section: '5.2', grade: 'C', level: 5 },
      });
    }
  }

  // --- Профилактика ПР (бессимптомные) ---
  if (prev || cl.scenario === 'threat') {
    const gaOk = ga === undefined || ga < wd(34);
    if (gaOk && (x.shortCervixMidTrimester || x.historyHigh || (x.twins && cl.cervixMm !== undefined && cl.cervixMm <= 25))) {
      add({
        id: 'prev-progesterone',
        category: 'prevention',
        level: 'do',
        title: 'Прогестерон микронизированный 200 мг/сут вагинально с 16 до 34 нед',
        detail: x.twins
          ? 'Многоплодие: при длине шейки ≤ 25 мм до 34 нед (КР «Многоплодная беременность», А1).'
          : 'Бессимптомное укорочение шейки < 25 мм в 16–24 нед и/или ПР до 34 нед / поздний выкидыш после 16 нед в анамнезе.',
        ref: x.twins ? { section: '5', doc: 'mult', grade: 'A', level: 1 } : { section: '5.3', grade: 'A', level: 1 },
        checkId: 'prev-progesterone',
        drugs: ['progesterone'],
      });
    }
    if (x.historyHigh && x.shortCervixMidTrimester) {
      add({ id: 'prev-highrisk', category: 'prevention', level: 'info', title: 'Пациентка группы высокого риска ПР (анамнез + шейка < 25 мм в 16–24+6 нед)', ref: { section: '2.1', grade: 'A', level: 1 } });
    }
    const cerclageWindow = ga === undefined || inRange(ga, wd(16), wd(27));
    if (!x.twins && cerclageWindow && cl.cervixMm !== undefined && cl.cervixMm <= 25 && cl.membranes === 'intact') {
      const contra = f.infectionSigns || f.vaginalBleeding || f.chorioamnionitis || (cl.contractionsPer20 ?? 0) > 0;
      if (contra) {
        add({ id: 'prev-cerclage-contra', category: 'prevention', level: 'contra', title: 'Серкляж не рекомендован: признаки инфекции, кровотечение или сокращения матки', ref: { section: '3.2', grade: 'C', level: 4 } });
      } else {
        const indicated = c.patient.riskFactors.some((r) => ['prev-ptb', 'prev-pprom', 'late-miscarriage'].includes(r)) || f.cervicalTrauma;
        add({
          id: 'prev-cerclage',
          category: 'prevention',
          level: 'consider',
          title: `Серкляж (16–26+6 нед) — коллегиально${ga !== undefined && ga >= wd(24) ? '; после 24 нед — только в стационаре 3-й группы' : ''}`,
          detail: indicated
            ? 'Одноплодная беременность, шейка ≤ 25 мм в 16–24 нед и спонтанные ПР/ПРПО в анамнезе или травма шейки — показания к профилактическому серкляжу (А1).'
            : 'При укорочении шейки и интактных оболочках (А1); оценить пользу и риск с учётом срока, раскрытия, квалификации и возможностей стационара.',
          ref: { section: '3.2; 5.4', grade: 'A', level: 1 },
          checkId: 'prev-cerclage',
        });
        add({ id: 'prev-anesth', category: 'prevention', level: 'info', title: 'Анестезия при серкляже: нейроаксиальная или общая (трансвагинально — с сохранением спонтанного дыхания)', ref: { section: '3.2', grade: 'C', level: 5 } });
      }
    }
    if (x.twins) {
      add({ id: 'prev-twin-nocerclage', category: 'prevention', level: 'avoid', title: 'Профилактический серкляж при многоплодии', ref: { section: '5', doc: 'mult', grade: 'A', level: 2 } });
      if ((cl.cervixMm !== undefined && cl.cervixMm < 15) || (cl.funnelMm ?? 0) > 10) {
        add({ id: 'prev-twin-cerclage', category: 'prevention', level: 'consider', title: 'Серкляж при многоплодии: шейка < 15 мм и/или расширение канала > 10 мм', ref: { section: '5', doc: 'mult', grade: 'A', level: 1 }, checkId: 'prev-cerclage' });
      }
      add({
        id: 'prev-twin-pessary',
        category: 'prevention',
        level: f.intrauterineIntervention && cl.cervixMm !== undefined && cl.cervixMm <= 25 ? 'consider' : 'avoid',
        title:
          f.intrauterineIntervention && cl.cervixMm !== undefined && cl.cervixMm <= 25
            ? 'Пессарий: внутриутробное вмешательство + укорочение шейки (снижает ПР до 34 нед)'
            : 'Рутинный акушерский пессарий при многоплодии',
        ref: { section: '5', doc: 'mult', grade: 'A', level: 1 },
      });
    } else if (cl.cervixMm !== undefined && cl.cervixMm < 25 && (ga === undefined || ga < wd(37))) {
      add({
        id: 'prev-pessary',
        category: 'prevention',
        level: 'consider',
        title: 'Акушерский пессарий при шейке < 25 мм (после 24 нед — метод выбора)',
        ref: { section: '5.4', grade: 'B', level: 2 },
        checkId: 'prev-pessary',
      });
    }
    if (prev) {
      add({ id: 'prev-cervicometry', category: 'prevention', level: 'do', title: x.twins ? 'УЗ-цервикометрия в 16–20 нед' : 'УЗ-цервикометрия пациенткам группы риска', ref: x.twins ? { section: '5', doc: 'mult', grade: 'B', level: 1 } : { section: '2.4', grade: 'A', level: 1 }, checkId: 'dx-cervicometry' });
      add({ id: 'prev-no-bedrest', category: 'prevention', level: 'avoid', title: 'Постельный режим, ограничение физической активности, половое воздержание', ref: { section: '5.4', grade: 'A', level: 1 } });
      add({ id: 'prev-no-vitamins', category: 'prevention', level: 'avoid', title: 'Витамин D, омега-3, поливитамины, витамины C и E для профилактики ПР', ref: { section: '5.4', grade: 'A', level: 1 } });
      add({ id: 'prev-adjuvant', category: 'prevention', level: 'info', title: 'Прогрессирующее укорочение шейки после серкляжа — адъювантно прогестерон 200 мг/сут вагинально до 34 нед', ref: { section: '5.3', grade: 'C', level: 4 } });
    }
  }

  // --- Родоразрешение ---
  if (!prev && preterm && (x.laborExpected || cl.scenario === 'pprom')) {
    add({ id: 'del-analgesia', category: 'delivery', level: 'do', title: 'Нейроаксиальная аналгезия родов (при отсутствии противопоказаний); избегать опиоидов как адъювантов', ref: { section: '3.4', grade: 'A', level: 1 }, checkId: 'del-analgesia' });
    if (cl.presentation === 'breech') {
      if (ga! < wd(26)) {
        add({ id: 'del-breech-early', category: 'delivery', level: 'avoid', title: 'КС при тазовом предлежании в 22–25+6 нед', ref: { section: '3.5', doc: 'breech', grade: 'C', level: 5 } });
      } else if (ga! < wd(33)) {
        add({
          id: 'del-breech-cs',
          category: 'delivery',
          level: 'do',
          title: 'Тазовое предлежание до 32+6 нед: КС — метод выбора',
          detail: 'В 26–32 нед КС предпочтительно (КР «Тазовое предлежание», С4). До 27+6 нед КС связано с меньшей неонатальной смертностью и тяжёлыми ВЖК.',
          ref: { section: '3.4', grade: 'B', level: 2 },
          checkId: 'del-mode',
        });
      } else {
        add({ id: 'del-breech-late', category: 'delivery', level: 'consider', title: 'Тазовое предлежание ≥ 33 нед: способ индивидуализировать (период родов, вид предлежания, состояние плода, опыт врача)', ref: { section: '3.4' } });
      }
      add({ id: 'del-breech-consilium', category: 'delivery', level: 'do', title: 'Способ родоразрешения при ПР и тазовом предлежании — консилиумом после обсуждения с пациенткой и партнёром', ref: { section: '3.5', doc: 'breech', grade: 'B', level: 2 }, checkId: 'del-consilium' });
    } else if (x.twins) {
      if (cl.chorionicity === 'monochorionic-monoamniotic') {
        add({ id: 'del-mcma', category: 'delivery', level: 'do', title: 'Монохориальная моноамниотическая двойня: КС в 32–34 нед', ref: { section: '3', doc: 'mult', grade: 'C', level: 5 } });
      }
      if (ga! >= wd(32) && cl.presentation === 'cephalic') {
        add({ id: 'del-twin-vaginal', category: 'delivery', level: 'info', title: 'Двойня ≥ 32 нед, головное предлежание 1-го плода: вагинальные роды не увеличивают риск осложнений', ref: { section: '3', doc: 'mult', grade: 'B', level: 2 } });
      }
      if (cl.efwG !== undefined && cl.efwG < 1500) {
        add({ id: 'del-twin-cs', category: 'delivery', level: 'consider', title: 'Двойня, ПМП < 1500 г: рассмотреть КС', ref: { section: '3', doc: 'mult', grade: 'C', level: 5 } });
      }
      if (ga! < wd(28)) {
        add({ id: 'del-twin-delayed', category: 'delivery', level: 'consider', title: 'При рождении 1-го плода до 28 нед — рассмотреть отсроченное рождение 2-го (только 3-я группа, антибиотики, консилиум, ИДС)', ref: { section: '3', doc: 'mult', grade: 'C', level: 4 } });
      }
    } else {
      if (cl.fgr && ga! < wd(32)) {
        add({ id: 'del-fgr-cs', category: 'delivery', level: 'consider', title: 'ПМП не соответствует сроку: до 31+6 нед предпочтительно КС', ref: { section: '3.4', grade: 'A', level: 1 }, checkId: 'del-mode' });
      } else {
        add({
          id: 'del-cs-not-choice',
          category: 'delivery',
          level: 'info',
          title: 'КС не является методом выбора при ПР; при соответствии ПМП сроку роды в 32–33+6 нед через естественные пути имеют лучшие неонатальные исходы',
          ref: { section: '3.4', grade: 'A', level: 1 },
        });
      }
    }
    if (cl.fgr) {
      const dopplerText: Record<string, string> = {
        normal: 'без нарушений допплерометрии — 36–38 нед (при ПМП < 3-го процентиля)',
        mild: 'невыраженные нарушения допплерометрии / маловодие — 34–37 нед',
        aedf: 'нулевой диастолический кровоток в АП — 32–34 нед, КС',
        redf: 'реверсный диастолический кровоток в АП — 30–32 нед, КС',
        dv: 'нарушения кровотока в венозном протоке — 26–30 нед, КС',
      };
      add({
        id: 'del-fgr',
        category: 'delivery',
        level: 'info',
        title: `ЗРП: срок родоразрешения — ${dopplerText[cl.doppler]}`,
        detail: 'КС при патологической КТГ, нулевом/реверсном кровотоке в АП, нарушениях в ВП. Магния сульфат перед родоразрешением до 32 нед. Преиндукция — механическими методами.',
        ref: { section: '3.1', doc: 'fgr', grade: 'C', level: 5 },
      });
    }
    add({ id: 'del-en-caul', category: 'delivery', level: 'consider', title: 'При технической возможности — извлечение плода в плодных оболочках', ref: { section: '3.4' }, checkId: 'del-en-caul' });
    if (ga! < wd(34)) {
      add({ id: 'del-no-vacuum', category: 'delivery', level: 'avoid', title: 'Вакуум-экстракция до 34 нед (при невозможности КС предпочтительнее щипцы)', ref: { section: '3.4', grade: 'C', level: 5 } });
      add({ id: 'del-no-scalp', category: 'delivery', level: 'avoid', title: 'Скальп-электрод для прямой ЭКГ плода до 34 нед', ref: { section: '3.4', grade: 'C', level: 4 } });
    }
    add({ id: 'del-no-episiotomy', category: 'delivery', level: 'avoid', title: 'Рутинная эпизиотомия', ref: { section: '3.4', grade: 'C', level: 3 } });
    if (x.oligohydramnios) {
      add({ id: 'del-ctg-oligo', category: 'delivery', level: 'do', title: 'Маловодие: непрерывный интранатальный мониторинг ЧСС плода (риск компрессии пуповины)', ref: { section: '3', doc: 'aj', grade: 'C', level: 5 }, checkId: 'del-ctg' });
    } else {
      add({ id: 'del-ctg', category: 'delivery', level: 'info', title: 'Без дополнительных факторов риска непрерывный мониторинг плода в родах не обязателен', ref: { section: '3.4', grade: 'C', level: 5 } });
    }
    add({ id: 'del-cs-anesth', category: 'delivery', level: 'info', title: 'При КС — нейроаксиальная или общая анестезия (общая — при противопоказаниях к нейроаксиальной)', ref: { section: '3.4', grade: 'A', level: 1 } });
  }

  if (x.oligohydramnios && !prev) {
    const indo = entriesOf(c.meds, ['indomethacin-load', 'indomethacin']).at(-1);
    if (indo && hoursSince(indo.at, now) < 48) {
      add({ id: 'oligo-indo', category: 'tocolysis', level: 'contra', title: 'Маловодие на фоне #индометацина — немедленно прекратить препарат, контроль ИАЖ', ref: { section: '3.1' } });
    }
    add({ id: 'oligo-no-hydration', category: 'dx', level: 'avoid', title: 'Гидратация беременной для лечения маловодия', ref: { section: '3', doc: 'aj' } });
    if (!x.ruptured) {
      add({ id: 'oligo-monitor', category: 'dx', level: 'do', title: 'Маловодие при целых оболочках: МВК и КТГ еженедельно, фетометрия каждые 2 нед; исключить ПРПО (зеркала, тесты)', ref: { section: '5', doc: 'aj' } });
    }
  }

  // --- Новорождённый ---
  if (!prev && preterm && (x.laborExpected || c.delivery.at)) {
    add({
      id: 'nb-cord',
      category: 'newborn',
      level: 'do',
      title: 'Отсроченное пережатие пуповины в присутствии неонатолога: ≥ 60 с, не более 3 мин',
      detail: 'При пульсации пуповины > 100/мин и стабильном состоянии матери и новорождённого; ребёнок на уровне или ниже плаценты. «Доение» пуповины — только в исключительных случаях.',
      ref: { section: '3.4', grade: 'B', level: 2 },
      checkId: 'nb-cord',
    });
    if (ga! < wd(28)) {
      add({
        id: 'nb-bag',
        category: 'newborn',
        level: 'do',
        title: '< 28 нед: прозрачный полиэтиленовый пакет и лучистое тепло; температура в родзале 26–28 °C',
        ref: { section: '3.4', grade: 'B', level: 2 },
        checkId: 'nb-bag',
      });
    }
    if (steroidCourses(c.meds).length) {
      add({ id: 'nb-glucose', category: 'newborn', level: 'do', title: 'После антенатальных ГКС — мониторинг глюкозы у новорождённого', ref: { section: '5.1', grade: 'A', level: 2 }, checkId: 'nb-glucose' });
    }
    add({ id: 'pp-psych', category: 'newborn', level: 'consider', title: 'Консультация медицинского психолога матери (с её согласия)', ref: { section: '4', grade: 'B', level: 3 }, checkId: 'pp-psych' });
  }

  return out;
}

export function formatHours(h: number): string {
  const total = Math.max(0, Math.floor(h * 60));
  const d = Math.floor(total / 1440);
  const hh = Math.floor((total % 1440) / 60);
  const mm = total % 60;
  return d ? `${d} сут ${hh} ч` : `${hh} ч ${String(mm).padStart(2, '0')} мин`;
}
