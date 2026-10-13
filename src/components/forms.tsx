import type { Case, Clinical, Flags, Scenario } from '../protocol/types';
import { FLAG_DEFS, FLAG_GROUP_LABEL, RISK_FACTORS, SCENARIO_HINT, SCENARIO_LABEL, type FlagDef } from '../protocol/data';
import { setFlag, updateClinical, updatePatient } from '../state/actions';
import { Card, DateField, NumField, Select, TextField, TimeField, Toggle } from './ui';
import { GA_CATEGORY_LABEL, dueDate, fmtGa, gaCategory, gestationalAge } from '../protocol/ga';

export type Act = (fn: (c: Case, t: string) => Case) => void;

const SCENARIOS: Scenario[] = ['prevention', 'threat', 'imminent', 'active', 'pprom', 'induced'];

export function ScenarioPicker({ c, act }: { c: Case; act: Act }) {
  return (
    <div className="scenarios" role="radiogroup" aria-label="Клиническая ситуация">
      {SCENARIOS.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={c.clinical.scenario === s}
          className={`scenario-btn ${c.clinical.scenario === s ? 'on' : ''}`}
          onClick={() => act((x, t) => updateClinical(x, { scenario: s }, t))}
        >
          <strong>{SCENARIO_LABEL[s]}</strong>
          <small>{SCENARIO_HINT[s]}</small>
        </button>
      ))}
    </div>
  );
}

/** Срок беременности: по УЗИ 11–13+6 нед, по ПМ или вручную. */
export function DatingForm({ c, act, now }: { c: Case; act: Act; now: Date }) {
  const p = c.patient;
  const ga = gestationalAge(p, now);
  const up = (patch: Partial<Case['patient']>) => act((x, t) => updatePatient(x, patch, t));
  const edd = dueDate(p, now);
  return (
    <Card
      title="Срок беременности"
      actions={
        ga && (
          <div style={{ textAlign: 'right' }}>
            <div className="ga-big">{fmtGa(ga.days)}</div>
            <div className="ga-cat">{GA_CATEGORY_LABEL[gaCategory(ga.days)]}</div>
          </div>
        )
      }
    >
      <div className="grid-fields">
        <DateField label="1-й день последней менструации" value={p.lmp} onChange={(v) => up({ lmp: v })} />
        <DateField label="Дата УЗИ 11–13+6 нед" value={p.usDate} onChange={(v) => up({ usDate: v })} />
        <NumField label="Срок по УЗИ, нед" value={p.usWeeks} onChange={(v) => up({ usWeeks: v })} />
        <NumField label="+ дней" value={p.usDays} onChange={(v) => up({ usDays: v })} />
        <NumField label="Или вручную: нед" value={p.manualWeeks} onChange={(v) => up({ manualWeeks: v, manualAt: new Date().toISOString() })} />
        <NumField label="+ дней" value={p.manualDays} onChange={(v) => up({ manualDays: v, manualAt: new Date().toISOString() })} />
      </div>
      <p className="small muted">
        {ga ? (
          <>
            Источник: {ga.source === 'us' ? 'УЗИ 1-го триместра' : ga.source === 'lmp' ? 'последняя менструация' : 'указан вручную (нарастает с датой ввода)'}.
            {edd && ` ПДР: ${edd.toLocaleDateString('ru-RU')}.`}
            {ga.discrepancyDays !== undefined && Math.abs(ga.discrepancyDays) > 7 && (
              <span className="warn-text"> Расхождение ПМ и УЗИ {Math.abs(ga.discrepancyDays)} дн — срок по УЗИ.</span>
            )}
          </>
        ) : (
          'Срок по КР устанавливается по 1-му дню последней менструации и УЗИ в 11–13+6 нед.'
        )}
      </p>
    </Card>
  );
}

/** Ключевые клинические данные, от которых зависит тактика. */
export function KeyInputs({ c, act }: { c: Case; act: Act }) {
  const cl = c.clinical;
  const up = (patch: Partial<Clinical>) => act((x, t) => updateClinical(x, patch, t));
  return (
    <div className="stack">
      <div className="grid-fields">
        <NumField label="Длина шейки (УЗИ)" unit="мм" value={cl.cervixMm} onChange={(v) => up({ cervixMm: v })} warn={cl.cervixMm !== undefined && cl.cervixMm <= 25} />
        <NumField label="Срок цервикометрии" unit="нед" value={cl.cervixAtWeeks} onChange={(v) => up({ cervixAtWeeks: v })} placeholder="текущий" />
        <NumField label="Раскрытие зева" unit="см" value={cl.dilationCm} onChange={(v) => up({ dilationCm: v })} />
        <NumField label="Схваток за 20 мин" value={cl.contractionsPer20} onChange={(v) => up({ contractionsPer20: v })} />
        <Select
          label="Плодные оболочки"
          value={cl.membranes}
          onChange={(v) => up({ membranes: v })}
          options={[
            { value: 'intact', label: 'целы' },
            { value: 'ruptured', label: 'разрыв (ПРПО)' },
            { value: 'prolapse', label: 'пролабирование' },
          ]}
        />
        {cl.membranes === 'ruptured' && <TimeField label="Время излития вод" value={cl.rupturedAt} onChange={(v) => up({ rupturedAt: v })} />}
        <Select
          label="Тест на ПР (ПСИФР-1/ПАМГ-1/ИЛ-6)"
          value={cl.pretermTest}
          onChange={(v) => up({ pretermTest: v })}
          options={[
            { value: 'not-done', label: 'не проводился' },
            { value: 'negative', label: 'отрицательный' },
            { value: 'positive', label: 'положительный' },
          ]}
        />
        {(cl.scenario === 'pprom' || cl.membranes !== 'intact') && (
          <Select
            label="Тест на подтекание вод"
            value={cl.romTest}
            onChange={(v) => up({ romTest: v })}
            options={[
              { value: 'not-done', label: 'не проводился' },
              { value: 'negative', label: 'отрицательный' },
              { value: 'positive', label: 'положительный' },
            ]}
          />
        )}
        <Select
          label="Стрептококк группы B"
          value={cl.gbs}
          onChange={(v) => up({ gbs: v })}
          options={[
            { value: 'unknown', label: 'статус неизвестен' },
            { value: 'negative', label: 'отрицательно' },
            { value: 'positive', label: 'носительство' },
          ]}
        />
        {cl.gbs === 'negative' && <DateField label="Дата посева СГВ" value={cl.gbsDate} onChange={(v) => up({ gbsDate: v })} />}
        <Select
          label="Число плодов"
          value={String(cl.fetuses) as '1' | '2' | '3'}
          onChange={(v) => up({ fetuses: Number(v) })}
          options={[
            { value: '1', label: 'один' },
            { value: '2', label: 'двойня' },
            { value: '3', label: 'тройня' },
          ]}
        />
        {cl.fetuses >= 2 && (
          <Select
            label="Хориальность"
            value={cl.chorionicity}
            placeholder="—"
            onChange={(v) => up({ chorionicity: v || undefined })}
            options={[
              { value: 'dichorionic', label: 'дихориальная' },
              { value: 'monochorionic-diamniotic', label: 'МХДА' },
              { value: 'monochorionic-monoamniotic', label: 'МХМА' },
            ]}
          />
        )}
        <Select
          label={cl.fetuses >= 2 ? 'Предлежание 1-го плода' : 'Предлежание'}
          value={cl.presentation}
          onChange={(v) => up({ presentation: v })}
          options={[
            { value: 'cephalic', label: 'головное' },
            { value: 'breech', label: 'тазовое' },
            { value: 'transverse', label: 'поперечное' },
            { value: 'unknown', label: 'не определено' },
          ]}
        />
      </div>
    </div>
  );
}

export function UltrasoundForm({ c, act }: { c: Case; act: Act }) {
  const cl = c.clinical;
  const up = (patch: Partial<Clinical>) => act((x, t) => updateClinical(x, patch, t));
  const oligo = (cl.mvpCm !== undefined && cl.mvpCm <= 2) || (cl.afiCm !== undefined && cl.afiCm <= 5);
  return (
    <Card title="УЗИ плода">
      <div className="grid-fields">
        <NumField label="ПМП" unit="г" value={cl.efwG} onChange={(v) => up({ efwG: v })} />
        <NumField label="ИАЖ" unit="см" value={cl.afiCm} onChange={(v) => up({ afiCm: v })} warn={cl.afiCm !== undefined && cl.afiCm <= 5} />
        <NumField label="МВК" unit="см" value={cl.mvpCm} onChange={(v) => up({ mvpCm: v })} warn={cl.mvpCm !== undefined && cl.mvpCm <= 2} />
        <NumField label="Расширение внутр. зева" unit="мм" value={cl.funnelMm} onChange={(v) => up({ funnelMm: v })} />
        <Select
          label="Допплерометрия"
          value={cl.doppler}
          onChange={(v) => up({ doppler: v })}
          options={[
            { value: 'normal', label: 'без нарушений' },
            { value: 'mild', label: '↑ПИ АП/МА или ↓ЦПО' },
            { value: 'aedf', label: 'нулевой кровоток в АП' },
            { value: 'redf', label: 'реверсный кровоток в АП' },
            { value: 'dv', label: 'нарушения в венозном протоке' },
          ]}
        />
      </div>
      <div className="row">
        <Toggle label="ПМП не соответствует сроку (ЗРП)" checked={cl.fgr} onChange={(v) => up({ fgr: v })} />
        <Toggle label="Планируется кесарево сечение" checked={cl.plannedCs} onChange={(v) => up({ plannedCs: v })} />
      </div>
      {oligo && <p className="small warn-text">Маловодие: МВК ≤ 2 см или ИАЖ ≤ 5 см (КР «Аномалии объёма АЖ», 2024).</p>}
    </Card>
  );
}

export function FlagsForm({ c, act, groups }: { c: Case; act: Act; groups?: FlagDef['group'][] }) {
  const gs = groups ?? (['tocolysis', 'drug', 'mg', 'other'] as const);
  return (
    <Card title="Противопоказания и особые состояния">
      {gs.map((g) => (
        <div key={g}>
          <h4 className="cat-title">{FLAG_GROUP_LABEL[g]}</h4>
          <div className="flags">
            {FLAG_DEFS.filter((f) => f.group === g).map((f) => (
              <Toggle key={f.id} label={f.text} checked={c.clinical.flags[f.id]} onChange={(v) => act((x, t) => setFlag(x, f.id as keyof Flags, v, t))} />
            ))}
          </div>
        </div>
      ))}
    </Card>
  );
}

export function PatientForm({ c, act }: { c: Case; act: Act }) {
  const p = c.patient;
  const up = (patch: Partial<Case['patient']>) => act((x, t) => updatePatient(x, patch, t));
  return (
    <Card title="Пациентка">
      <div className="grid-fields">
        <TextField label="ФИО" value={p.fullName} onChange={(v) => up({ fullName: v })} wide />
        <TextField label="№ истории" value={p.historyNo} onChange={(v) => up({ historyNo: v })} />
        <TextField label="Отделение" value={p.department} onChange={(v) => up({ department: v })} />
        <NumField label="Возраст" unit="лет" value={p.age} onChange={(v) => up({ age: v })} />
        <NumField label="Масса тела" unit="кг" value={p.weightKg} onChange={(v) => up({ weightKg: v })} />
        <NumField label="Беременность по счёту" value={p.gravidity} onChange={(v) => up({ gravidity: v })} />
        <NumField label="Родов в анамнезе" value={p.parity} onChange={(v) => up({ parity: v })} />
        <TimeField label="Поступление" value={p.admittedAt} onChange={(v) => up({ admittedAt: v })} />
      </div>
    </Card>
  );
}

export function RiskForm({ c, act }: { c: Case; act: Act }) {
  const sel = new Set(c.patient.riskFactors);
  return (
    <Card title="Анамнез и факторы риска ПР" actions={<span className="ref">КР 2.1</span>}>
      <div className="risk-list">
        {RISK_FACTORS.map((f) => (
          <label key={f.id} className={`risk-item ${sel.has(f.id) ? 'on' : ''}`}>
            <input
              type="checkbox"
              checked={sel.has(f.id)}
              onChange={(e) =>
                act((x, t) =>
                  updatePatient(x, { riskFactors: e.target.checked ? [...x.patient.riskFactors, f.id] : x.patient.riskFactors.filter((r) => r !== f.id) }, t),
                )
              }
            />
            <span>{f.text}</span>
            {f.historyHigh && <span className="risk risk-high">высокий</span>}
          </label>
        ))}
      </div>
      <p className="small muted">
        Группа высокого риска: ПР до 34 нед (многоплодие — до 32 нед) или выкидыш после 16 нед в анамнезе <b>и</b> длина шейки &lt; 25 мм в 16–24+6 нед (УУР A, УДД 1).
      </p>
    </Card>
  );
}
