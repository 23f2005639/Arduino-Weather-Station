import { useEffect, useState } from 'react';
import type { TodayStats } from '../types';

export function useTodayStats() {
  const [stats, setStats] = useState<TodayStats | null>(null);

  useEffect(() => {
    const load = () =>
      fetch('/api/stats/today')
        .then(r => r.json() as Promise<TodayStats>)
        .then(setStats)
        .catch(console.error);

    load();
    // Refresh every minute
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  return stats;
}
