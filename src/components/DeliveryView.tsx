import type { Case, Delivery } from '../protocol/types';
import { updateDelivery } from '../state/actions';
import { recommendations } from '../protocol/rules';
import { Card, NumField, Select, TextField, TimeField, Toggle } from './ui';
import { RecList } from './TacticsView';
import type { Act } from './forms';

export function DeliveryView({ c, act, now }: { c: Case; act: Act; now: Date }) {
  const d = c.delivery;
  const up = (patch: Partial<Delivery>) => act((x, t) => updateDelivery(x, patch, t));
  const recs = recommendations(c, now).filter((r) => r.category === 'delivery' || r.category === 'newborn');
  return (
    <div className="stack">
      {recs.length > 0 && (
        <Card title="Родоразрешение по КР">
          <RecList recs={recs} c={c} act={act} />
        </Card>
      )}
      <Card title="Роды">
        {!d.at && (
          <button className="btn primary big" onClick={() => act((x, t) => updateDelivery(x, { at: t }, t))}>
            👶 Отметить рождение сейчас
          </button>
        )}
        <div className="grid-fields" style={{ marginTop: 10 }}>
          <TimeField label="Дата и время рождения" value={d.at} onChange={(v) => up({ at: v })} />
          <Select
            label="Способ"
            value={d.mode}
            placeholder="—"
            onChange={(v) => up({ mode: v || undefined })}
            options={[
              { value: 'vaginal', label: 'естественные родовые пути' },
              { value: 'breech-vaginal', label: 'влагалищные роды в тазовом предлежании' },
              { value: 'forceps', label: 'акушерские щипцы' },
              { value: 'cs', label: 'кесарево сечение' },
            ]}
          />
          <Select
            label="Анестезия / аналгезия"
            value={d.anesthesia}
            placeholder="—"
            onChange={(v) => up({ anesthesia: v || undefined })}
            options={[
              { value: 'neuraxial', label: 'нейроаксиальная' },
              { value: 'general', label: 'общая' },
              { value: 'none', label: 'нет' },
            ]}
          />
          <NumField label="Пережатие пуповины через" unit="с" value={d.cordClampingSec} onChange={(v) => up({ cordClampingSec: v })} warn={d.cordClampingSec !== undefined && (d.cordClampingSec < 60 || d.cordClampingSec > 180)} />
          <NumField label="Масса новорождённого" unit="г" value={d.weightG} onChange={(v) => up({ weightG: v })} />
          <NumField label="Апгар 1 мин" value={d.apgar1} onChange={(v) => up({ apgar1: v })} />
          <NumField label="Апгар 5 мин" value={d.apgar5} onChange={(v) => up({ apgar5: v })} />
        </div>
        <div className="flags" style={{ marginTop: 8 }}>
          <Toggle label="Неонатолог присутствовал" checked={!!d.neonatologist} onChange={(v) => up({ neonatologist: v })} />
          <Toggle label="Извлечение в плодных оболочках" checked={!!d.enCaul} onChange={(v) => up({ enCaul: v })} />
          <Toggle label="Полиэтиленовый пакет + лучистое тепло" checked={!!d.thermalBag} onChange={(v) => up({ thermalBag: v })} />
          <Toggle label="«Доение» пуповины (исключительный случай)" checked={!!d.milking} onChange={(v) => up({ milking: v })} />
        </div>
        <div className="grid-fields" style={{ marginTop: 8 }}>
          <TextField label="Примечание" value={d.note} onChange={(v) => up({ note: v })} wide />
        </div>
        <p className="small muted">Отсроченное пережатие: ≥ 60 с, не более 3 мин, при пульсации пуповины &gt; 100/мин; ребёнок на уровне или ниже плаценты (КР 3.4; УУР B, УДД 2).</p>
      </Card>
    </div>
  );
}
