import type { Reading } from '../types';

interface Props { reading: Reading | null; }

function fmt(v: number | null, d = 1) { return v == null ? '--' : v.toFixed(d); }

function BigCard({ label, value, unit, sub, danger }: {
  label: string; value: string; unit: string; sub?: string; danger?: boolean;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5 flex flex-col gap-1">
      <div className="text-muted text-xs uppercase tracking-widest">{label}</div>
      <div className={`text-4xl font-bold mt-1 ${danger ? 'text-danger' : 'text-primary'}`}>
        {value}
        <span className="text-base font-normal ml-1 text-muted">{unit}</span>
      </div>
      {sub && <div className="text-muted text-sm">{sub}</div>}
    </div>
  );
}

export function HeroGrid({ reading: r }: Props) {
  const tempF = r?.avg_temp != null ? (r.avg_temp * 9 / 5 + 32).toFixed(1) + ' °F' : '';
  const danger = r?.hi_c != null && r.hi_c > 39;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <BigCard label="Temperature" value={fmt(r?.avg_temp ?? null)} unit="°C" sub={tempF} />
      <BigCard label="Humidity"    value={fmt(r?.dht_rh   ?? null)} unit="%" />
      <BigCard label="Pressure"    value={fmt(r?.bmp_pres  ?? null)} unit="hPa"
               sub={r?.trend_arrow ? `${r.trend_arrow} ${r.trend_label ?? ''}` : undefined} />
      <BigCard label="Heat Index"  value={fmt(r?.hi_c      ?? null)} unit="°C"
               sub={danger ? '⚠ Danger' : undefined} danger={danger} />
    </div>
  );
}
