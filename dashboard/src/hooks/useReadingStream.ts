import { useEffect, useRef, useState } from 'react';
import type { Reading } from '../types';

export function useReadingStream() {
  const [latest, setLatest] = useState<Reading | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number>(0);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    function connect() {
      const es = new EventSource('/api/stream');
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          setLatest(JSON.parse(e.data as string) as Reading);
          setLastUpdate(Date.now());
        } catch { /* ignore malformed frames */ }
      };

      es.onerror = () => {
        es.close();
        // Reconnect after 5 s on error
        setTimeout(connect, 5_000);
      };
    }

    connect();
    return () => esRef.current?.close();
  }, []);

  return { latest, lastUpdate };
}
