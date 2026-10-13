import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCases } from './state/store';
import type { Case } from './protocol/types';
import { newCase, normalizeCase } from './protocol/case';
import { computeAlerts } from './protocol/alerts';
import { useNow } from './components/ui';
import { Home } from './components/Home';
import { CaseHeader } from './components/CaseHeader';
import { TacticsView } from './components/TacticsView';
import { DataView } from './components/DataView';
import { ChecklistView } from './components/ChecklistView';
import { MedsView } from './components/MedsView';
import { ObsView } from './components/ObsView';
import { DeliveryView } from './components/DeliveryView';
import { BuilderView } from './components/BuilderView';
import { ReportView } from './components/ReportView';
import { ReferenceView } from './components/ReferenceView';
import type { Act } from './components/forms';

type Tab = 'tactics' | 'data' | 'checklist' | 'meds' | 'obs' | 'delivery' | 'builder' | 'report';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'tactics', label: 'Тактика', icon: '🧭' },
  { id: 'data', label: 'Данные', icon: '👤' },
  { id: 'checklist', label: 'Чек-лист', icon: '☑' },
  { id: 'meds', label: 'Препараты', icon: '💉' },
  { id: 'obs', label: 'Наблюдение', icon: '📈' },
  { id: 'delivery', label: 'Роды', icon: '👶' },
  { id: 'builder', label: 'Заключение', icon: '📝' },
  { id: 'report', label: 'Отчёт', icon: '📄' },
];

type Route = { page: 'home' } | { page: 'builder' } | { page: 'ref' } | { page: 'case'; id: string; tab: Tab };

function readHash(): Route {
  const [a, b] = window.location.hash.replace(/^#\/?/, '').split('/');
  if (!a) return { page: 'home' };
  if (a === 'builder') return { page: 'builder' };
  if (a === 'ref') return { page: 'ref' };
  return { page: 'case', id: a, tab: (TABS.some((t) => t.id === b) ? b : 'tactics') as Tab };
}

const DRAFT_KEY = 'pr-pomoshnik.builder.draft';

function loadDraft(): Case {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return normalizeCase(JSON.parse(raw));
  } catch {
    /* новый черновик */
  }
  return newCase();
}

export default function App() {
  const { cases, create, insert, update, remove, importCases, saveError } = useCases();
  const [route, setRoute] = useState<Route>(readHash);
  const now = useNow(1000);
  const [draft, setDraft] = useState<Case>(loadDraft);

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* черновик живёт до перезагрузки */
    }
  }, [draft]);

  const nav = useCallback((hash: string) => {
    window.location.hash = hash;
    setRoute(readHash());
    window.scrollTo(0, 0);
  }, []);

  const current = route.page === 'case' ? cases.find((c) => c.id === route.id) : undefined;
  const act: Act = useCallback(
    (fn) => {
      if (current) update(current.id, (c) => fn(c, new Date().toISOString()));
    },
    [current, update],
  );
  const draftAct: Act = useCallback((fn) => setDraft((c) => fn(c, new Date().toISOString())), []);
  const alerts = useMemo(() => (current ? computeAlerts(current, now) : []), [current, now]);

  const banner = saveError && <div className="alert alert-danger">Не удаётся сохранить данные в памяти браузера — выгрузите отчёт/JSON!</div>;

  if (route.page === 'builder' || route.page === 'ref') {
    return (
      <main className="app">
        {banner}
        <div className="page-head no-print">
          <button className="btn ghost back" onClick={() => nav('')} aria-label="На главную">
            ‹
          </button>
          <h2>{route.page === 'builder' ? 'Конструктор заключений' : 'Справочник'}</h2>
        </div>
        {route.page === 'builder' ? (
          <BuilderView
            c={draft}
            act={draftAct}
            now={now}
            standalone
            onReset={() => setDraft(newCase())}
            onSaveAsCase={() => {
              const id = insert({ ...draft, id: newCase().id });
              setDraft(newCase());
              nav(`/${id}/builder`);
            }}
          />
        ) : (
          <ReferenceView />
        )}
      </main>
    );
  }

  if (!current) {
    return (
      <main className="app">
        {banner}
        <Home
          cases={cases}
          now={now}
          onOpen={(id) => nav(`/${id}/tactics`)}
          onCreate={() => nav(`/${create()}/tactics`)}
          onDelete={remove}
          onImport={importCases}
          onBuilder={() => nav('/builder')}
          onReference={() => nav('/ref')}
        />
      </main>
    );
  }

  const tab = route.page === 'case' ? route.tab : 'tactics';
  return (
    <main className="app with-case">
      {banner}
      <div className="sticky-top no-print">
        <CaseHeader c={current} now={now} alerts={alerts} onBack={() => nav('')} />
      </div>
      <div className="content">
        {tab === 'tactics' && <TacticsView c={current} act={act} now={now} alerts={alerts} />}
        {tab === 'data' && <DataView c={current} act={act} now={now} />}
        {tab === 'checklist' && <ChecklistView c={current} act={act} now={now} />}
        {tab === 'meds' && <MedsView c={current} act={act} now={now} alerts={alerts} />}
        {tab === 'obs' && <ObsView c={current} act={act} />}
        {tab === 'delivery' && <DeliveryView c={current} act={act} now={now} />}
        {tab === 'builder' && <BuilderView c={current} act={act} now={now} />}
        {tab === 'report' && <ReportView c={current} act={act} now={now} />}
      </div>
      <nav className="tabbar no-print" aria-label="Разделы" style={{ ['--tabs' as string]: TABS.length }}>
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => nav(`/${current.id}/${t.id}`)} aria-label={t.label} aria-current={tab === t.id ? 'page' : undefined}>
            <span className="ti" aria-hidden>
              {t.icon}
            </span>
            <span className="tl">{t.label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
