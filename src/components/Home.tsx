import { useRef } from 'react';
import type { Case } from '../protocol/types';
import { SCENARIO_LABEL, GUIDELINE } from '../protocol/data';
import { fmtGa, gestationalAge } from '../protocol/ga';
import { downloadJson } from '../export/download';
import { fmtDateTime } from './ui';

export function Home(props: {
  cases: Case[];
  now: Date;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onImport: (cs: Partial<Case>[]) => number;
  onBuilder: () => void;
  onReference: () => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="stack">
      <header className="home-head">
        <div className="logo" aria-hidden>
          ПР
        </div>
        <div>
          <h1>ПР-помощник</h1>
          <p className="muted small">
            Преждевременные роды и ПРПО при недоношенной беременности — КР «{GUIDELINE.title}» ({GUIDELINE.year}) и смежные КР
          </p>
        </div>
      </header>
      <div className="home-actions">
        <button className="home-tile primary" onClick={props.onCreate}>
          <strong>＋ Новая пациентка</strong>
          <span className="muted small">Тактика по сроку и ситуации, чек-лист, препараты, таймеры, отчёт</span>
        </button>
        <button className="home-tile" onClick={props.onBuilder}>
          <strong>📝 Конструктор заключений</strong>
          <span className="muted small">Диагноз с МКБ-10, план, протокол ВК (off-label), ИДС, консилиум, дневник ПРПО, перевод, эпикриз</span>
        </button>
        <button className="home-tile" onClick={props.onReference}>
          <strong>📖 Справочник</strong>
          <span className="muted small">Алгоритм, классификации, дозы, критерии качества, многоплодие, ЗРП, маловодие</span>
        </button>
      </div>
      <h2 style={{ fontSize: '1.1rem' }}>Пациентки ({props.cases.length})</h2>
      {props.cases.length === 0 && <p className="muted">Пока нет случаев. Данные хранятся только на этом устройстве.</p>}
      <div className="case-list">
        {props.cases.map((c) => {
          const ga = gestationalAge(c.patient, props.now);
          return (
            <div key={c.id} className="case-row">
              <button className="case-open" onClick={() => props.onOpen(c.id)}>
                <strong>{c.patient.fullName || 'Без имени'}</strong>
                <span className="small muted">
                  {fmtGa(ga?.days)} · {SCENARIO_LABEL[c.clinical.scenario]}
                  {c.delivery.at ? ' · родоразрешена' : ''} · изм. {fmtDateTime(c.updatedAt)}
                </span>
              </button>
              <button className="btn tiny ghost" aria-label="Удалить" onClick={() => confirm(`Удалить случай «${c.patient.fullName || 'без имени'}»?`) && props.onDelete(c.id)}>
                ✕
              </button>
            </div>
          );
        })}
      </div>
      <div className="home-tools">
        <button className="btn small" disabled={!props.cases.length} onClick={() => downloadJson(props.cases, `ПР-помощник_${new Date().toISOString().slice(0, 10)}.json`)}>
          Экспорт всех (JSON)
        </button>
        <button className="btn small" onClick={() => file.current?.click()}>
          Импорт JSON
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const data = JSON.parse(await f.text());
              const n = props.onImport(Array.isArray(data) ? data : [data]);
              alert(`Импортировано случаев: ${n}`);
            } catch {
              alert('Не удалось прочитать файл.');
            }
          }}
        />
      </div>
      <p className="disclaimer small muted">
        Средство поддержки решений и документирования. Не заменяет клиническое решение врача и инструкции к препаратам. «#» — применение вне инструкции: требуется
        заключение врачебной комиссии и письменное информированное согласие пациентки. Данные хранятся только в этом браузере.
      </p>
    </div>
  );
}
