import { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType } from 'docx';
import type { Case } from '../protocol/types';
import type { ConclusionDoc } from '../conclusions/templates';
import { GUIDELINE, QUALITY_CRITERIA, SCENARIO_LABEL, refText } from '../protocol/data';
import { CHECK_SECTIONS, visibleChecks } from '../protocol/checklist';
import { drugById } from '../protocol/drugs';
import { recommendations, CATEGORY_LABEL, LEVEL_LABEL } from '../protocol/rules';
import { fmtGa, gestationalAge } from '../protocol/ga';
import { qualityScore, qualityValue, QUALITY_LABEL } from '../protocol/quality';
import { buildDiagnosis, diagnosisText } from '../conclusions/diagnosis';
import { REFLEX_LABEL } from '../state/actions';

const FONT = 'Times New Roman';
const SIZE = 24; // 12 pt
const SMALL = 20;
const ACCENT = '1F5E8C';
const GRAY = 'F2F2F2';

const border = { style: BorderStyle.SINGLE, size: 4, color: '999999' };
const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };

function run(text: string, o: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) {
  return new TextRun({ text, font: FONT, size: o.size ?? SIZE, bold: o.bold, color: o.color, italics: o.italics });
}

function para(text: string, o: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; italics?: boolean; after?: number; color?: string } = {}) {
  // Переносы строк → отдельные строки внутри абзаца.
  const lines = text.split('\n');
  return new Paragraph({
    alignment: o.align,
    spacing: { after: o.after ?? 80 },
    children: lines.flatMap((l, i) => [...(i ? [new TextRun({ break: 1, text: '', font: FONT })] : []), run(l, o)]),
  });
}

function heading(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 80 },
    keepNext: true,
    children: [new TextRun({ text, font: FONT, size: 26, bold: true, color: ACCENT })],
  });
}

function cell(text: string, o: { bold?: boolean; shade?: string; width?: number } = {}) {
  return new TableCell({
    children: text.split('\n').map((l) => new Paragraph({ children: [run(l, { bold: o.bold, size: SMALL })] })),
    verticalAlign: VerticalAlign.CENTER,
    width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined,
    shading: o.shade ? { type: ShadingType.CLEAR, color: 'auto', fill: o.shade } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
  });
}

function table(headers: string[], rows: string[][], widths?: number[]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, { bold: true, shade: GRAY, width: widths?.[i] })) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((v, i) => cell(v || ' ', { width: widths?.[i] })) })),
    ],
  });
}

const fmtDT = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

function footer(text: string) {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [run(`${text} · стр. `, { size: 16, color: '777777' }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: '777777' })],
      }),
    ],
  });
}

const PAGE = { margin: { top: 1000, bottom: 1000, left: 1300, right: 900 } };

/** Документ Word из конструктора заключений. */
export function buildConclusionDocument(d: ConclusionDoc, text?: string): Document {
  const children: (Paragraph | Table)[] = [para(d.title, { bold: true, size: 28, align: AlignmentType.CENTER, after: 200 })];
  if (text !== undefined) {
    // Отредактированный вручную текст: заголовки блоков («Диагноз:») выделяем жирным.
    const chunks = text.split(/\n{2,}/);
    if (chunks[0]?.trim() === d.title.toUpperCase()) chunks.shift();
    for (const chunk of chunks) {
      const [first, ...rest] = chunk.split('\n');
      if (/^[А-ЯЁA-Z][^:]{1,60}:$/.test(first.trim()) && rest.length) {
        children.push(heading(first.trim().replace(/:$/, '')), para(rest.join('\n')));
      } else {
        children.push(para(chunk));
      }
    }
  } else {
    for (const b of d.blocks) {
      if (b.heading) children.push(heading(b.heading));
      children.push(para(b.text));
    }
  }
  return new Document({
    creator: 'ПР-помощник',
    title: d.title,
    sections: [{ properties: { page: PAGE }, footers: { default: footer(`КР «${GUIDELINE.title}» (${GUIDELINE.year})`) }, children }],
  });
}

/** Полный отчёт по случаю. */
export function buildCaseReport(c: Case, now = new Date()): Document {
  const p = c.patient;
  const ga = gestationalAge(p, now);
  const d = buildDiagnosis(c, now);
  const children: (Paragraph | Table)[] = [
    para('ПРЕЖДЕВРЕМЕННЫЕ РОДЫ / ПРПО — КАРТА ВЕДЕНИЯ', { bold: true, size: 30, align: AlignmentType.CENTER, after: 40 }),
    para(`Клинические рекомендации «${GUIDELINE.title}» (${GUIDELINE.author}, ${GUIDELINE.year}). МКБ-10: ${GUIDELINE.icd}`, { size: SMALL, italics: true, align: AlignmentType.CENTER, after: 200 }),
    heading('1. Пациентка'),
    table(
      ['Параметр', 'Значение'],
      [
        ['ФИО', p.fullName],
        ['№ истории / отделение', [p.historyNo, p.department].filter(Boolean).join(' / ')],
        ['Возраст, масса тела', `${p.age ?? '—'} лет, ${p.weightKg ?? '—'} кг`],
        ['Поступление', fmtDT(p.admittedAt)],
        ['Срок беременности (на момент отчёта)', `${fmtGa(ga?.days)}${ga ? ` (${{ us: 'по УЗИ 1 трим.', lmp: 'по ПМ', manual: 'указан вручную' }[ga.source]})` : ''}`],
        ['Ситуация', SCENARIO_LABEL[c.clinical.scenario]],
        ['Диагноз', diagnosisText(d)],
        ['МКБ-10', d.codes.map((k) => `${k.code} ${k.text}`).join('\n')],
      ],
      [35, 65],
    ),
    heading('2. Рекомендации КР для текущей ситуации'),
    table(
      ['Раздел', 'Статус', 'Рекомендация', 'Источник'],
      recommendations(c, now).map((r) => [CATEGORY_LABEL[r.category], LEVEL_LABEL[r.level], r.title, r.ref ? refText(r.ref) : '']),
      [16, 13, 51, 20],
    ),
    heading('3. Чек-лист'),
  ];
  const checks = visibleChecks(c, now);
  children.push(
    table(
      ['Раздел', 'Пункт', 'Выполнено', 'Время', 'Примечание'],
      CHECK_SECTIONS.flatMap((s) =>
        checks
          .filter((i) => i.section === s)
          .map((i) => {
            const st = c.checks[i.id];
            return [s, i.text, st?.done ? '☑ да' : st?.na ? 'н/п' : '☐ нет', st?.done ? fmtDT(st.at) : '', st?.note ?? ''];
          }),
      ),
      [16, 40, 10, 16, 18],
    ),
    heading('4. Лекарственные препараты'),
    c.meds.length
      ? table(['Время', 'Препарат', 'Доза', 'Примечание'], c.meds.map((m) => [fmtDT(m.at), drugById(m.drug)?.name ?? m.drug, m.dose, m.note ?? '']), [18, 37, 25, 20])
      : para('Не вводились.'),
    heading('5. Наблюдение'),
    c.vitals.length
      ? table(
          ['Время', 'АД', 'Пульс', 'ЧДД', 't °C', 'ЧСС плода', 'Рефлексы', 'Диурез'],
          c.vitals.map((v) => [
            fmtDT(v.at),
            v.sbp !== undefined ? `${v.sbp}/${v.dbp ?? '—'}` : '',
            String(v.hr ?? ''),
            String(v.rr ?? ''),
            String(v.temp ?? ''),
            String(v.fhr ?? ''),
            v.reflexes ? REFLEX_LABEL[v.reflexes] : '',
            v.diuresisMlH !== undefined ? `${v.diuresisMlH} мл/ч` : '',
          ]),
        )
      : para('Нет записей.'),
    ...(c.labs.length ? [table(['Время', 'Лейкоциты, ×10⁹/л', 'СРБ, мг/л', 'Примечание'], c.labs.map((l) => [fmtDT(l.at), String(l.wbc ?? ''), String(l.crp ?? ''), l.note ?? '']))] : []),
    heading('6. Родоразрешение'),
    c.delivery.at
      ? table(
          ['Параметр', 'Значение'],
          [
            ['Дата и время', fmtDT(c.delivery.at)],
            ['Способ', c.delivery.mode ? { vaginal: 'Через естественные родовые пути', cs: 'Кесарево сечение', 'breech-vaginal': 'Влагалищные роды в тазовом предлежании', forceps: 'Акушерские щипцы' }[c.delivery.mode] : '—'],
            ['Анестезия', c.delivery.anesthesia ? { neuraxial: 'Нейроаксиальная', general: 'Общая', none: 'Нет' }[c.delivery.anesthesia] : '—'],
            ['Пережатие пуповины', c.delivery.cordClampingSec !== undefined ? `${c.delivery.cordClampingSec} с${c.delivery.milking ? ', «доение»' : ''}` : '—'],
            ['Неонатолог присутствовал', c.delivery.neonatologist ? 'Да' : '—'],
            ['Пакет / лучистое тепло', c.delivery.thermalBag ? 'Да' : '—'],
            ['В плодных оболочках', c.delivery.enCaul ? 'Да' : '—'],
            ['Новорождённый', `${c.delivery.weightG ?? '—'} г, Апгар ${c.delivery.apgar1 ?? '—'}/${c.delivery.apgar5 ?? '—'}`],
            ['Примечание', c.delivery.note],
          ],
          [35, 65],
        )
      : para('Не было.'),
    heading('7. Критерии оценки качества'),
  );
  const qs = qualityScore(c, now);
  children.push(
    table(['№', 'Критерий', 'Оценка'], QUALITY_CRITERIA.map((q, i) => [String(i + 1), q.text, QUALITY_LABEL[qualityValue(c, q.id, now)]]), [6, 80, 14]),
    para(`Выполнено ${qs.yes} из ${qs.total} применимых критериев.`, { bold: true }),
    heading('8. Хронология'),
    table(['Время', 'Событие'], c.log.map((l) => [fmtDT(l.at), l.text]), [20, 80]),
    para(`\nОтчёт сформирован ${fmtDT(now.toISOString())}. Врач: ${c.extra.doctor || '______________'} / ______________`, { after: 0 }),
  );
  return new Document({
    creator: 'ПР-помощник',
    title: 'Преждевременные роды — отчёт',
    sections: [{ properties: { page: PAGE }, footers: { default: footer(`ПР-помощник · ${p.fullName || 'пациентка'}`) }, children }],
  });
}

export function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').slice(0, 80) || 'документ';
}
