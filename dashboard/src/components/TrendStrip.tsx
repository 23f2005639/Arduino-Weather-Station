import type { Reading } from '../types';

interface Props { reading: Reading | null; }

const TREND_COLOR: Record<string, string> = {
  'Fair / Sunny': '#3fb950',
  'Clearing':     '#3fb950',
  'Improving':    '#58a6ff',
  'Stable':       '#8b949e',
  'Deteriorating':'#d29922',
  'Rain likely':  '#ffa657',
  'Storm warning!':'#f85149',
};

export function TrendStrip({ reading: r }: Props) {
  const label = r?.trend_label ?? 'Collecting...';
  const arrow = r?.trend_arrow ?? '';
  const delta = r?.press_delta_3h;
  const color = TREND_COLOR[label] ?? '#8b949e';

  return (
    <div className="bg-surface border border-border rounded-lg px-5 py-3 flex items-center gap-4">
      <span className="text-muted text-xs uppercase tracking-widest">3h Trend</span>
      <span className="text-lg font-bold" style={{ color }}>{arrow}</span>
      <span className="font-semibold" style={{ color }}>{label}</span>
      {delta != null && (
        <span className="ml-auto text-muted text-sm">
          {delta >= 0 ? '+' : ''}{delta.toFixed(1)} hPa
        </span>
      )}
    </div>
  );
}
