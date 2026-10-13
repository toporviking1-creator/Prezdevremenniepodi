import type { Case } from '../protocol/types';
import { DatingForm, FlagsForm, KeyInputs, PatientForm, RiskForm, UltrasoundForm, type Act } from './forms';
import { Card } from './ui';
import { updatePatient } from '../state/actions';

export function DataView({ c, act, now }: { c: Case; act: Act; now: Date }) {
  return (
    <div className="stack">
      <PatientForm c={c} act={act} />
      <DatingForm c={c} act={act} now={now} />
      <Card title="Обследование">
        <KeyInputs c={c} act={act} />
      </Card>
      <UltrasoundForm c={c} act={act} />
      <RiskForm c={c} act={act} />
      <FlagsForm c={c} act={act} />
      <Card title="Примечания">
        <textarea value={c.patient.notes} onChange={(e) => act((x, t) => updatePatient(x, { notes: e.target.value }, t))} rows={3} style={{ width: '100%' }} />
      </Card>
    </div>
  );
}
