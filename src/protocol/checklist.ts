import type { Case } from './types';
import { buildCtx, type Ctx } from './rules';
import { wd } from './ga';
import type { KrRef } from './data';

export interface CheckItem {
  id: string;
  section: string;
  text: string;
  ref?: KrRef;
  applies: (x: Ctx, c: Case) => boolean;
}

const notPrev = (x: Ctx) => x.scenario !== 'prevention';
const ga = (x: Ctx, from: number, to: number) => x.ga !== undefined && x.ga >= from && x.ga < to;
const symptomatic = (x: Ctx) => ['threat', 'imminent', 'active', 'pprom'].includes(x.scenario);

export const CHECK_SECTIONS = ['Диагностика', 'Маршрутизация и информирование', 'Лечение', 'Профилактика ПР', 'Родоразрешение', 'Новорождённый и после родов'] as const;

export const CHECK_ITEMS: CheckItem[] = [
  { id: 'dx-history', section: 'Диагностика', text: 'Собран анамнез, выявлены факторы риска ПР', ref: { section: '2.1', grade: 'C', level: 5 }, applies: () => true },
  { id: 'dx-vitals', section: 'Диагностика', text: 'АД, пульс, ЧДД', ref: { section: '2.2', grade: 'C', level: 4 }, applies: notPrev },
  { id: 'dx-fetal', section: 'Диагностика', text: 'Аускультация плода, оценка сокращений матки', ref: { section: '2.2', grade: 'C', level: 4 }, applies: notPrev },
  { id: 'dx-speculum', section: 'Диагностика', text: 'Осмотр шейки матки в стерильных зеркалах', ref: { section: '2.2', grade: 'C', level: 5 }, applies: symptomatic },
  { id: 'dx-placenta', section: 'Диагностика', text: 'Предлежание плаценты исключено (УЗИ)', ref: { section: '2.2' }, applies: symptomatic },
  { id: 'dx-vaginal', section: 'Диагностика', text: 'Влагалищное исследование (после исключения предлежания плаценты и ПРПО)', ref: { section: '2.2', grade: 'C', level: 5 }, applies: (x) => symptomatic(x) && (!x.ruptured || x.activeLabor) },
  { id: 'dx-romtest', section: 'Диагностика', text: 'Тест на подтекание вод (ПСИФР-1 / ПАМГ-1) — при неясной картине в зеркалах', ref: { section: '2.3', grade: 'C', level: 5 }, applies: (x) => x.scenario === 'pprom' },
  { id: 'dx-cervicometry', section: 'Диагностика', text: 'УЗ-цервикометрия', ref: { section: '2.4', grade: 'A', level: 1 }, applies: (x) => !x.ruptured },
  { id: 'dx-tests', section: 'Диагностика', text: 'Тесты на ПР: ИЛ-6, ПСИФР-1, ПАМГ-1', ref: { section: '2.3', grade: 'A', level: 2 }, applies: (x) => ['threat', 'imminent'].includes(x.scenario) && ga(x, wd(24), wd(34)) },
  { id: 'dx-gbs', section: 'Диагностика', text: 'Обследование на СГВ (ПЦР / посев)', ref: { section: '2.3', grade: 'B', level: 2 }, applies: symptomatic },
  { id: 'dx-wbc-crp', section: 'Диагностика', text: 'Лейкоциты крови и СРБ', ref: { section: '2.3', grade: 'B', level: 2 }, applies: (x) => x.ruptured },
  { id: 'dx-us', section: 'Диагностика', text: 'УЗИ плода: предлежание, ПМП, ИАЖ/МВК, допплерометрия', applies: notPrev },
  { id: 'dx-amnio', section: 'Диагностика', text: 'Амниоцентез перед решением о серкляже (22–23+6 нед, консилиум)', ref: { section: '2.5', grade: 'C', level: 4 }, applies: (x, c) => ga(x, wd(22), wd(24)) && (c.clinical.cervixMm ?? 99) <= 25 && !x.ruptured },

  { id: 'route', section: 'Маршрутизация и информирование', text: 'Госпитализация / перевод в стационар 3а группы (34–36 нед — 3а или 2-й с ОРИТН)', ref: { section: '6' }, applies: (x) => notPrev(x) && x.scenario !== 'threat' && ga(x, wd(22), wd(37)) },
  { id: 'counsel', section: 'Маршрутизация и информирование', text: 'Семья информирована о прогнозе и методах родоразрешения (акушер + неонатолог)', ref: { section: '3.4' }, applies: (x) => notPrev(x) && ga(x, wd(22), wd(28)) },
  { id: 'neonatologist', section: 'Маршрутизация и информирование', text: 'Неонатолог оповещён', applies: (x) => x.laborExpected },
  { id: 'pprom-inpatient', section: 'Маршрутизация и информирование', text: 'ПРПО: наблюдение в круглосуточном стационаре', ref: { section: '3.3', grade: 'A', level: 1 }, applies: (x) => x.ruptured },
  { id: 'pprom-expectant', section: 'Маршрутизация и информирование', text: 'ПРПО: выжидательная тактика, план контроля (температура, лейкоциты/СРБ, КТГ, признаки ПОНРП)', ref: { section: '3.3', grade: 'A', level: 1 }, applies: (x) => x.ruptured && ga(x, wd(24), wd(37)) },

  { id: 'vk-nifedipine', section: 'Лечение', text: 'Заключение ВК и ИДС на off-label препараты (#нифедипин, #азитромицин и др.)', ref: { section: '3.1' }, applies: (x) => symptomatic(x) || x.scenario === 'induced' },
  { id: 'toco', section: 'Лечение', text: 'Острый токолиз (48 ч)', ref: { section: '3.1', grade: 'A', level: 1 }, applies: (x) => symptomatic(x) && ga(x, wd(24), wd(34)) && !x.objectiveNegative },
  { id: 'rds', section: 'Лечение', text: 'Антенатальная профилактика РДС плода начата', ref: { section: '5.1', grade: 'A', level: 1 }, applies: (x) => notPrev(x) && ga(x, wd(24), wd(34)) && !(x.scenario === 'threat' && x.objectiveNegative) },
  { id: 'rds-complete', section: 'Лечение', text: 'Курс профилактики РДС завершён', ref: { section: '5.1' }, applies: (x) => notPrev(x) && ga(x, wd(24), wd(34)) && !(x.scenario === 'threat' && x.objectiveNegative) },
  { id: 'mg', section: 'Лечение', text: 'Магния сульфат для нейропротекции', ref: { section: '3.1', grade: 'A', level: 1 }, applies: (x) => x.laborExpected && ga(x, wd(24), wd(34)) },
  { id: 'mg-tox', section: 'Лечение', text: 'Контроль токсичности магния каждые 4 ч (пульс, АД, ЧДД, рефлексы)', ref: { section: '3.1' }, applies: (x) => x.laborExpected && ga(x, wd(24), wd(34)) },
  { id: 'abx-pprom', section: 'Лечение', text: 'Антибактериальная терапия при ПРПО (10 дней или до родов)', ref: { section: '3.1', grade: 'A', level: 1 }, applies: (x) => x.ruptured },
  { id: 'gbs-iap', section: 'Лечение', text: 'Интранатальная антибиотикопрофилактика СГВ', ref: { section: '5.2', grade: 'C', level: 5 }, applies: (x) => x.laborExpected && x.gbsNeedsIap },

  { id: 'prev-progesterone', section: 'Профилактика ПР', text: 'Вагинальный прогестерон 200 мг/сут (16–34 нед)', ref: { section: '5.3', grade: 'A', level: 1 }, applies: (x) => x.scenario === 'prevention' || (x.scenario === 'threat' && (x.historyHigh || x.shortCervixMidTrimester)) },
  { id: 'prev-cerclage', section: 'Профилактика ПР', text: 'Решение о серкляже (коллегиально)', ref: { section: '3.2', grade: 'A', level: 1 }, applies: (x, c) => (x.scenario === 'prevention' || x.scenario === 'threat') && (c.clinical.cervixMm ?? 99) <= 25 },
  { id: 'prev-pessary', section: 'Профилактика ПР', text: 'Решение об акушерском пессарии', ref: { section: '5.4', grade: 'B', level: 2 }, applies: (x, c) => (x.scenario === 'prevention' || x.scenario === 'threat') && (c.clinical.cervixMm ?? 99) < 25 },

  { id: 'del-consilium', section: 'Родоразрешение', text: 'Способ и срок родоразрешения определены (консилиум), ИДС', ref: { section: '3.4' }, applies: (x) => x.laborExpected },
  { id: 'del-mode', section: 'Родоразрешение', text: 'Способ родоразрешения соответствует сроку, предлежанию и ПМП', ref: { section: '3.4' }, applies: (x) => x.laborExpected },
  { id: 'del-analgesia', section: 'Родоразрешение', text: 'Нейроаксиальная аналгезия (без опиоидов-адъювантов)', ref: { section: '3.4', grade: 'A', level: 1 }, applies: (x) => x.laborExpected },
  { id: 'del-ctg', section: 'Родоразрешение', text: 'Мониторинг плода в родах по показаниям (непрерывный — при маловодии и др. факторах риска)', applies: (x) => x.laborExpected },
  { id: 'del-en-caul', section: 'Родоразрешение', text: 'Извлечение в плодных оболочках (при возможности)', ref: { section: '3.4' }, applies: (x) => x.laborExpected },

  { id: 'nb-cord', section: 'Новорождённый и после родов', text: 'Отсроченное пережатие пуповины (60 с – 3 мин) при пульсации > 100/мин', ref: { section: '3.4', grade: 'B', level: 2 }, applies: (x) => x.laborExpected },
  { id: 'nb-bag', section: 'Новорождённый и после родов', text: 'Пакет + лучистое тепло, 26–28 °C в родзале (< 28 нед)', ref: { section: '3.4', grade: 'B', level: 2 }, applies: (x) => x.laborExpected && ga(x, 0, wd(28)) },
  { id: 'nb-glucose', section: 'Новорождённый и после родов', text: 'Глюкоза у новорождённого после антенатальных ГКС', ref: { section: '5.1', grade: 'A', level: 2 }, applies: (x) => x.laborExpected && ga(x, wd(22), wd(36)) },
  { id: 'pp-psych', section: 'Новорождённый и после родов', text: 'Консультация медицинского психолога (с согласия)', ref: { section: '4', grade: 'B', level: 3 }, applies: (x) => x.laborExpected },
];

export function visibleChecks(c: Case, now: Date): CheckItem[] {
  const x = buildCtx(c, now);
  return CHECK_ITEMS.filter((i) => i.applies(x, c) || c.checks[i.id]?.done);
}
