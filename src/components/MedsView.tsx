import { useState } from 'react';
import type { Case } from '../protocol/types';
import { DRUGS, DRUG_GROUP_LABEL, drugById, steroidCourses, type DrugGroup } from '../protocol/drugs';
import { refText } from '../protocol/data';
import { addMed, removeMed } from '../state/actions';
import { Card, TimeField, fmtDateTime } from './ui';
import { TimerList } from './TacticsView';
import type { Act } from './forms';
import type { Alert } from '../protocol/alerts';

const GROUPS: DrugGroup[] = ['tocolysis', 'steroid', 'mg', 'abx', 'gbs', 'prevention'];

export function MedsView({ c, act, now, alerts }: { c: Case; act: Act; now: Date; alerts: Alert[] }) {
  const [drug, setDrug] = useState<string>('nifedipine-load');
  const def = drugById(drug)!;
  const [dose, setDose] = useState(def.doses[0]);
  const [at, setAt] = useState<string | undefined>();
  const [note, setNote] = useState('');
  const courses = steroidCourses(c.meds);

  const pick = (id: string) => {
    setDrug(id);
    setDose(drugById(id)!.doses[0]);
  };

  return (
    <div className="stack">
      {alerts.length > 0 && (
        <Card title="Таймеры">
          <TimerList alerts={alerts} now={now} />
        </Card>
      )}
      <Card title="Ввести препарат">
        {GROUPS.map((g) => (
          <div key={g}>
            <h4 className="cat-title">{DRUG_GROUP_LABEL[g]}</h4>
            <div className="chips">
              {DRUGS.filter((d) => d.group === g).map((d) => (
                <button key={d.id} className={`chip ${drug === d.id ? 'on' : ''}`} onClick={() => pick(d.id)}>
                  {d.name}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="dose-hint" style={{ marginTop: 12 }}>
          <strong>{def.name}</strong> {def.offLabel && <span className="offlabel">off-label: ВК + ИДС</span>} <span className="ref">{refText(def.ref)}</span>
          <p>{def.scheme}</p>
          {def.monitoring && <p className="small">Мониторинг: {def.monitoring}</p>}
          {def.cautions && <p className="small warn-text">{def.cautions}</p>}
        </div>
        <div className="grid-fields">
          <label className="field">
            <span className="field-label">Доза</span>
            <span className="field-input">
              <input list={`doses-${drug}`} value={dose} onChange={(e) => setDose(e.target.value)} />
              <datalist id={`doses-${drug}`}>
                {def.doses.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </span>
          </label>
          <TimeField label="Время (пусто — сейчас)" value={at} onChange={setAt} />
          <label className="field">
            <span className="field-label">Примечание</span>
            <span className="field-input">
              <input value={note} onChange={(e) => setNote(e.target.value)} />
            </span>
          </label>
        </div>
        <div className="chips" style={{ marginTop: 8 }}>
          {def.doses.map((d) => (
            <button key={d} className={`chip ${dose === d ? 'on' : ''}`} onClick={() => setDose(d)}>
              {d}
            </button>
          ))}
        </div>
        <div className="row">
          <button
            className="btn primary big"
            disabled={!dose.trim()}
            onClick={() => {
              act((x, t) => addMed(x, drug, dose.trim(), at ?? t, t, note.trim() || undefined));
              setAt(undefined);
              setNote('');
            }}
          >
            💉 Отметить введение
          </button>
        </div>
      </Card>
      {courses.length > 0 && (
        <Card title="Профилактика РДС плода">
          {courses.map((k, i) => (
            <p key={k.start} style={{ margin: '4px 0' }}>
              Курс {i + 1}: {k.drug === 'betamethasone' ? '#бетаметазон' : '#дексаметазон'} — {k.doses.length} из {k.needed} доз, начат {fmtDateTime(k.start)}
              {k.complete ? ' — завершён' : ''}
            </p>
          ))}
          <p className="small muted">Максимальный эффект — 2–7 сутки. Повторный курс однократно — не ранее 14 сут (rescue — 7 сут); более 2 курсов не рекомендовано.</p>
        </Card>
      )}
      <Card title={`Журнал введений (${c.meds.length})`}>
        {c.meds.length === 0 ? (
          <p className="muted">Пока ничего не введено.</p>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Время</th>
                  <th>Препарат</th>
                  <th>Доза</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...c.meds].reverse().map((m) => (
                  <tr key={m.id}>
                    <td className="mono">{fmtDateTime(m.at)}</td>
                    <td>
                      {drugById(m.drug)?.name ?? m.drug}
                      {m.note && <div className="small muted">{m.note}</div>}
                    </td>
                    <td>{m.dose}</td>
                    <td>
                      <button className="btn tiny ghost" onClick={() => confirm('Удалить запись?') && act((x, t) => removeMed(x, m.id, t))} aria-label="Удалить">
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
