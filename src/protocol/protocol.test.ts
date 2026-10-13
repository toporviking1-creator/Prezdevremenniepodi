import { describe, expect, it } from 'vitest';
import { newCase } from './case';
import type { Case } from './types';
import { recommendations, suggestedScenario, tocolysisContraindications, buildCtx } from './rules';
import { fmtGa, fmtGaLong, gaCategory, gestationalAge, wd } from './ga';
import { addMed, addLab, updateClinical } from '../state/actions';
import { steroidCourses } from './drugs';
import { computeAlerts } from './alerts';
import { autoQuality } from './quality';
import { buildDiagnosis } from '../conclusions/diagnosis';
import { TEMPLATES, docToText } from '../conclusions/templates';

const NOW = new Date('2026-03-10T12:00:00');

function mk(weeks: number, days: number, patch: Partial<Case['clinical']> = {}): Case {
  const c = newCase(NOW);
  c.patient.manualWeeks = weeks;
  c.patient.manualDays = days;
  c.patient.manualAt = NOW.toISOString();
  c.clinical = { ...c.clinical, ...patch, flags: { ...c.clinical.flags, ...(patch.flags ?? {}) } };
  return c;
}

const ids = (c: Case, now = NOW) => recommendations(c, now).map((r) => `${r.id}:${r.level}`);
const rec = (c: Case, id: string, now = NOW) => recommendations(c, now).find((r) => r.id === id);

describe('срок беременности', () => {
  it('по УЗИ первого триместра приоритетнее ПМ', () => {
    const c = newCase(NOW);
    c.patient.lmp = '2025-08-01';
    c.patient.usDate = '2025-10-24';
    c.patient.usWeeks = 12;
    c.patient.usDays = 0;
    const ga = gestationalAge(c.patient, NOW)!;
    expect(ga.source).toBe('us');
    expect(fmtGa(ga.days)).toBe('31+4 нед');
    expect(ga.discrepancyDays).toBe(0);
  });
  it('ручной срок нарастает со временем', () => {
    const c = mk(30, 2);
    expect(gestationalAge(c.patient, new Date('2026-03-13T09:00:00'))!.days).toBe(wd(30, 5));
  });
  it('классификация по ВОЗ', () => {
    expect(gaCategory(wd(27, 6))).toBe('extreme');
    expect(gaCategory(wd(28))).toBe('very');
    expect(gaCategory(wd(33, 6))).toBe('moderate');
    expect(gaCategory(wd(36, 6))).toBe('late');
    expect(fmtGaLong(wd(30, 2))).toBe('30 недель 2 дня');
    expect(fmtGaLong(wd(21, 1))).toBe('21 неделя 1 день');
  });
});

describe('токолиз', () => {
  it('начавшиеся ПР в 30 нед — показан, 1-я линия нифедипин, ВК', () => {
    const c = mk(30, 0, { scenario: 'imminent', cervixMm: 18 });
    const r = ids(c);
    expect(r).toContain('toco:do');
    expect(r).toContain('toco-vk:do');
    expect(r.some((x) => x.startsWith('toco-indo'))).toBe(false);
    expect(rec(c, 'toco')!.drugs).toContain('nifedipine-load');
    expect(r).toContain('toco-no-beta:avoid');
  });
  it('индометацин — только до 28+6', () => {
    expect(ids(mk(27, 0, { scenario: 'imminent', cervixMm: 15 }))).toContain('toco-indo:consider');
    expect(ids(mk(29, 0, { scenario: 'imminent', cervixMm: 15 })).some((x) => x.startsWith('toco-indo'))).toBe(false);
  });
  it('угрожающие ПР без объективных признаков — токолиз и ГКС не рекомендованы', () => {
    const c = mk(30, 0, { scenario: 'threat', cervixMm: 32, pretermTest: 'negative' });
    const r = ids(c);
    expect(r).toContain('toco-no-objective:avoid');
    expect(r).toContain('rds-no:avoid');
    expect(r).toContain('abx-no:avoid');
  });
  it('ПРПО после 32 нед — противопоказание', () => {
    const c = mk(32, 3, { scenario: 'pprom', membranes: 'ruptured', contractionsPer20: 3 });
    const x = buildCtx(c, NOW);
    expect(tocolysisContraindications(c, x)).toContain('ПРПО при сроке более 32 нед');
    expect(ids(c)).toContain('toco-contra:contra');
  });
  it('после 34 нед — не проводится', () => {
    expect(ids(mk(34, 1, { scenario: 'imminent', cervixMm: 10 }))).toContain('toco-34:avoid');
  });
  it('противопоказания к нифедипину → атозибан', () => {
    const c = mk(33, 0, { scenario: 'imminent', cervixMm: 15, flags: { nifedipineContra: true } as never });
    expect(rec(c, 'toco')!.drugs).toEqual(['atosiban']);
  });
  it('хориоамнионит — противопоказание', () => {
    const c = mk(28, 0, { scenario: 'imminent', cervixMm: 15, flags: { chorioamnionitis: true } as never });
    expect(rec(c, 'toco-contra')!.title).toContain('хориоамнионит');
  });
});

describe('профилактика РДС', () => {
  it('24–33+6 — показана; 22–23+6 — не рекомендована; 34–35+6 — по показаниям', () => {
    expect(ids(mk(26, 0, { scenario: 'pprom', membranes: 'ruptured' }))).toContain('rds:do');
    expect(ids(mk(23, 2, { scenario: 'imminent', cervixMm: 10 }))).toContain('rds-22:avoid');
    expect(ids(mk(34, 2, { scenario: 'imminent', cervixMm: 10, flags: { diabetes: true } as never }))).toContain('rds-34:consider');
    expect(ids(mk(34, 2, { scenario: 'imminent', cervixMm: 10 }))).toContain('rds-34:info');
  });
  it('курс бетаметазона: следующая доза через 24 ч, курс завершён после 2-й', () => {
    let c = mk(29, 0, { scenario: 'imminent', cervixMm: 15 });
    c = addMed(c, 'betamethasone', '12 мг в/м', '2026-03-10T08:00:00.000Z', NOW.toISOString());
    expect(ids(c)).toContain('rds-running:info');
    const a = computeAlerts(c, NOW).find((x) => x.id.startsWith('rds-next'))!;
    expect(a.due).toBe('2026-03-11T08:00:00.000Z');
    c = addMed(c, 'betamethasone', '12 мг в/м', '2026-03-11T08:00:00.000Z', NOW.toISOString());
    expect(steroidCourses(c.meds)[0].complete).toBe(true);
    expect(c.checks['rds-complete']?.done).toBe(true);
  });
  it('дексаметазон 6 мг — 4 дозы через 12 ч', () => {
    let c = mk(29, 0, { scenario: 'imminent', cervixMm: 15 });
    c = addMed(c, 'dexamethasone', '6 мг в/м', '2026-03-10T08:00:00.000Z', NOW.toISOString());
    const k = steroidCourses(c.meds)[0];
    expect(k.needed).toBe(4);
    expect(k.intervalH).toBe(12);
  });
  it('повторный курс: ≥ 14 сут — рассмотреть, 7–13 — rescue, ≥ 2 курсов — нет', () => {
    let c = mk(27, 0, { scenario: 'imminent', cervixMm: 12 });
    c = addMed(c, 'betamethasone', '12 мг в/м', '2026-02-20T08:00:00.000Z', NOW.toISOString());
    c = addMed(c, 'betamethasone', '12 мг в/м', '2026-02-21T08:00:00.000Z', NOW.toISOString());
    expect(ids(c)).toContain('rds-repeat:consider');
    expect(ids(c, new Date('2026-03-01T12:00:00'))).toContain('rds-rescue:consider');
    c = addMed(c, 'betamethasone', '12 мг в/м', '2026-03-09T08:00:00.000Z', NOW.toISOString());
    c = addMed(c, 'betamethasone', '12 мг в/м', '2026-03-10T08:00:00.000Z', NOW.toISOString());
    expect(ids(c)).toContain('rds-max:avoid');
  });
});

describe('магния сульфат', () => {
  it('ПРПО 30 нед — показан; миастения — противопоказан', () => {
    expect(ids(mk(30, 0, { scenario: 'pprom', membranes: 'ruptured' }))).toContain('mg:do');
    expect(ids(mk(30, 0, { scenario: 'pprom', membranes: 'ruptured', flags: { myasthenia: true } as never }))).toContain('mg-contra:contra');
  });
  it('34 нед — не показан', () => {
    expect(ids(mk(34, 0, { scenario: 'active', dilationCm: 5, contractionsPer20: 5 })).some((x) => x.startsWith('mg:'))).toBe(false);
  });
  it('таймеры: 24 ч и контроль токсичности каждые 4 ч', () => {
    let c = mk(30, 0, { scenario: 'imminent', cervixMm: 15 });
    c = addMed(c, 'mg-bolus', '4 г в/в', '2026-03-10T06:00:00.000Z', NOW.toISOString());
    const a = computeAlerts(c, NOW);
    expect(a.find((x) => x.id === 'mg-24')!.due).toBe('2026-03-11T06:00:00.000Z');
    expect(a.find((x) => x.id === 'mg-tox')!.due).toBe('2026-03-10T10:00:00.000Z');
  });
});

describe('ПРПО', () => {
  it('выжидательная тактика, антибиотики, без амоксиклава, без влагалищного исследования', () => {
    const c = mk(30, 0, { scenario: 'pprom', membranes: 'ruptured', rupturedAt: '2026-03-10T00:00:00' });
    const r = ids(c);
    expect(r).toContain('pprom-expectant:do');
    expect(r).toContain('abx-pprom:do');
    expect(r).toContain('abx-no-amoxiclav:avoid');
    expect(r).toContain('dx-no-vaginal:avoid');
    expect(r).toContain('dx-wbc-crp:do');
    expect(r).toContain('route:do');
  });
  it('носительство СГВ ≥ 34 нед — родоразрешение', () => {
    expect(ids(mk(34, 2, { scenario: 'pprom', membranes: 'ruptured', gbs: 'positive' }))).toContain('pprom-gbs34:do');
  });
  it('аллергия на пенициллины — эритромицин', () => {
    const c = mk(30, 0, { scenario: 'pprom', membranes: 'ruptured', flags: { penicillinAllergy: true } as never });
    expect(rec(c, 'abx-pprom')!.drugs).not.toContain('ampicillin');
  });
  it('критерий качества 1: лейкоциты и СРБ', () => {
    let c = mk(30, 0, { scenario: 'pprom', membranes: 'ruptured' });
    expect(autoQuality(c, 'q1', NOW)).toBe('no');
    c = addLab(c, { at: NOW.toISOString(), wbc: 12, crp: 8 }, NOW.toISOString());
    expect(autoQuality(c, 'q1', NOW)).toBe('yes');
    expect(c.checks['dx-wbc-crp']?.done).toBe(true);
  });
  it('выбор сценария ПРПО отмечает разрыв оболочек', () => {
    const c = updateClinical(mk(30, 0), { scenario: 'pprom' }, NOW.toISOString());
    expect(c.clinical.membranes).toBe('ruptured');
    expect(c.clinical.rupturedAt).toBe(NOW.toISOString());
  });
});

describe('СГВ', () => {
  it('статус неизвестен — профилактика в родах; свежий отрицательный посев — не нужна', () => {
    expect(ids(mk(32, 0, { scenario: 'active', dilationCm: 5, contractionsPer20: 5 }))).toContain('gbs-iap:do');
    expect(ids(mk(32, 0, { scenario: 'active', dilationCm: 5, contractionsPer20: 5, gbs: 'negative', gbsDate: '2026-02-20' }))).toContain('gbs-none:info');
    expect(ids(mk(32, 0, { scenario: 'active', dilationCm: 5, contractionsPer20: 5, gbs: 'negative', gbsDate: '2025-12-01' }))).toContain('gbs-iap:do');
  });
});

describe('родоразрешение', () => {
  it('тазовое предлежание: < 26 нед — КС не рекомендовано; 26–32+6 — КС; консилиум', () => {
    expect(ids(mk(25, 0, { scenario: 'active', presentation: 'breech', dilationCm: 5, contractionsPer20: 5 }))).toContain('del-breech-early:avoid');
    const r = ids(mk(30, 0, { scenario: 'active', presentation: 'breech', dilationCm: 5, contractionsPer20: 5 }));
    expect(r).toContain('del-breech-cs:do');
    expect(r).toContain('del-breech-consilium:do');
    expect(r).toContain('del-no-vacuum:avoid');
  });
  it('< 28 нед — пакет и лучистое тепло; отсроченное пережатие пуповины', () => {
    const r = ids(mk(26, 0, { scenario: 'active', dilationCm: 5, contractionsPer20: 5 }));
    expect(r).toContain('nb-bag:do');
    expect(r).toContain('nb-cord:do');
  });
  it('ЗРП до 32 нед — предпочтительно КС', () => {
    expect(ids(mk(30, 0, { scenario: 'induced', fgr: true, doppler: 'redf' }))).toContain('del-fgr-cs:consider');
  });
});

describe('профилактика ПР', () => {
  it('короткая шейка в 20 нед + ПР в анамнезе: прогестерон, серкляж, пессарий', () => {
    const c = mk(20, 0, { scenario: 'prevention', cervixMm: 20 });
    c.patient.riskFactors = ['prev-ptb'];
    const r = ids(c);
    expect(r).toContain('prev-progesterone:do');
    expect(r).toContain('prev-highrisk:info');
    expect(r).toContain('prev-cerclage:consider');
    expect(r).toContain('prev-pessary:consider');
    expect(r).toContain('prev-no-bedrest:avoid');
  });
  it('многоплодие: без профилактического серкляжа и рутинного пессария', () => {
    const r = ids(mk(20, 0, { scenario: 'prevention', fetuses: 2, cervixMm: 20 }));
    expect(r).toContain('prev-twin-nocerclage:avoid');
    expect(r).toContain('prev-twin-pessary:avoid');
    expect(r).toContain('prev-progesterone:do');
  });
  it('серкляж противопоказан при сокращениях матки', () => {
    expect(ids(mk(20, 0, { scenario: 'prevention', cervixMm: 20, contractionsPer20: 2 }))).toContain('prev-cerclage-contra:contra');
  });
});

describe('подсказка сценария', () => {
  it('угрожающие с шейкой 15 мм → начавшиеся', () => {
    expect(suggestedScenario(mk(30, 0, { scenario: 'threat', cervixMm: 15 }), NOW)).toBe('imminent');
  });
});

describe('конструктор заключений', () => {
  it('диагноз и МКБ-10 при ПРПО с тазовым предлежанием', () => {
    let c = mk(30, 2, { scenario: 'pprom', membranes: 'ruptured', rupturedAt: '2026-03-09T06:00:00', presentation: 'breech', gbs: 'positive' });
    c = addMed(c, 'nifedipine-load', '20 мг внутрь', '2026-03-09T07:00:00', NOW.toISOString());
    const d = buildDiagnosis(c, NOW);
    expect(d.main).toContain('Беременность 30 недель 2 дня');
    expect(d.main).toContain('Преждевременный разрыв плодных оболочек');
    expect(d.codes.map((k) => k.code)).toEqual(expect.arrayContaining(['O42.2', 'O32.1']));
    expect(d.extra).toContain('Носительство стрептококка группы B');
    expect(d.codes.map((k) => k.code)).not.toContain('O34.3');
  });
  it('все шаблоны собираются в текст без undefined', () => {
    const c = mk(29, 0, { scenario: 'imminent', cervixMm: 15, fetuses: 2, chorionicity: 'dichorionic' });
    c.extra.doctor = 'Иванова И.И.';
    for (const t of TEMPLATES) {
      const text = docToText(t.build(c, NOW));
      expect(text, t.id).not.toMatch(/undefined|NaN|\[object/);
      expect(text.length).toBeGreaterThan(100);
    }
  });
  it('ВК off-label содержит схему и ссылку на КР', () => {
    const c = mk(29, 0, { scenario: 'imminent', cervixMm: 15 });
    c.extra.offLabelDrug = 'nifedipine-load';
    const text = docToText(TEMPLATES.find((t) => t.id === 'offlabel')!.build(c, NOW));
    expect(text).toContain('20 мг внутрь');
    expect(text).toContain('УУР A, УДД 1');
    expect(text).toContain('Противопоказания к токолизу: не выявлены');
  });
  it('план исключает отключённые пункты', () => {
    const c = mk(29, 0, { scenario: 'imminent', cervixMm: 15 });
    const before = docToText(TEMPLATES[0].build(c, NOW));
    expect(before).toContain('Магния сульфат');
    c.extra.excludedPlan = ['mg'];
    expect(docToText(TEMPLATES[0].build(c, NOW))).not.toContain('Магния сульфат для нейропротекции');
  });
});
