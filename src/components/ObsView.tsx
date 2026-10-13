import { useState } from 'react';
import type { Case, VitalEntry } from '../protocol/types';
import { addLab, addVital, removeLab, removeVital, REFLEX_LABEL } from '../state/actions';
import { Card, NumField, Select, TimeField, fmtDateTime } from './ui';
import type { Act } from './forms';

type VitalDraft = Omit<VitalEntry, 'id' | 'at'>;

export function ObsView({ c, act }: { c: Case; act: Act }) {
  const [v, setV] = useState<VitalDraft>({});
  const [vAt, setVAt] = useState<string | undefined>();
  const [lab, setLab] = useState<{ wbc?: number; crp?: number; note?: string }>({});
  const [lAt, setLAt] = useState<string | undefined>();
  const onMg = c.meds.some((m) => m.drug === 'mg-bolus');
  const hasV = Object.values(v).some((x) => x !== undefined);

  return (
    <div className="stack">
      <Card title="Витальные функции и плод" actions={<span className="ref">КР 2.2</span>}>
        <div className="grid-fields">
          <NumField label="САД" unit="мм" value={v.sbp} onChange={(x) => setV({ ...v, sbp: x })} />
          <NumField label="ДАД" unit="мм" value={v.dbp} onChange={(x) => setV({ ...v, dbp: x })} />
          <NumField label="Пульс" unit="/мин" value={v.hr} onChange={(x) => setV({ ...v, hr: x })} />
          <NumField label="ЧДД" unit="/мин" value={v.rr} onChange={(x) => setV({ ...v, rr: x })} warn={v.rr !== undefined && v.rr < 12} />
          <NumField label="Температура" unit="°C" value={v.temp} onChange={(x) => setV({ ...v, temp: x })} warn={v.temp !== undefined && v.temp >= 38} />
          <NumField label="ЧСС плода" unit="/мин" value={v.fhr} onChange={(x) => setV({ ...v, fhr: x })} />
          <Select
            label={onMg ? 'Коленные рефлексы (магний!)' : 'Коленные рефлексы'}
            value={v.reflexes}
            placeholder="—"
            onChange={(x) => setV({ ...v, reflexes: x || undefined })}
            options={(Object.keys(REFLEX_LABEL) as (keyof typeof REFLEX_LABEL)[]).map((k) => ({ value: k, label: REFLEX_LABEL[k] }))}
          />
          <NumField label="Диурез" unit="мл/ч" value={v.diuresisMlH} onChange={(x) => setV({ ...v, diuresisMlH: x })} />
          <TimeField label="Время (пусто — сейчас)" value={vAt} onChange={setVAt} />
        </div>
        <div className="row">
          <button
            className="btn primary"
            disabled={!hasV}
            onClick={() => {
              act((x, t) => addVital(x, { ...v, at: vAt ?? t }, t));
              setV({});
              setVAt(undefined);
            }}
          >
            Записать
          </button>
        </div>
        {c.vitals.length > 0 && (
          <div className="tbl-wrap" style={{ marginTop: 12 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Время</th>
                  <th>АД</th>
                  <th>Пульс</th>
                  <th>ЧДД</th>
                  <th>t</th>
                  <th>ЧСС пл.</th>
                  <th>Рефл.</th>
                  <th>Диурез</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...c.vitals].reverse().map((r) => (
                  <tr key={r.id} className={r.temp !== undefined && r.temp >= 38 ? 'danger-row' : ''}>
                    <td className="mono">{fmtDateTime(r.at)}</td>
                    <td>{r.sbp !== undefined ? `${r.sbp}/${r.dbp ?? '—'}` : ''}</td>
                    <td>{r.hr ?? ''}</td>
                    <td>{r.rr ?? ''}</td>
                    <td>{r.temp ?? ''}</td>
                    <td>{r.fhr ?? ''}</td>
                    <td>{r.reflexes ? REFLEX_LABEL[r.reflexes] : ''}</td>
                    <td>{r.diuresisMlH ?? ''}</td>
                    <td>
                      <button className="btn tiny ghost" onClick={() => confirm('Удалить запись?') && act((x, t) => removeVital(x, r.id, t))} aria-label="Удалить">
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
      <Card title="Лейкоциты и СРБ" actions={<span className="ref">КР 2.3; УУР B, УДД 2</span>}>
        <p className="small muted" style={{ marginTop: 0 }}>
          При ПРПО — для своевременной диагностики септических осложнений. Лейкоцитоз возрастает через 24 ч после ГКС и нормализуется через 3 дня; СРБ — наиболее точный маркер.
        </p>
        <div className="grid-fields">
          <NumField label="Лейкоциты" unit="×10⁹/л" value={lab.wbc} onChange={(x) => setLab({ ...lab, wbc: x })} />
          <NumField label="СРБ" unit="мг/л" value={lab.crp} onChange={(x) => setLab({ ...lab, crp: x })} />
          <TimeField label="Время (пусто — сейчас)" value={lAt} onChange={setLAt} />
          <label className="field">
            <span className="field-label">Примечание</span>
            <span className="field-input">
              <input value={lab.note ?? ''} onChange={(e) => setLab({ ...lab, note: e.target.value })} />
            </span>
          </label>
        </div>
        <div className="row">
          <button
            className="btn primary"
            disabled={lab.wbc === undefined && lab.crp === undefined && !lab.note}
            onClick={() => {
              act((x, t) => addLab(x, { ...lab, note: lab.note || undefined, at: lAt ?? t }, t));
              setLab({});
              setLAt(undefined);
            }}
          >
            Записать
          </button>
        </div>
        {c.labs.length > 0 && (
          <div className="tbl-wrap" style={{ marginTop: 12 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Время</th>
                  <th>Лейкоциты</th>
                  <th>СРБ</th>
                  <th>Примечание</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...c.labs].reverse().map((l) => (
                  <tr key={l.id}>
                    <td className="mono">{fmtDateTime(l.at)}</td>
                    <td>{l.wbc ?? ''}</td>
                    <td>{l.crp ?? ''}</td>
                    <td>{l.note ?? ''}</td>
                    <td>
                      <button className="btn tiny ghost" onClick={() => confirm('Удалить запись?') && act((x, t) => removeLab(x, l.id, t))} aria-label="Удалить">
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
