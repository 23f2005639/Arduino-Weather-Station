import { useEffect, useState } from 'react';

interface Props { lastUpdate: number; }

export function LiveIndicator({ lastUpdate }: Props) {
  const [age, setAge] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setAge(lastUpdate ? Math.floor((Date.now() - lastUpdate) / 1000) : 9999);
    }, 1000);
    return () => clearInterval(id);
  }, [lastUpdate]);

  const color  = age < 30 ? '#3fb950' : age < 120 ? '#d29922' : '#f85149';
  const label  = age < 30 ? 'LIVE' : age < 120 ? `${age}s ago` : 'offline';

  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
      />
      <span className="text-xs" style={{ color }}>{label}</span>
    </div>
  );
}
