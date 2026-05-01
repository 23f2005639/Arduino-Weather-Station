import { useTodayStats } from '../hooks/useTodayStats';

function fmt(v: number | null, d = 1) { return v == null ? '--' : v.toFixed(d); }

function MinMaxCell({ label, min, max, unit }: { label: string; min: number | null; max: number | null; unit: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="text-muted text-xs uppercase tracking-widest mb-2">{label} Today</div>
      <div className="flex items-baseline gap-2">
        <span className="text-primary text-xs">↓</span>
        <span className="text-[#e6edf3] font-semibold">{fmt(min)}</span>
        <span className="text-muted text-xs">{unit}</span>
        <span className="text-accent text-xs ml-2">↑</span>
        <span className="text-[#e6edf3] font-semibold">{fmt(max)}</span>
        <span className="text-muted text-xs">{unit}</span>
      </div>
    </div>
  );
}

export function TodayMinMaxRow() {
  const s = useTodayStats();

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <MinMaxCell label="Temperature" min={s?.min_temp  ?? null} max={s?.max_temp  ?? null} unit="°C" />
      <MinMaxCell label="Humidity"    min={s?.min_rh    ?? null} max={s?.max_rh    ?? null} unit="%" />
      <MinMaxCell label="Pressure"    min={s?.min_pres  ?? null} max={s?.max_pres  ?? null} unit="hPa" />
      <MinMaxCell label="Heat Index"  min={s?.min_hi    ?? null} max={s?.max_hi    ?? null} unit="°C" />
    </div>
  );
}
