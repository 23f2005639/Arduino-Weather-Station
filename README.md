# Arduino Weather Station

A self-contained environmental monitoring station built on the Arduino Uno R4 WiFi. It reads temperature and humidity from a DHT22 sensor and barometric pressure from a BMP280, displays data on a SH1106 OLED across six rotating screens, and serves a live web dashboard accessible from any browser on the local network.

---

## Features

- Six rotating OLED screens, switching every 4 seconds without blocking the CPU
- Live web dashboard served directly from the Arduino, auto-refreshing every 10 seconds
- Derived calculations: heat index, dew point, absolute humidity, comfort level
- 3-hour weather trend prediction based on a rolling pressure history
- 30-minute scrolling temperature graph with auto-scaling
- Session min/max tracking for temperature, humidity, and pressure
- Full-screen blinking alerts for heat danger, freeze, and frost risk
- Dual-sensor temperature averaging (DHT22 + BMP280) for better accuracy
- Works offline (OLED only) if WiFi connection fails

---

## Hardware

| Component | Notes |
|---|---|
| Arduino Uno R4 WiFi | Required — uses built-in WiFiS3 and ESP32-S3 co-processor |
| DHT22 | Temperature and humidity sensor |
| BMP280 | Barometric pressure, temperature, altitude |
| SH1106 128x64 OLED | I2C interface |
| 10k ohm resistor | Optional pull-up for DHT22 data line |

---

## Wiring

### DHT22

| DHT22 Pin | Connect to |
|---|---|
| Pin 1 (VCC) | 5V |
| Pin 2 (DATA) | D2 (add 10k pull-up to 5V if signal is unstable) |
| Pin 3 (NC) | Leave unconnected |
| Pin 4 (GND) | GND |

### BMP280

| BMP280 Pin | Connect to | Notes |
|---|---|---|
| VCC | 3.3V | Do not connect to 5V |
| GND | GND | |
| SDA | A4 | Shared I2C bus |
| SCL | A5 | Shared I2C bus |
| SDO | GND | Sets I2C address to 0x76 |
| CSB | 3.3V | Forces I2C mode |

### SH1106 OLED

| OLED Pin | Connect to |
|---|---|
| VCC | 3.3V or 5V |
| GND | GND |
| SDA | A4 |
| SCL | A5 |

The BMP280 and SH1106 share the same I2C bus (A4/A5). This works because they have different addresses (0x76 and 0x3C respectively).

---

## Libraries

Install all of the following through the Arduino IDE Library Manager (Sketch > Include Library > Manage Libraries):

- **DHT sensor library** by Adafruit
- **Adafruit Unified Sensor** by Adafruit
- **Adafruit BMP280 Library** by Adafruit
- **U8g2** by oliver

**WiFiS3** does not need to be installed separately. It is included in the Arduino Uno R4 board package.

---

## Board Setup

1. Open Arduino IDE
2. Go to Tools > Board > Boards Manager
3. Search for **Arduino UNO R4** and install the package by Arduino
4. Select **Tools > Board > Arduino UNO R4 WiFi**

---

## Configuration

Open `DHT22_OLED.ino` and update the following at the top of the file:

```cpp
const char WIFI_SSID[] = "YOUR_SSID";
const char WIFI_PASS[] = "YOUR_PASSWORD";
```

If you need accurate altitude readings, also update the sea-level pressure constant to match your local value:

```cpp
#define SEA_LEVEL_HPA  1013.25f
```

You can find your local sea-level pressure from any weather website. The default (1013.25 hPa) gives approximate results but may be off by several metres.

---

## OLED Screens

The display cycles through six screens, 4 seconds each:

| Screen | Content |
|---|---|
| 0 - Environment | Temperature (C and F), Humidity, Pressure |
| 1 - Calculated | Heat Index, Dew Point, Absolute Humidity, Comfort level |
| 2 - Min/Max | Session minimum and maximum for temp, humidity, pressure + uptime |
| 3 - Weather Trend | Current pressure, 3-hour delta, and trend label |
| 4 - Sensors | DHT22 vs BMP280 individual readings + calculated average + altitude |
| 5 - Graph | Auto-scaled line graph of temperature over the last 30 minutes |

---

## Alerts

When a condition is detected, the normal screen rotation is interrupted for 3 seconds and a blinking full-screen warning is shown:

| Alert | Condition |
|---|---|
| HEAT DANGER | Heat Index exceeds 39°C |
| FREEZE ALERT | Temperature drops below 0°C |
| FROST RISK | Dew point is within 2°C of temperature and temperature is below 6°C |

---

## Web Dashboard

Once connected, the Arduino prints its IP address to the Serial monitor and displays it on the OLED. Open that address in any browser on the same network.

The dashboard shows:
- Live readings: temperature, humidity, pressure, heat index, dew point, absolute humidity, altitude, comfort
- Weather trend and 3-hour pressure delta
- Session min/max ranges for temperature, humidity, and pressure
- Side-by-side comparison of DHT22 and BMP280 temperature readings

The page auto-refreshes every 10 seconds. If WiFi is unavailable at startup, the station continues running with OLED output only.

---

## Serial Output

The sketch outputs one line per sensor read, compatible with the Arduino Serial Plotter:

```
Avg_C:27.3 RH%:58.0 hPa:1008.4 HI:28.1 DP:18.6 Alt_m:41.2
```

---

## Memory Usage

All buffers are statically allocated. There is no dynamic memory allocation (`String`, `malloc`, etc.), so memory usage is constant and does not grow over time. The circular buffers overwrite old data once full:

- Pressure history: 90 samples × 2 minutes = 3 hours
- Temperature graph: 60 samples × 30 seconds = 30 minutes

Total RAM usage is well within the 32KB available on the Uno R4.

## Sketch of the connections

```cpp
/*
	DHT22 + BMP280 + SH1106 OLED + WiFi dashboard
	Board: Arduino Uno R4 WiFi

	Wiring:
		DHT22 pin1 (VCC)  -> 5V
		DHT22 pin2 (DATA) -> D2  (10k pull-up optional)
		DHT22 pin3 (NC)   -> leave unconnected
		DHT22 pin4 (GND)  -> GND

		BMP280 VCC -> 3.3V  (NOT 5V)
		BMP280 GND -> GND
		BMP280 SDA -> A4
		BMP280 SCL -> A5
		BMP280 SDO -> GND   (sets I2C address to 0x76)
		BMP280 CSB -> 3.3V  (forces I2C mode)

		SH1106 VCC -> 3.3V or 5V
		SH1106 GND -> GND
		SH1106 SDA -> A4
		SH1106 SCL -> A5

	Libraries to install via Library Manager:
		DHT sensor library  (Adafruit)
		Adafruit Unified Sensor (Adafruit)
		Adafruit BMP280 Library (Adafruit)
		U8g2 (oliver)
		WiFiS3 is built into the Uno R4 board package, no install needed.

	OLED screens (rotate every 4s):
		0 - Temperature, Humidity, Pressure
		1 - Heat Index, Dew Point, Abs Humidity, Comfort
		2 - Session Min/Max + Uptime
		3 - Weather Trend (3h pressure history)
		4 - DHT22 vs BMP280 + Altitude
		5 - Temperature graph (last 30 min)

	Alerts (interrupt screen rotation for 3s):
		Heat danger  - Heat Index > 39C
		Frost risk   - Dew point within 2C of temp and temp < 6C
		Freeze       - Temperature < 0C

	Web dashboard: http://<IP shown on OLED at startup>
	Auto-refreshes every 10s.
*/
```

---

## License

MIT License. Use, modify, and distribute freely.
