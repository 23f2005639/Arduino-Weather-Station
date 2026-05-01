import { LiveIndicator } from './LiveIndicator';

interface Props { lastUpdate: number; }

export function Header({ lastUpdate }: Props) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-4">
      <div>
        <h1 className="text-primary text-xl font-bold tracking-tight">
          ⛅ Weather Station
        </h1>
        <p className="text-muted text-xs mt-0.5">Arduino Uno R4 WiFi</p>
      </div>
      <LiveIndicator lastUpdate={lastUpdate} />
    </div>
  );
}
