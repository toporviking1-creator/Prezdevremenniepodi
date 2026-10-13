import { describe, expect, it } from 'vitest';
import { Packer } from 'docx';
import JSZip from 'jszip';
import { newCase } from '../protocol/case';
import { addMed, addVital } from '../state/actions';
import { buildCaseReport, buildConclusionDocument } from './docx';
import { TEMPLATES, docToText } from '../conclusions/templates';

const NOW = new Date('2026-03-10T12:00:00');

async function xmlOf(doc: Parameters<typeof Packer.toBuffer>[0]) {
  const buf = await Packer.toBuffer(doc);
  const zip = await JSZip.loadAsync(buf);
  return zip.file('word/document.xml')!.async('string');
}

describe('выгрузка в Word', () => {
  const base = () => {
    let c = newCase(NOW);
    c.patient.fullName = 'Петрова Анна';
    c.patient.manualWeeks = 30;
    c.patient.manualDays = 1;
    c.patient.manualAt = NOW.toISOString();
    c.clinical.scenario = 'pprom';
    c.clinical.membranes = 'ruptured';
    c.clinical.rupturedAt = '2026-03-10T02:00:00';
    c = addMed(c, 'betamethasone', '12 мг в/м', '2026-03-10T03:00:00', NOW.toISOString());
    c = addVital(c, { at: '2026-03-10T04:00:00', sbp: 120, dbp: 75, hr: 88, temp: 36.8 }, NOW.toISOString());
    return c;
  };

  it('отчёт по случаю содержит пациентку, диагноз, препараты и критерии качества', async () => {
    const xml = await xmlOf(buildCaseReport(base(), NOW));
    expect(xml).toContain('Петрова Анна');
    expect(xml).toContain('Преждевременный разрыв плодных оболочек');
    expect(xml).toContain('#Бетаметазон');
    expect(xml).toContain('Критерии оценки качества');
  });

  it('заключение: и из блоков, и из отредактированного текста', async () => {
    const c = base();
    const doc = TEMPLATES[0].build(c, NOW);
    expect(await xmlOf(buildConclusionDocument(doc))).toContain('План ведения');
    const edited = docToText(doc).replace('Диагноз:', 'Диагноз:') + '\n\nПримечание врача:\nправка вручную';
    const xml = await xmlOf(buildConclusionDocument(doc, edited));
    expect(xml).toContain('правка вручную');
    expect(xml).toContain('Петрова Анна');
  });
});
