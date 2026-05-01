import type { Range } from '../types';

interface Props { range: Range; onChange: (r: Range) => void; }

const OPTIONS: { value: Range; label: string }[] = [
  { value: '1h',  label: '1H'  },
  { value: '24h', label: '24H' },
  { value: '7d',  label: '7D'  },
  { value: '30d', label: '30D' },
  { value: 'all', label: 'ALL' },
];

export function RangeSelector({ range, onChange }: Props) {
  return (
    <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1 w-fit">
      {OPTIONS.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-4 py-1.5 rounded text-sm font-semibold transition-colors ${
            range === o.value
              ? 'bg-primary text-bg'
              : 'text-muted hover:text-[#e6edf3]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
