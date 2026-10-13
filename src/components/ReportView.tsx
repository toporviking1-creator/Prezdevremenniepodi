import type { Case } from '../protocol/types';
import { QUALITY_CRITERIA } from '../protocol/data';
import { qualityScore, qualityValue, autoQuality, QUALITY_LABEL } from '../protocol/quality';
import { addNote, setQuality } from '../state/actions';
import { buildCaseReport, safeFileName } from '../export/docx';
import { downloadDocx, downloadJson } from '../export/download';
import { Card, fmtDateTime } from './ui';
import type { Act } from './forms';
import { useState } from 'react';

export function ReportView({ c, act, now }: { c: Case; act: Act; now: Date }) {
  const qs = qualityScore(c, now);
  const [note, setNote] = useState('');
  return (
    <div className="stack">
      <Card title="Выгрузка">
        <div className="export-buttons row" style={{ marginTop: 0 }}>
          <button className="btn primary big" onClick={() => downloadDocx(buildCaseReport(c, now), `ПР_${safeFileName(c.patient.fullName || 'пациентка')}_${now.toISOString().slice(0, 10)}`)}>
            ⬇ Отчёт по случаю (Word)
          </button>
          <button className="btn" onClick={() => downloadJson(c, `ПР_${safeFileName(c.patient.fullName || c.id)}.json`)}>
            Резервная копия (JSON)
          </button>
        </div>
        <p className="small muted">Заключения, протоколы ВК, ИДС и консилиумы — во вкладке «Заключение».</p>
      </Card>
      <Card title={`Критерии оценки качества — ${qs.yes} из ${qs.total}`} actions={<span className="ref">КР 2024</span>}>
        <div className="quality">
          {QUALITY_CRITERIA.map((q, i) => {
            const v = qualityValue(c, q.id, now);
            const manual = c.quality[q.id] !== undefined;
            return (
              <div key={q.id} className={`q q-${v === 'yes' ? 'yes' : v === 'no' ? 'no' : 'na'}`}>
                <span className="q-n">{i + 1}</span>
                <span className="q-text">{q.text}</span>
                <span className="q-val">
                  <strong>{QUALITY_LABEL[v]}</strong>
                  <span className="q-btns">
                    <button className="btn tiny" onClick={() => act((x, t) => setQuality(x, q.id, true, t))}>
                      Да
                    </button>
                    <button className="btn tiny" onClick={() => act((x, t) => setQuality(x, q.id, false, t))}>
                      Нет
                    </button>
                    {manual && (
                      <button className="btn tiny ghost" title={`Авто: ${QUALITY_LABEL[autoQuality(c, q.id, now)]}`} onClick={() => act((x, t) => setQuality(x, q.id, undefined, t))}>
                        авто
                      </button>
                    )}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </Card>
      <Card title="Хронология">
        <div className="row" style={{ marginTop: 0 }}>
          <input value={note} placeholder="Запись в журнал…" onChange={(e) => setNote(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <button
            className="btn"
            disabled={!note.trim()}
            onClick={() => {
              act((x, t) => addNote(x, `📝 ${note.trim()}`, t));
              setNote('');
            }}
          >
            Добавить
          </button>
        </div>
        <ul className="log">
          {[...c.log].reverse().map((l, i) => (
            <li key={i}>
              <span className="mono">{fmtDateTime(l.at)}</span>
              <span>{l.text}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
