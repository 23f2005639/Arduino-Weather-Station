import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useMultiHistory } from '../hooks/useMultiHistory';
import type { HistoryPoint, Range } from '../types';

interface Props { range: Range; }

const CHART_CONFIG = [
  { key: 'avg_temp', label: 'Temperature', unit: '°C',  color: '#58a6ff' },
  { key: 'dht_rh',  label: 'Humidity',    unit: '%',   color: '#3fb950' },
  { key: 'bmp_pres',label: 'Pressure',    unit: 'hPa', color: '#d2a8ff' },
  { key: 'hi_c',    label: 'Heat Index',  unit: '°C',  color: '#ffa657' },
] as const;

function formatTick(ts: number, range: Range): string {
  const d = new Date(ts);
  if (range === '1h' || range === '24h')
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (range === '7d')
    return d.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatTooltipLabel(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function SingleChart({
  data, label, unit, color, range,
}: {
  data: HistoryPoint[]; label: string; unit: string; color: string; range: Range;
}) {
  const gradId = `grad-${label}`;

  if (data.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="text-muted text-xs uppercase tracking-widest mb-4">{label}</div>
        <div className="flex items-center justify-center h-40 text-muted text-sm">No data</div>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="text-muted text-xs uppercase tracking-widest mb-4">{label}</div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
          <XAxis
            dataKey="bucket_ts"
            tickFormatter={ts => formatTick(ts as number, range)}
            stroke="#30363d"
            tick={{ fill: '#8b949e', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke="#30363d"
            tick={{ fill: '#8b949e', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={40}
            tickFormatter={v => `${(v as number).toFixed(1)}${unit}`}
          />
          <Tooltip
            contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#8b949e' }}
            itemStyle={{ color }}
            labelFormatter={v => formatTooltipLabel(v as number)}
            formatter={(v: number) => [`${v.toFixed(2)} ${unit}`, label]}
          />
          <Area
            type="monotone"
            dataKey="avg_val"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradId})`}
            dot={false}
            activeDot={{ r: 3, fill: color }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChartGrid({ range }: Props) {
  const { data, loading } = useMultiHistory(range);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {loading && Object.values(data).every(d => d.length === 0)
        ? Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl p-5 h-[260px] animate-pulse" />
          ))
        : CHART_CONFIG.map(c => (
            <SingleChart
              key={c.key}
              data={data[c.key]}
              label={c.label}
              unit={c.unit}
              color={c.color}
              range={range}
            />
          ))
      }
    </div>
  );
}
