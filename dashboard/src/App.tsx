import { useState } from 'react';
import { useReadingStream } from './hooks/useReadingStream';
import { Header } from './components/Header';
import { AlertsPanel } from './components/AlertsPanel';
import { HeroGrid } from './components/HeroGrid';
import { SecondaryGrid } from './components/SecondaryGrid';
import { TrendStrip } from './components/TrendStrip';
import { TodayMinMaxRow } from './components/TodayMinMaxRow';
import { RangeSelector } from './components/RangeSelector';
import { ChartGrid } from './components/ChartGrid';
import type { Range } from './types';

export default function App() {
  const { latest, lastUpdate } = useReadingStream();
  const [range, setRange] = useState<Range>('24h');

  return (
    <div className="min-h-screen bg-bg text-[#e6edf3] font-mono">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <Header lastUpdate={lastUpdate} />
        <AlertsPanel reading={latest} />
        <HeroGrid reading={latest} />
        <SecondaryGrid reading={latest} />
        <TrendStrip reading={latest} />
        <TodayMinMaxRow />
        <div className="flex items-center justify-between pt-2">
          <span className="text-muted text-xs uppercase tracking-widest">Historical Charts</span>
          <RangeSelector range={range} onChange={setRange} />
        </div>
        <ChartGrid range={range} />
        <div className="text-center text-muted text-xs pb-4">
          Auto-updated via SSE · Uno R4 WiFi ·{' '}
          {lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : 'waiting for data...'}
        </div>
      </div>
    </div>
  );
}
