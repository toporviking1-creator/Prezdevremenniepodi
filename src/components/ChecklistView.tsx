import { useState } from 'react';
import type { Case } from '../protocol/types';
import { CHECK_SECTIONS, visibleChecks } from '../protocol/checklist';
import { refText } from '../protocol/data';
import { setCheck, setCheckNa, setCheckNote, setCheckTime } from '../state/actions';
import { Card, TimeField, fmtDateTime } from './ui';
import type { Act } from './forms';

export function ChecklistView({ c, act, now }: { c: Case; act: Act; now: Date }) {
  const items = visibleChecks(c, now);
  const [open, setOpen] = useState<string | undefined>();
  const done = items.filter((i) => c.checks[i.id]?.done || c.checks[i.id]?.na).length;
  return (
    <div className="stack">
      <div className="toolbar">
        <span className={`progress ${done === items.length ? 'complete' : ''}`}>
          Выполнено {done} из {items.length}
        </span>
        <span className="small muted">Пункты подбираются под ситуацию и срок; препараты, введённые во вкладке «Препараты», отмечаются автоматически.</span>
      </div>
      {CHECK_SECTIONS.map((s) => {
        const list = items.filter((i) => i.section === s);
        if (!list.length) return null;
        return (
          <Card key={s} title={s}>
            <div className="cl-list">
              {list.map((i) => {
                const st = c.checks[i.id] ?? {};
                return (
                  <div key={i.id} className={`cl-item ${st.done ? 'done' : ''} ${st.na ? 'na' : ''}`}>
                    <button className="cl-check" onClick={() => act((x, t) => setCheck(x, i.id, !st.done, t, i.text))} aria-pressed={!!st.done}>
                      <span className="box">{st.done ? '✓' : ''}</span>
                      <span className="cl-text">
                        <span className="cl-title">{i.text}</span>
                        <span className="cl-meta">
                          {i.ref && <span className="ref">{refText(i.ref)}</span>}
                          {st.done && <span className="time">{fmtDateTime(st.at)}</span>}
                          {st.na && <span className="muted">не применимо</span>}
                          {st.note && <span className="note">{st.note}</span>}
                        </span>
                      </span>
                    </button>
                    <div className="cl-side">
                      <button className="btn tiny ghost" onClick={() => setOpen(open === i.id ? undefined : i.id)} aria-label="Подробнее">
                        ⋯
                      </button>
                    </div>
                    {open === i.id && (
                      <div className="cl-more" style={{ gridColumn: '1 / -1', padding: '0 8px 8px' }}>
                        <div className="grid-fields">
                          <TimeField label="Время выполнения" value={st.at} onChange={(v) => act((x, t) => setCheckTime(x, i.id, v, t))} />
                          <label className="field field-wide">
                            <span className="field-label">Примечание</span>
                            <input value={st.note ?? ''} onChange={(e) => act((x, t) => setCheckNote(x, i.id, e.target.value, t))} />
                          </label>
                        </div>
                        <div className="row">
                          <button className="btn small" onClick={() => act((x, t) => setCheckNa(x, i.id, !st.na, t))}>
                            {st.na ? 'Вернуть' : 'Не применимо'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
