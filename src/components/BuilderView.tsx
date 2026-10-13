import { useEffect, useMemo, useRef, useState } from 'react';
import type { Case, ConclusionExtra } from '../protocol/types';
import { TEMPLATES, docToText, planRecs, templateById, OFF_LABEL_DRUGS, type Field } from '../conclusions/templates';
import { buildDiagnosis, diagnosisText } from '../conclusions/diagnosis';
import { drugById } from '../protocol/drugs';
import { LEVEL_LABEL } from '../protocol/rules';
import { removeConclusion, saveConclusion, updateExtra } from '../state/actions';
import { buildConclusionDocument, safeFileName } from '../export/docx';
import { downloadDocx } from '../export/download';
import { Card, Select, TextField, fmtDateTime } from './ui';
import { DatingForm, FlagsForm, KeyInputs, PatientForm, RiskForm, ScenarioPicker, UltrasoundForm, type Act } from './forms';

const TPL_KEY = 'pr-pomoshnik.builder.template';

function readTpl(): string {
  try {
    return localStorage.getItem(TPL_KEY) ?? TEMPLATES[0].id;
  } catch {
    return TEMPLATES[0].id;
  }
}

export function BuilderView({ c, act, now, standalone, onSaveAsCase, onReset }: { c: Case; act: Act; now: Date; standalone?: boolean; onSaveAsCase?: () => void; onReset?: () => void }) {
  const [tplId, setTplId] = useState(readTpl);
  const tpl = templateById(tplId);
  // Минутная точность: текст не «прыгает» каждую секунду.
  const minute = Math.floor(now.getTime() / 60_000);
  const doc = useMemo(() => tpl.build(c, new Date(minute * 60_000)), [tpl, c, minute]);
  const generated = useMemo(() => docToText(doc), [doc]);
  const [edited, setEdited] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);
  /** Текст сохранённого заключения, который нужно открыть после смены шаблона. */
  const pending = useRef<string | undefined>(undefined);
  const text = edited ?? generated;

  useEffect(() => {
    try {
      localStorage.setItem(TPL_KEY, tplId);
    } catch {
      /* без сохранения выбора */
    }
    setEdited(pending.current);
    pending.current = undefined;
  }, [tplId]);

  const ex = c.extra;
  const upEx = (patch: Partial<ConclusionExtra>) => act((x, t) => updateExtra(x, patch, t));
  const has = (f: Field) => tpl.fields.includes(f);
  const dx = buildDiagnosis(c, now);
  const plan = has('plan') ? planRecs(c, now) : [];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert('Не удалось скопировать — выделите текст вручную.');
    }
  };

  return (
    <div className="builder">
      <div className="stack">
        <Card title="Шаблон">
          <div className="tpl-list" role="radiogroup">
            {TEMPLATES.map((t) => (
              <button key={t.id} role="radio" aria-checked={t.id === tplId} className={`tpl ${t.id === tplId ? 'on' : ''}`} onClick={() => setTplId(t.id)}>
                <strong>{t.title}</strong>
                <small>{t.description}</small>
              </button>
            ))}
          </div>
        </Card>

        <Card title="Диагноз (формируется автоматически)">
          <div className="dx-box">
            <strong>{diagnosisText(dx) || '—'}</strong>
            <div className="icd" style={{ marginTop: 6 }}>
              {dx.codes.map((k) => (
                <span key={k.code} className="small">
                  <code>{k.code}</code>
                  {k.text}
                </span>
              ))}
            </div>
          </div>
          {!standalone && <p className="small muted">Изменяется через вкладки «Тактика» и «Данные».</p>}
        </Card>

        <Card title="Поля заключения">
          <div className="grid-fields">
            {has('doctor') && <TextField label="Врач (ФИО)" value={ex.doctor} onChange={(v) => upEx({ doctor: v })} wide />}
            {has('head') && <TextField label="Заведующий отделением / председатель" value={ex.head} onChange={(v) => upEx({ head: v })} wide />}
            {has('members') && <TextField label="Члены комиссии / консилиума" value={ex.members} onChange={(v) => upEx({ members: v })} wide placeholder="ФИО, должности" />}
            {has('offLabelDrug') && (
              <Select
                label="Препарат вне инструкции"
                value={ex.offLabelDrug}
                onChange={(v) => upEx({ offLabelDrug: v })}
                options={OFF_LABEL_DRUGS.map((id) => ({ value: id, label: drugById(id)!.name }))}
                wide
              />
            )}
          </div>
          {has('consiliumDecision') && (
            <label className="field" style={{ marginTop: 10 }}>
              <span className="field-label">Решение консилиума (пусто — сформируется по КР)</span>
              <textarea value={ex.consiliumDecision} onChange={(e) => upEx({ consiliumDecision: e.target.value })} rows={4} />
            </label>
          )}
          {has('freeText') && (
            <label className="field" style={{ marginTop: 10 }}>
              <span className="field-label">Дополнительно (свободный текст)</span>
              <textarea value={ex.freeText} onChange={(e) => upEx({ freeText: e.target.value })} rows={3} />
            </label>
          )}
        </Card>

        {plan.length > 0 && (
          <Card title="Пункты плана">
            <div className="plan-pick">
              {plan.map((r) => (
                <label key={r.id} className="toggle">
                  <input
                    type="checkbox"
                    checked={!ex.excludedPlan.includes(r.id)}
                    onChange={(e) => upEx({ excludedPlan: e.target.checked ? ex.excludedPlan.filter((i) => i !== r.id) : [...ex.excludedPlan, r.id] })}
                  />
                  <span>
                    <b>{LEVEL_LABEL[r.level]}:</b> {r.title}
                  </span>
                </label>
              ))}
            </div>
          </Card>
        )}

        {standalone && (
          <details className="card">
            <summary>
              <strong>Данные пациентки для заключения</strong>
            </summary>
            <div className="stack" style={{ marginTop: 10 }}>
              <ScenarioPicker c={c} act={act} />
              <PatientForm c={c} act={act} />
              <DatingForm c={c} act={act} now={now} />
              <Card title="Ключевые данные">
                <KeyInputs c={c} act={act} />
              </Card>
              <UltrasoundForm c={c} act={act} />
              <RiskForm c={c} act={act} />
              <FlagsForm c={c} act={act} />
            </div>
          </details>
        )}
      </div>

      <div className="stack">
        <Card
          title={doc.title}
          actions={
            <div className="row no-print" style={{ marginTop: 0 }}>
              <button className="btn small" onClick={copy}>
                {copied ? '✓ Скопировано' : '📋 Копировать'}
              </button>
              <button
                className="btn small primary"
                onClick={() => downloadDocx(buildConclusionDocument(doc, edited), `${safeFileName(tpl.title)}_${safeFileName(c.patient.fullName || 'пациентка')}`)}
              >
                ⬇ Word
              </button>
              <button className="btn small" onClick={() => window.print()}>
                🖨 Печать
              </button>
              {!standalone && (
                <button className="btn small" onClick={() => act((x, t) => saveConclusion(x, { template: tpl.id, title: tpl.title, text, at: t }, t))}>
                  💾 В историю случая
                </button>
              )}
            </div>
          }
        >
          {edited !== undefined && (
            <p className="dirty-note no-print">
              Текст изменён вручную — новые данные не подставляются.{' '}
              <button className="btn tiny" onClick={() => setEdited(undefined)}>
                Вернуть автоматический
              </button>
            </p>
          )}
          <textarea className="preview no-print" value={text} onChange={(e) => setEdited(e.target.value)} aria-label="Текст заключения" spellCheck />
          <div className="print-only">{text}</div>
        </Card>
        {standalone && (
          <div className="row no-print">
            {onSaveAsCase && (
              <button className="btn" onClick={onSaveAsCase}>
                Сохранить как случай
              </button>
            )}
            {onReset && (
              <button className="btn ghost" onClick={() => confirm('Очистить все данные черновика?') && onReset()}>
                Очистить черновик
              </button>
            )}
          </div>
        )}
        {!standalone && c.conclusions.length > 0 && (
          <Card title="Сохранённые заключения" className="no-print">
            <ul className="log">
              {c.conclusions.map((s) => (
                <li key={s.id}>
                  <span className="mono">{fmtDateTime(s.at)}</span>
                  <span>{s.title}</span>
                  <button
                    className="btn tiny"
                    onClick={() => {
                      if (s.template === tplId) setEdited(s.text);
                      else {
                        pending.current = s.text;
                        setTplId(s.template);
                      }
                    }}
                  >
                    Открыть
                  </button>
                  <button className="btn tiny ghost" onClick={() => confirm('Удалить сохранённое заключение?') && act((x, t) => removeConclusion(x, s.id, t))} aria-label="Удалить">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
