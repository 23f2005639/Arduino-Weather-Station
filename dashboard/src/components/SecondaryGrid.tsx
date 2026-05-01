import type { Reading } from '../types';

interface Props { reading: Reading | null; }

function fmt(v: number | null, d = 1) { return v == null ? '--' : v.toFixed(d); }

function SmallCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4 flex flex-col gap-1">
      <div className="text-muted text-xs uppercase tracking-widest">{label}</div>
      <div className="text-2xl font-semibold text-[#e6edf3] mt-1">
        {value}
        <span className="text-sm font-normal ml-1 text-muted">{unit}</span>
      </div>
    </div>
  );
}

function comfortLabel(t: number | null, rh: number | null): string {
  if (t == null || rh == null) return '--';
  if (rh < 25) return 'Very Dry';
  if (rh < 40) return 'Dry';
  if (rh > 80) return 'Very Humid';
  if (rh > 65) return 'Humid';
  if (t < 18)  return 'Cool';
  if (t > 30)  return 'Hot';
  return 'Comfortable';
}

export function SecondaryGrid({ reading: r }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <SmallCard label="Dew Point"     value={fmt(r?.dp   ?? null)} unit="°C" />
      <SmallCard label="Abs Humidity"  value={fmt(r?.ah   ?? null, 2)} unit="g/m³" />
      <SmallCard label="Altitude"      value={fmt(r?.alt_m ?? null, 0)} unit="m" />
      <div className="bg-surface border border-border rounded-lg p-4 flex flex-col gap-1">
        <div className="text-muted text-xs uppercase tracking-widest">Comfort</div>
        <div className="text-xl font-semibold text-[#e6edf3] mt-1">
          {comfortLabel(r?.avg_temp ?? null, r?.dht_rh ?? null)}
        </div>
      </div>
    </div>
  );
}
