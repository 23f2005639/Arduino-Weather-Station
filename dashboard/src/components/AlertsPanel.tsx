import type { Reading } from '../types';

interface Props { reading: Reading | null; }

interface Alert { icon: string; title: string; detail: string; }

function getAlerts(r: Reading): Alert[] {
  const alerts: Alert[] = [];
  if (r.hi_c != null && r.hi_c > 39)
    alerts.push({ icon: '🌡', title: 'Heat Danger', detail: `Heat index ${r.hi_c.toFixed(1)} °C` });
  if (r.avg_temp != null && r.avg_temp < 0)
    alerts.push({ icon: '🧊', title: 'Freeze Alert', detail: `Temp ${r.avg_temp.toFixed(1)} °C` });
  if (r.dp != null && r.avg_temp != null && r.dp > (r.avg_temp - 2) && r.avg_temp < 6)
    alerts.push({ icon: '❄️', title: 'Frost Risk', detail: `Dew point ${r.dp.toFixed(1)} °C` });
  return alerts;
}

export function AlertsPanel({ reading }: Props) {
  if (!reading) return null;
  const alerts = getAlerts(reading);
  if (alerts.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {alerts.map(a => (
        <div
          key={a.title}
          className="flex items-center gap-3 px-4 py-3 rounded-lg border border-danger bg-danger/10 text-danger text-sm font-semibold"
        >
          <span className="text-lg">{a.icon}</span>
          <span>{a.title}</span>
          <span className="ml-auto text-xs font-normal opacity-80">{a.detail}</span>
        </div>
      ))}
    </div>
  );
}
