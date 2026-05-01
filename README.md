# Arduino Weather Station

A full-stack environmental monitoring system built on the **Arduino Uno R4 WiFi**.

Sensors: DHT22 (temperature + humidity) and BMP280 (barometric pressure + altitude).  
Display: SH1106 128×64 OLED — six rotating screens, auto-scaling graph, blinking alerts.  
Backend: Node.js + Express + SQLite — receives sensor POSTs, stores 90 days of history.  
Dashboard: React + Vite + Recharts — live SSE updates, historical charts, today's min/max.

---

## Repository layout

```
DHT22_OLED.ino        Arduino sketch (open in Arduino IDE)
secrets.h.example     Template — copy to secrets.h and fill in your values
secrets.h             NOT committed (gitignored) — your WiFi credentials live here

server/               Node.js/Express backend
  src/index.ts        All routes: /api/ingest, /api/current, /api/history, SSE stream
  package.json

dashboard/            React + Vite frontend
  src/                Components, hooks, types
  vite.config.ts      Dev proxy → localhost:3001
  package.json
```

---

## Hardware

| Component | Notes |
|---|---|
| Arduino Uno R4 WiFi | Required — uses built-in WiFiS3 |
| DHT22 | Temperature + humidity |
| BMP280 | Barometric pressure, temperature, altitude |
| SH1106 128×64 OLED | I2C |
| 10 kΩ resistor | Optional pull-up on DHT22 data line |

### Wiring

**DHT22**

| Pin | Connect to |
|---|---|
| 1 (VCC) | 5V |
| 2 (DATA) | D2 |
| 3 (NC) | — |
| 4 (GND) | GND |

**BMP280**

| Pin | Connect to | Note |
|---|---|---|
| VCC | 3.3V | Not 5V |
| GND | GND | |
| SDA | A4 | Shared I2C bus |
| SCL | A5 | Shared I2C bus |
| SDO | GND | Sets address to 0x76 |
| CSB | 3.3V | Forces I2C mode |

**SH1106 OLED**

| Pin | Connect to |
|---|---|
| VCC | 3.3V or 5V |
| GND | GND |
| SDA | A4 |
| SCL | A5 |

BMP280 and OLED share the I2C bus — they have different addresses (0x76 and 0x3C).

---

## Quick start

### 1 — Arduino libraries

Install via Sketch → Include Library → Manage Libraries:

- DHT sensor library *(Adafruit)*
- Adafruit Unified Sensor *(Adafruit)*
- Adafruit BMP280 Library *(Adafruit)*
- U8g2 *(oliver)*

WiFiS3 is included in the board package — no separate install needed.

### 2 — Board setup

Tools → Board → Boards Manager → search **Arduino UNO R4** → install.  
Then select **Tools → Board → Arduino UNO R4 WiFi**.

### 3 — WiFi + backend credentials

```bash
cp secrets.h.example secrets.h
```

Edit `secrets.h`:

```cpp
const char WIFI_SSID[]    = "YourNetwork";
const char WIFI_PASS[]    = "YourPassword";
const char BACKEND_HOST[] = "192.168.x.x";   // LAN IP of the machine running the server
const int  BACKEND_PORT   = 3001;
const char INGEST_PATH[]  = "/api/ingest";
```

Find your machine's LAN IP:
- Linux/Mac: `ip addr` or `ifconfig`
- Windows: `ipconfig`

### 4 — Start the backend server

Requires **Node.js 22+** (uses the built-in `node:sqlite` module).

```bash
cd server
npm install
npm run dev
# → Weather station server → http://localhost:3001
```

### 5 — Start the dashboard

```bash
cd dashboard
npm install
npm run dev
# → http://localhost:5173
```

### 6 — Upload the sketch

Open `DHT22_OLED.ino` in Arduino IDE, select the correct port under Tools → Port, then click Upload.

The OLED will show the Arduino's IP address. Open it in a browser for the on-device dashboard. The React dashboard at `localhost:5173` receives live data automatically.

---

## OLED screens (rotate every 4 s)

| # | Screen | Content |
|---|---|---|
| 0 | Environment | Temperature (°C + °F), Humidity, Pressure |
| 1 | Calculated | Heat Index, Dew Point, Abs Humidity, Comfort |
| 2 | Min / Max | Session min/max for temp, humidity, pressure + uptime |
| 3 | Weather Trend | Pressure now, 3-hour delta, trend label |
| 4 | Sensors | DHT22 vs BMP280 individual readings + altitude |
| 5 | Graph | Auto-scaled temperature line graph (last 30 min) |

## Alerts

Full-screen blinking alert interrupts rotation for 3 s:

| Alert | Condition |
|---|---|
| HEAT DANGER | Heat Index > 39 °C |
| FREEZE ALERT | Temperature < 0 °C |
| FROST RISK | Dew point within 2 °C of temperature and temp < 6 °C |

---

## API endpoints

The server runs on port 3001.

| Method | Path | Description |
|---|---|---|
| POST | `/api/ingest` | Arduino POSTs sensor data every 10 s |
| GET | `/api/current` | Most recent reading |
| GET | `/api/history?metric=avg_temp&range=24h` | Time-bucketed history (1h / 24h / 7d / 30d / all) |
| GET | `/api/stats/today` | Today's min/max for temp, humidity, pressure, heat index |
| GET | `/api/trend` | Latest pressure trend label and arrow |
| GET | `/api/stream` | SSE live feed (used by the React dashboard) |
| GET | `/api/health` | Reading count, last received timestamp, SSE client count |

Available metrics for `/api/history`: `dht_temp`, `dht_rh`, `bmp_temp`, `bmp_pres`, `alt_m`, `avg_temp`, `hi_c`, `dp`, `ah`.

---

## Data retention

The server automatically deletes readings older than 90 days (checked hourly). The SQLite database file is stored at `weather.db` in the `weather-station/` working directory and is gitignored.

---

## Serial output

One line per sensor read, compatible with the Arduino Serial Plotter:

```
Avg_C:27.3 RH%:58.0 hPa:1008.4 HI:28.1 DP:18.6 Alt_m:41.2
```

---

## Tech stack

| Layer | Tech |
|---|---|
| Firmware | Arduino C++ / WiFiS3 / DHT / U8g2 / Adafruit BMP280 |
| Backend | Node.js 22+ · Express · node:sqlite (built-in, no native build needed) |
| Frontend | React 18 · Vite · Tailwind CSS · Recharts · SSE |

---

## License

MIT — use, modify, and distribute freely.
