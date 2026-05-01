import express, { Request, Response } from 'express';
import cors from 'cors';
import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../weather.db');

// ── Database ──────────────────────────────────────────────────────────────────

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = NORMAL');
db.exec('PRAGMA temp_store = MEMORY');

db.exec(`
  CREATE TABLE IF NOT EXISTS readings (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id     TEXT    NOT NULL,
    received_at   INTEGER NOT NULL,
    uptime_ms     INTEGER,
    dht_temp      REAL,
    dht_rh        REAL,
    bmp_temp      REAL,
    bmp_pres      REAL,
    alt_m         REAL,
    avg_temp      REAL,
    hi_c          REAL,
    dp            REAL,
    ah            REAL,
    min_t         REAL,
    max_t         REAL,
    min_h         REAL,
    max_h         REAL,
    min_p         REAL,
    max_p         REAL,
    trend_label   TEXT,
    trend_arrow   TEXT,
    press_delta_3h REAL
  );
  CREATE INDEX IF NOT EXISTS idx_received_at ON readings(received_at);
  CREATE INDEX IF NOT EXISTS idx_device_id   ON readings(device_id);
`);

// ── Middleware ─────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// ── SSE clients ────────────────────────────────────────────────────────────────

const sseClients = new Set<Response>();

// ── Helpers ───────────────────────────────────────────────────────────────────

type SQLValue = null | number | bigint | string;

// Coerce unknown body field to a SQLite-compatible scalar
function sv(v: unknown): SQLValue {
  if (v == null) return null;
  if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'string') return v;
  return null;
}

// ── Prepared statements ────────────────────────────────────────────────────────

const insertReading = db.prepare(`
  INSERT INTO readings (
    device_id, received_at, uptime_ms,
    dht_temp, dht_rh, bmp_temp, bmp_pres, alt_m,
    avg_temp, hi_c, dp, ah,
    min_t, max_t, min_h, max_h, min_p, max_p,
    trend_label, trend_arrow, press_delta_3h
  ) VALUES (
    @device_id, @received_at, @uptime_ms,
    @dht_temp, @dht_rh, @bmp_temp, @bmp_pres, @alt_m,
    @avg_temp, @hi_c, @dp, @ah,
    @min_t, @max_t, @min_h, @max_h, @min_p, @max_p,
    @trend_label, @trend_arrow, @press_delta_3h
  )
`);

// ── Routes ─────────────────────────────────────────────────────────────────────

// POST /api/ingest — called by Arduino every 10 s
app.post('/api/ingest', (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const now = Date.now();

  const params: Record<string, SQLValue> = {
    device_id:      typeof b.device_id === 'string' ? b.device_id : 'unknown',
    received_at:    now,
    uptime_ms:      sv(b.uptime_ms),
    dht_temp:       sv(b.dht_temp),
    dht_rh:         sv(b.dht_rh),
    bmp_temp:       sv(b.bmp_temp),
    bmp_pres:       sv(b.bmp_pres),
    alt_m:          sv(b.alt_m),
    avg_temp:       sv(b.avg_temp),
    hi_c:           sv(b.hi_c),
    dp:             sv(b.dp),
    ah:             sv(b.ah),
    min_t:          sv(b.min_t),
    max_t:          sv(b.max_t),
    min_h:          sv(b.min_h),
    max_h:          sv(b.max_h),
    min_p:          sv(b.min_p),
    max_p:          sv(b.max_p),
    trend_label:    sv(b.trend_label),
    trend_arrow:    sv(b.trend_arrow),
    press_delta_3h: sv(b.press_delta_3h),
  };
  insertReading.run(params);

  // Push to all SSE subscribers
  const payload = `data: ${JSON.stringify({ ...b, received_at: now })}\n\n`;
  for (const client of sseClients) client.write(payload);

  res.json({ ok: true, received_at: now });
});

// GET /api/current — most recent reading
app.get('/api/current', (_req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM readings ORDER BY received_at DESC LIMIT 1').get();
  res.json(row ?? null);
});

// GET /api/history?metric=avg_temp&range=24h
const ALLOWED_METRICS = new Set([
  'dht_temp','dht_rh','bmp_temp','bmp_pres','alt_m',
  'avg_temp','hi_c','dp','ah',
]);

const RANGE_MS: Record<string, number> = {
  '1h':  3_600_000,
  '24h': 86_400_000,
  '7d':  7  * 86_400_000,
  '30d': 30 * 86_400_000,
};

const RANGE_BUCKET_SEC: Record<string, number> = {
  '1h': 30, '24h': 300, '7d': 1800, '30d': 7200,
};

app.get('/api/history', (req: Request, res: Response) => {
  const metric = String(req.query.metric ?? 'avg_temp');
  const range  = String(req.query.range  ?? '24h');

  if (!ALLOWED_METRICS.has(metric)) {
    res.status(400).json({ error: 'invalid metric' }); return;
  }

  const now = Date.now();
  let sinceMs: number;
  let bucketSec: number;

  if (range === 'all') {
    sinceMs = 0;
    const oldest = db.prepare('SELECT MIN(received_at) AS m FROM readings').get() as { m: number | null };
    if (!oldest?.m) { res.json([]); return; }
    bucketSec = Math.max(10, Math.ceil((now - oldest.m) / 1000 / 400));
  } else if (RANGE_MS[range] !== undefined) {
    sinceMs   = now - RANGE_MS[range];
    bucketSec = RANGE_BUCKET_SEC[range];
  } else {
    res.status(400).json({ error: 'invalid range' }); return;
  }

  const bucketMs = bucketSec * 1000;
  // metric is validated against ALLOWED_METRICS — safe to interpolate as column name
  const rows = db.prepare(`
    SELECT
      (received_at / ${bucketMs}) * ${bucketMs} AS bucket_ts,
      AVG(${metric}) AS avg_val,
      MIN(${metric}) AS min_val,
      MAX(${metric}) AS max_val,
      COUNT(*)        AS count
    FROM readings
    WHERE received_at >= ${sinceMs} AND ${metric} IS NOT NULL
    GROUP BY bucket_ts
    ORDER BY bucket_ts ASC
  `).all();

  res.json(rows);
});

// GET /api/stats/today
app.get('/api/stats/today', (_req: Request, res: Response) => {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  const row = db.prepare(`
    SELECT
      MIN(avg_temp) AS min_temp, MAX(avg_temp) AS max_temp,
      MIN(dht_rh)   AS min_rh,   MAX(dht_rh)   AS max_rh,
      MIN(bmp_pres) AS min_pres, MAX(bmp_pres) AS max_pres,
      MIN(hi_c)     AS min_hi,   MAX(hi_c)     AS max_hi,
      COUNT(*)      AS reading_count
    FROM readings
    WHERE received_at >= ${midnight.getTime()}
  `).get();

  res.json(row ?? null);
});

// GET /api/trend
app.get('/api/trend', (_req: Request, res: Response) => {
  const row = db.prepare(
    'SELECT trend_label, trend_arrow, press_delta_3h FROM readings ORDER BY received_at DESC LIMIT 1'
  ).get();
  res.json(row ?? { trend_label: 'Collecting...', trend_arrow: '', press_delta_3h: null });
});

// GET /api/stream — SSE live feed
app.get('/api/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send last reading immediately on connect
  const last = db.prepare('SELECT * FROM readings ORDER BY received_at DESC LIMIT 1').get();
  if (last) res.write(`data: ${JSON.stringify(last)}\n\n`);

  // Heartbeat to survive proxy idle timeouts
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 30_000);

  sseClients.add(res);
  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// GET /api/health
app.get('/api/health', (_req: Request, res: Response) => {
  const { n }  = db.prepare('SELECT COUNT(*) AS n FROM readings').get() as { n: number };
  const last   = db.prepare(
    'SELECT received_at FROM readings ORDER BY received_at DESC LIMIT 1'
  ).get() as { received_at: number } | undefined;

  res.json({
    ok: true,
    reading_count:    n,
    last_received_at: last?.received_at ?? null,
    sse_clients:      sseClients.size,
  });
});

// ── Retention: delete rows older than 90 days (hourly) ───────────────────────

const NINETY_DAYS_MS = 90 * 24 * 3_600_000;
setInterval(() => {
  const cutoff = Date.now() - NINETY_DAYS_MS;
  const result = db.prepare('DELETE FROM readings WHERE received_at < ?').run(cutoff);
  if ((result as { changes: number }).changes > 0)
    console.log(`[retention] deleted ${(result as { changes: number }).changes} old rows`);
}, 3_600_000);

// ── Start ──────────────────────────────────────────────────────────────────────

app.listen(PORT, () => console.log(`Weather station server → http://localhost:${PORT}`));
