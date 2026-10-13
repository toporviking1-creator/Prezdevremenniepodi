import type { Case } from './types';
import { entriesOf, hoursSince, steroidCourses } from './drugs';
import { buildCtx, formatHours } from './rules';
import { wd } from './ga';

export interface Alert {
  id: string;
  level: 'danger' | 'warn' | 'info';
  text: string;
  /** Срок (ISO) — для обратного отсчёта. */
  due?: string;
}

const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

/** Таймеры и напоминания по введённым препаратам и наблюдению. */
export function computeAlerts(c: Case, now: Date): Alert[] {
  const out: Alert[] = [];
  const x = buildCtx(c, now);
  const t = now.getTime();
  const delivered = !!c.delivery.at;

  // Профилактика РДС — следующая доза
  for (const k of steroidCourses(c.meds)) {
    if (k.complete || delivered) continue;
    const last = k.doses.at(-1)!;
    const due = new Date(last.at).getTime() + k.intervalH * H;
    out.push({
      id: `rds-next-${k.start}`,
      level: t > due ? 'danger' : t > due - H ? 'warn' : 'info',
      text: `${k.drug === 'betamethasone' ? '#Бетаметазон' : '#Дексаметазон'}: доза ${k.doses.length + 1} из ${k.needed}`,
      due: iso(due),
    });
  }

  // Магния сульфат
  const bolus = entriesOf(c.meds, 'mg-bolus').at(-1);
  const stop = entriesOf(c.meds, 'mg-stop').at(-1);
  if (bolus && (!stop || stop.at < bolus.at)) {
    const start = new Date(bolus.at).getTime();
    const end = start + 24 * H;
    if (!delivered) {
      out.push({ id: 'mg-24', level: t > end ? 'danger' : t > end - 2 * H ? 'warn' : 'info', text: 'Магния сульфат: прекратить через 24 ч, если роды не наступили', due: iso(end) });
    }
    const checks = c.vitals.filter((v) => v.at >= bolus.at && v.reflexes).map((v) => new Date(v.at).getTime());
    const lastCheck = Math.max(start, ...checks);
    const due = lastCheck + 4 * H;
    out.push({ id: 'mg-tox', level: t > due ? 'danger' : 'info', text: 'Контроль токсичности магния: пульс, АД, ЧДД, коленные рефлексы', due: iso(due) });
    const bad = c.vitals.filter((v) => v.at >= bolus.at).sort((a, b) => a.at.localeCompare(b.at)).at(-1);
    if (bad && (bad.reflexes === 'absent' || (bad.rr !== undefined && bad.rr < 12) || (bad.diuresisMlH !== undefined && bad.diuresisMlH < 30))) {
      out.push({ id: 'mg-toxic', level: 'danger', text: 'Признаки токсичности магния (отсутствие рефлексов / ЧДД < 12 / диурез < 30 мл/ч) — оцените, прекратите инфузию по показаниям' });
    }
  }

  // Токолиз
  const nifeAll = entriesOf(c.meds, ['nifedipine-load', 'nifedipine']);
  const nifeStart = nifeAll[0];
  const nifeLast = nifeAll.at(-1);
  if (nifeLast && !delivered && hoursSince(nifeStart.at, now) < 7 * 24) {
    const due = new Date(nifeLast.at).getTime() + 6 * H;
    out.push({ id: 'nife-next', level: t > due ? 'warn' : 'info', text: '#Нифедипин 10 мг — если сокращения сохраняются', due: iso(due) });
    // мониторинг АД: каждые 30 мин в 1-й час, каждый час до 24 ч, затем каждые 4 ч
    const sinceStart = hoursSince(nifeStart.at, now);
    const interval = sinceStart < 1 ? 0.5 : sinceStart < 24 ? 1 : 4;
    const lastBp = c.vitals.filter((v) => v.at >= nifeStart.at && v.sbp !== undefined).map((v) => new Date(v.at).getTime());
    const bpDue = Math.max(new Date(nifeStart.at).getTime(), ...lastBp) + interval * H;
    out.push({ id: 'toco-bp', level: t > bpDue ? 'warn' : 'info', text: `Пульс и АД на фоне токолиза (каждые ${interval === 0.5 ? '30 мин' : interval === 1 ? '1 ч' : '4 ч'})`, due: iso(bpDue) });
  }
  if (nifeStart && hoursSince(nifeStart.at, now) >= 7 * 24 && hoursSince(nifeStart.at, now) < 8 * 24) {
    out.push({ id: 'nife-7d', level: 'warn', text: '#Нифедипин: курс более 7 дней — рутинный поддерживающий токолиз не рекомендован' });
  }
  const ato = entriesOf(c.meds, 'atosiban')[0];
  if (ato && !delivered && hoursSince(ato.at, now) < 48 + 6) {
    const end = new Date(ato.at).getTime() + 48 * H;
    out.push({ id: 'ato-48', level: t > end ? 'danger' : 'info', text: 'Атозибан: курс не более 48 ч (не более 330 мг)', due: iso(end) });
  }
  const indo = entriesOf(c.meds, ['indomethacin-load', 'indomethacin']);
  if (indo.length && !delivered && hoursSince(indo[0].at, now) < 48 + 6) {
    const end = new Date(indo[0].at).getTime() + 48 * H;
    out.push({ id: 'indo-48', level: t > end ? 'danger' : 'info', text: '#Индометацин: не более 48 ч', due: iso(end) });
    if (x.ga !== undefined && x.ga > wd(28, 6)) out.push({ id: 'indo-ga', level: 'warn', text: '#Индометацин рекомендован до 28+6 нед; после 31 нед — риск закрытия артериального протока, маловодия' });
  }
  const tocoDrugs = new Set(entriesOf(c.meds, ['nifedipine-load', 'nifedipine', 'atosiban', 'indomethacin-load', 'indomethacin']).filter((m) => hoursSince(m.at, now) < 48).map((m) => m.drug.replace('-load', '')));
  if (tocoDrugs.size >= 3) out.push({ id: 'toco-multi', level: 'danger', text: 'Многокомпонентный токолиз (≥ 3 препаратов) не рекомендован' });

  // Антибиотики при ПРПО
  const amp = entriesOf(c.meds, 'ampicillin');
  if (amp.length && !delivered && hoursSince(amp[0].at, now) < 48) {
    const due = new Date(amp.at(-1)!.at).getTime() + 6 * H;
    out.push({ id: 'amp-next', level: t > due ? 'warn' : 'info', text: '#Ампициллин 2 г в/в (каждые 6 ч, 48 ч)', due: iso(due) });
  } else if (amp.length && !delivered && hoursSince(amp[0].at, now) < 56 && !entriesOf(c.meds, 'amoxicillin').length) {
    out.push({ id: 'amp-switch', level: 'info', text: '48 ч #ампициллина завершены — далее #амоксициллин 250 мг каждые 8 ч 5 дней' });
  }
  const amox = entriesOf(c.meds, 'amoxicillin');
  if (amox.length && !delivered && hoursSince(amox[0].at, now) < 5 * 24) {
    out.push({ id: 'amox-next', level: 'info', text: '#Амоксициллин 250 мг (каждые 8 ч, 5 дней)', due: iso(new Date(amox.at(-1)!.at).getTime() + 8 * H) });
  }
  const ery = entriesOf(c.meds, 'erythromycin');
  if (ery.length && !delivered && hoursSince(ery[0].at, now) < 10 * 24) {
    out.push({ id: 'ery-next', level: 'info', text: '#Эритромицин 250 мг (каждые 6 ч, до 10 дней)', due: iso(new Date(ery.at(-1)!.at).getTime() + 6 * H) });
  }
  if (x.ruptured && !delivered) {
    const abx = entriesOf(c.meds, ['ampicillin', 'amoxicillin', 'erythromycin', 'azithromycin']);
    if (!abx.length) out.push({ id: 'abx-missing', level: 'warn', text: 'ПРПО: антибактериальная терапия не отмечена' });
    if (x.latencyH !== undefined) {
      const tenDays = new Date(c.clinical.rupturedAt!).getTime() + 10 * 24 * H;
      if (t < tenDays + 24 * H) out.push({ id: 'abx-10d', level: 'info', text: `ПРПО ${formatHours(x.latencyH)}: антибактериальная терапия — 10 дней от диагноза (или до родов)`, due: iso(tenDays) });
    }
    if (!c.labs.some((l) => l.wbc !== undefined || l.crp !== undefined)) out.push({ id: 'lab-missing', level: 'warn', text: 'ПРПО: нет данных лейкоцитов и СРБ' });
    const lastTemp = [...c.vitals].filter((v) => v.temp !== undefined).sort((a, b) => a.at.localeCompare(b.at)).at(-1);
    if (lastTemp && lastTemp.temp! >= 38) out.push({ id: 'fever', level: 'danger', text: `Температура ${lastTemp.temp} °C — оцените признаки хориоамнионита (клиника + лейкоциты, СРБ, состояние плода)` });
    const lastLab = [...c.labs].sort((a, b) => a.at.localeCompare(b.at)).at(-1);
    const recentSteroid = c.meds.some((m) => (m.drug === 'betamethasone' || m.drug === 'dexamethasone') && hoursSince(m.at, now) < 72 && hoursSince(m.at, now) > 0);
    if (lastLab?.wbc !== undefined && lastLab.wbc > 15 && recentSteroid) {
      out.push({ id: 'wbc-steroid', level: 'info', text: 'Лейкоцитоз в течение 3 сут после ГКС может быть медикаментозным — ориентируйтесь на СРБ и клинику' });
    }
  }

  // СГВ
  if ((x.activeLabor || c.clinical.scenario === 'active') && x.gbsNeedsIap && !entriesOf(c.meds, 'gbs-iap').length && !delivered) {
    out.push({ id: 'gbs-iap', level: 'danger', text: `Роды при ${c.clinical.gbs === 'positive' ? 'носительстве СГВ' : 'неизвестном статусе СГВ'}: начните интранатальную антибиотикопрофилактику` });
  }

  // Контроль витальных при отсутствии записей
  if (c.clinical.scenario !== 'prevention' && !c.vitals.length && !delivered) {
    out.push({ id: 'vitals-missing', level: 'info', text: 'Нет записей АД/пульса/ЧДД' });
  }

  return out;
}
