import type { Case } from '../protocol/types';
import { CATEGORY_LABEL, LEVEL_LABEL, recommendations, type Rec, type RecCategory, type RecLevel } from '../protocol/rules';
import { refText } from '../protocol/data';
import { drugById } from '../protocol/drugs';
import { addMed, setCheck } from '../state/actions';
import { CHECK_ITEMS } from '../protocol/checklist';
import { Card, Countdown } from './ui';
import { DatingForm, KeyInputs, ScenarioPicker, type Act } from './forms';
import type { Alert } from '../protocol/alerts';

const ORDER: RecCategory[] = ['dx', 'route', 'pprom', 'tocolysis', 'steroid', 'mg', 'abx', 'prevention', 'delivery', 'newborn'];
const LEVEL_ORDER: RecLevel[] = ['contra', 'do', 'consider', 'avoid', 'info'];

export function RecItem({ r, c, act }: { r: Rec; c: Case; act: Act }) {
  const done = r.checkId ? !!c.checks[r.checkId]?.done : false;
  const label = r.checkId ? CHECK_ITEMS.find((i) => i.id === r.checkId)?.text ?? r.title : r.title;
  return (
    <div className={`rec rec-${r.level} ${done ? 'is-done' : ''}`}>
      <div className="rec-body">
        <span className="rec-lvl">{LEVEL_LABEL[r.level]}</span>
        <span className="rec-title">{r.title}</span>
        {r.detail && <span className="rec-detail">{r.detail}</span>}
        <span className="cl-meta">{r.ref && <span className="ref">{refText(r.ref)}</span>}</span>
        {(r.checkId || r.drugs) && (r.level === 'do' || r.level === 'consider' || r.level === 'info') && (
          <div className="rec-actions">
            {r.drugs?.map((d) => {
              const def = drugById(d);
              if (!def) return null;
              return (
                <button key={d} className="btn small primary" onClick={() => act((x, t) => addMed(x, d, def.doses[0], t, t))}>
                  💉 {def.name.replace(/ —.*$/, '')} {def.doses[0]}
                </button>
              );
            })}
            {r.checkId && (
              <button className={`btn small ${done ? 'ok' : ''}`} onClick={() => act((x, t) => setCheck(x, r.checkId!, !done, t, label))}>
                {done ? '✓ Выполнено' : 'Отметить выполнение'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function RecList({ recs, c, act, grouped = true }: { recs: Rec[]; c: Case; act: Act; grouped?: boolean }) {
  const sorted = [...recs].sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level));
  if (!grouped) {
    return (
      <div className="recs">
        {sorted.map((r) => (
          <RecItem key={r.id} r={r} c={c} act={act} />
        ))}
      </div>
    );
  }
  return (
    <div className="recs">
      {ORDER.filter((cat) => sorted.some((r) => r.category === cat)).map((cat) => (
        <section key={cat}>
          <h4 className="cat-title">{CATEGORY_LABEL[cat]}</h4>
          <div className="recs">
            {sorted
              .filter((r) => r.category === cat)
              .map((r) => (
                <RecItem key={r.id} r={r} c={c} act={act} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function TimerList({ alerts, now }: { alerts: Alert[]; now: Date }) {
  if (!alerts.length) return null;
  return (
    <div className="timers">
      {alerts.map((a) => (
        <div key={a.id} className={`alert alert-${a.level}`}>
          <span>{a.text}</span>
          {a.due && <Countdown due={a.due} now={now} />}
        </div>
      ))}
    </div>
  );
}

export function TacticsView({ c, act, now, alerts }: { c: Case; act: Act; now: Date; alerts: Alert[] }) {
  const recs = recommendations(c, now);
  const urgent = recs.filter((r) => (r.level === 'do' && !(r.checkId && c.checks[r.checkId]?.done)) || r.level === 'contra');
  return (
    <div className="stack">
      <Card title="Клиническая ситуация">
        <ScenarioPicker c={c} act={act} />
      </Card>
      <DatingForm c={c} act={act} now={now} />
      <Card title="Ключевые данные" actions={<span className="small muted">полностью — во вкладке «Данные»</span>}>
        <KeyInputs c={c} act={act} />
      </Card>
      {alerts.length > 0 && (
        <Card title="Таймеры и напоминания">
          <TimerList alerts={alerts} now={now} />
        </Card>
      )}
      {urgent.length > 0 && (
        <Card title={`Сделать сейчас (${urgent.length})`}>
          <RecList recs={urgent} c={c} act={act} grouped={false} />
        </Card>
      )}
      <details className="card" open={urgent.length === 0}>
        <summary>
          <strong>Все рекомендации КР для этой ситуации ({recs.length})</strong> <span className="small muted">— включая «не рекомендовано» и «противопоказано»</span>
        </summary>
        <div style={{ marginTop: 8 }}>
          <RecList recs={recs} c={c} act={act} />
        </div>
      </details>
    </div>
  );
}
