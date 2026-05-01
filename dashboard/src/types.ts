export interface Reading {
  id: number;
  device_id: string;
  received_at: number;
  uptime_ms: number | null;
  dht_temp: number | null;
  dht_rh: number | null;
  bmp_temp: number | null;
  bmp_pres: number | null;
  alt_m: number | null;
  avg_temp: number | null;
  hi_c: number | null;
  dp: number | null;
  ah: number | null;
  min_t: number | null;
  max_t: number | null;
  min_h: number | null;
  max_h: number | null;
  min_p: number | null;
  max_p: number | null;
  trend_label: string | null;
  trend_arrow: string | null;
  press_delta_3h: number | null;
}

export interface HistoryPoint {
  bucket_ts: number;
  avg_val: number;
  min_val: number;
  max_val: number;
  count: number;
}

export interface TodayStats {
  min_temp: number | null;
  max_temp: number | null;
  min_rh: number | null;
  max_rh: number | null;
  min_pres: number | null;
  max_pres: number | null;
  min_hi: number | null;
  max_hi: number | null;
  reading_count: number;
}

export type Range = '1h' | '24h' | '7d' | '30d' | 'all';
