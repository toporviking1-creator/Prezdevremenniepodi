import type { Case } from '../protocol/types';
import { SCENARIO_LABEL } from '../protocol/data';
import { GA_CATEGORY_LABEL, fmtGa, gaCategory, gestationalAge } from '../protocol/ga';
import { buildCtx, formatHours } from '../protocol/rules';
import type { Alert } from '../protocol/alerts';
import { Countdown } from './ui';

export function CaseHeader({ c, now, alerts, onBack }: { c: Case; now: Date; alerts: Alert[]; onBack: () => void }) {
  const ga = gestationalAge(c.patient, now);
  const x = buildCtx(c, now);
  const next = alerts.filter((a) => a.due).sort((a, b) => a.due!.localeCompare(b.due!))[0];
  const danger = alerts.some((a) => a.level === 'danger');
  return (
    <header className={`case-header ${danger ? 'sev-critical' : ''}`}>
      <div className="ch-row">
        <button className="btn ghost back" onClick={onBack} aria-label="К списку пациенток">
          ‹
        </button>
        <div className="ch-name">
          <strong>{c.patient.fullName || 'Без имени'}</strong>
          <span>
            <span className="scenario-badge">{SCENARIO_LABEL[c.clinical.scenario]}</span>
            {x.latencyH !== undefined && ` · безводный ${formatHours(x.latencyH)}`}
            {c.clinical.fetuses >= 2 && ` · ${c.clinical.fetuses === 2 ? 'двойня' : 'тройня'}`}
            {c.clinical.presentation === 'breech' && ' · тазовое'}
          </span>
        </div>
        <div className="ch-timer">
          <span className="label">срок</span>
          <span className="value">{fmtGa(ga?.days)}</span>
        </div>
      </div>
      {(ga || next) && (
        <div className="ch-stats small">
          {ga && <span className="muted">{GA_CATEGORY_LABEL[gaCategory(ga.days)]}</span>}
          {next && (
            <span>
              {next.text}: <Countdown due={next.due!} now={now} />
            </span>
          )}
        </div>
      )}
    </header>
  );
}
