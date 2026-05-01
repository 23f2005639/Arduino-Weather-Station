import { useEffect, useState } from 'react';
import type { HistoryPoint, Range } from '../types';

const METRICS = ['avg_temp', 'dht_rh', 'bmp_pres', 'hi_c'] as const;

export type MultiHistory = Record<typeof METRICS[number], HistoryPoint[]>;

export function useMultiHistory(range: Range) {
  const [data, setData] = useState<MultiHistory>({ avg_temp: [], dht_rh: [], bmp_pres: [], hi_c: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all(
      METRICS.map(m =>
        fetch(`/api/history?metric=${m}&range=${range}`)
          .then(r => r.json() as Promise<HistoryPoint[]>)
          .then(d => [m, d] as const)
      )
    )
      .then(results => {
        if (!cancelled) setData(Object.fromEntries(results) as MultiHistory);
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [range]);

  return { data, loading };
}
