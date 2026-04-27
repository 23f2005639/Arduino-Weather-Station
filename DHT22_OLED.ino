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

#include <DHT.h>
#include <U8g2lib.h>
#include <Wire.h>
#include <Adafruit_BMP280.h>
#include <WiFiS3.h>
#include <math.h>

// WiFi credentials — replace with your network details
const char WIFI_SSID[] = "YOUR_SSID";
const char WIFI_PASS[] = "YOUR_PASSWORD";
WiFiServer server(80);

// Hardware
#define DHT_PIN   2
#define DHT_TYPE  DHT22
DHT dht(DHT_PIN, DHT_TYPE);
Adafruit_BMP280 bmp;
U8G2_SH1106_128X64_NONAME_F_HW_I2C display(U8G2_R0, U8X8_PIN_NONE);

// Timing
#define SCREEN_COUNT   6
#define SCREEN_MS      4000UL    // 4s per screen
#define SENSOR_MS      2000UL    // read sensors every 2s
#define TREND_MS       120000UL  // pressure sample every 2 min
#define GRAPH_MS       30000UL   // temp graph sample every 30s

// Adjust for your local sea-level pressure for accurate altitude
// Indore is ~553m above sea level
#define SEA_LEVEL_HPA  1013.25f

// Sensor data, updated by readSensors()
float dhtTemp = 0, dhtRH = 0;
float bmpTemp = 0, bmpPres = 0, altM = 0;
float avgTemp = 0, hiC = 0, dp = 0, ah = 0;
bool  sensorsReady = false;

// Session min/max
float minT, maxT, minH, maxH, minP, maxP;
bool  minMaxInit = false;

// Pressure history - 90 samples * 2 min = 3 hours
#define TREND_SAMPLES 90
float   pressHist[TREND_SAMPLES];
uint8_t pressHead   = 0;
uint8_t pressFilled = 0;
const char* trendLabel = "Collecting...";
const char* trendArrow = "";

// Temp graph - 60 samples * 30s = 30 min
#define GRAPH_SAMPLES 60
float   tempGraph[GRAPH_SAMPLES];
uint8_t graphHead   = 0;
uint8_t graphFilled = 0;

// Timing state
unsigned long lastSensor = 0, lastScreen = 0, lastTrend = 0, lastGraph = 0;
uint8_t currentScreen = 0;

// Alert state
bool  alertActive = false;
unsigned long alertUntil = 0;
char  alertLine1[22], alertLine2[22];

// WiFi state
bool wifiOK = false;
char ipStr[20] = "not connected";

// --- Helpers ---

float calcDewPoint(float tC, float rh) {
  float g = log(rh / 100.0f) + (17.625f * tC) / (243.04f + tC);
  return (243.04f * g) / (17.625f - g);
}

float calcAbsHum(float tC, float rh) {
  return (6.112f * exp((17.67f * tC) / (tC + 243.5f)) * rh * 2.1674f)
         / (273.15f + tC);
}

const char* comfortStr(float tC, float rh) {
  if (rh < 25)  return "Very Dry";
  if (rh < 40)  return "Dry";
  if (rh > 80)  return "Very Humid";
  if (rh > 65)  return "Humid";
  if (tC < 18)  return "Cool";
  if (tC > 30)  return "Hot";
  return "Comfortable";
}

// --- Sensors ---

void readSensors() {
  float rh = dht.readHumidity();
  float tC = dht.readTemperature();
  if (isnan(rh) || isnan(tC)) return;  // keep last good values on bad read

  dhtRH   = rh;
  dhtTemp = tC;
  bmpTemp = bmp.readTemperature();
  bmpPres = bmp.readPressure() / 100.0f;
  altM    = bmp.readAltitude(SEA_LEVEL_HPA);
  avgTemp = (dhtTemp + bmpTemp) / 2.0f;
  hiC     = dht.computeHeatIndex(avgTemp, dhtRH, false);
  dp      = calcDewPoint(avgTemp, dhtRH);
  ah      = calcAbsHum(avgTemp, dhtRH);
  sensorsReady = true;

  // Min/max tracking
  if (!minMaxInit) {
    minT = maxT = avgTemp;
    minH = maxH = dhtRH;
    minP = maxP = bmpPres;
    minMaxInit = true;
  } else {
    if (avgTemp < minT) minT = avgTemp;  if (avgTemp > maxT) maxT = avgTemp;
    if (dhtRH   < minH) minH = dhtRH;   if (dhtRH   > maxH) maxH = dhtRH;
    if (bmpPres < minP) minP = bmpPres; if (bmpPres > maxP) maxP = bmpPres;
  }

  // Alerts
  alertActive = false;
  if (hiC > 39.0f) {
    snprintf(alertLine1, sizeof(alertLine1), "HEAT DANGER!");
    snprintf(alertLine2, sizeof(alertLine2), "HeatIdx %.1f C", hiC);
    alertActive = true;
  } else if (avgTemp < 0.0f) {
    snprintf(alertLine1, sizeof(alertLine1), "FREEZE ALERT!");
    snprintf(alertLine2, sizeof(alertLine2), "Temp %.1f C", avgTemp);
    alertActive = true;
  } else if (dp > (avgTemp - 2.0f) && avgTemp < 6.0f) {
    snprintf(alertLine1, sizeof(alertLine1), "FROST RISK!");
    snprintf(alertLine2, sizeof(alertLine2), "DewPt %.1f C", dp);
    alertActive = true;
  }
  if (alertActive) alertUntil = millis() + 3000;

  // Serial plotter friendly output
  Serial.print(F("Avg_C:")); Serial.print(avgTemp, 1);
  Serial.print(F(" RH%:"));  Serial.print(dhtRH,   1);
  Serial.print(F(" hPa:"));  Serial.print(bmpPres,  1);
  Serial.print(F(" HI:"));   Serial.print(hiC,      1);
  Serial.print(F(" DP:"));   Serial.print(dp,       1);
  Serial.print(F(" Alt_m:")); Serial.println(altM,  1);
}

void updateTrend() {
  if (pressFilled < 5) { trendLabel = "Collecting..."; trendArrow = ""; return; }
  int   oldIdx = (pressHead - pressFilled + TREND_SAMPLES) % TREND_SAMPLES;
  float delta  = pressHist[(pressHead - 1 + TREND_SAMPLES) % TREND_SAMPLES]
                 - pressHist[oldIdx];
  if      (delta >  6.0f) { trendLabel = "Fair / Sunny";  trendArrow = "++"; }
  else if (delta >  2.0f) { trendLabel = "Clearing";      trendArrow = "+";  }
  else if (delta >  0.5f) { trendLabel = "Improving";     trendArrow = "/";  }
  else if (delta > -0.5f) { trendLabel = "Stable";        trendArrow = "=";  }
  else if (delta > -2.0f) { trendLabel = "Deteriorating"; trendArrow = "\\"; }
  else if (delta > -6.0f) { trendLabel = "Rain likely";   trendArrow = "-";  }
  else                    { trendLabel = "Storm warning!"; trendArrow = "--"; }
}

// --- OLED screens ---

void drawHeader(const char* title) {
  display.setFont(u8g2_font_7x13B_tf);
  display.drawStr(0, 12, title);
  display.drawHLine(0, 14, 128);
  display.setFont(u8g2_font_6x10_tf);
}

void showEnvironment() {
  char buf[22];
  display.clearBuffer();
  drawHeader("  Environment");
  snprintf(buf, sizeof(buf), "Temp : %5.1f C", avgTemp);           display.drawStr(0, 26, buf);
  snprintf(buf, sizeof(buf), "       %5.1f F", avgTemp*9/5.0f+32); display.drawStr(0, 36, buf);
  snprintf(buf, sizeof(buf), "Humid: %5.1f %%", dhtRH);            display.drawStr(0, 47, buf);
  snprintf(buf, sizeof(buf), "Press:%6.1f hPa", bmpPres);          display.drawStr(0, 58, buf);
  display.sendBuffer();
}

void showCalculated() {
  char buf[22];
  display.clearBuffer();
  drawHeader("   Calculated");
  snprintf(buf, sizeof(buf), "HeatIdx:%5.1f C", hiC);                   display.drawStr(0, 26, buf);
  snprintf(buf, sizeof(buf), "DewPt  :%5.1f C", dp);                    display.drawStr(0, 37, buf);
  snprintf(buf, sizeof(buf), "AbsHum :%4.1f g/m3", ah);                 display.drawStr(0, 48, buf);
  snprintf(buf, sizeof(buf), "> %s", comfortStr(avgTemp, dhtRH));        display.drawStr(0, 62, buf);
  display.sendBuffer();
}

void showMinMax() {
  char buf[22];
  display.clearBuffer();
  drawHeader("Session Min/Max");
  if (!minMaxInit) {
    display.drawStr(10, 40, "Collecting...");
  } else {
    snprintf(buf, sizeof(buf), "T:%.1f~%.1f C", minT, maxT);       display.drawStr(0, 26, buf);
    snprintf(buf, sizeof(buf), "H:%.1f~%.1f %%", minH, maxH);      display.drawStr(0, 37, buf);
    snprintf(buf, sizeof(buf), "P:%.0f~%.0f hPa", minP, maxP);     display.drawStr(0, 48, buf);
    unsigned long s = millis() / 1000;
    snprintf(buf, sizeof(buf), "Up %02lu:%02lu:%02lu", s/3600, (s%3600)/60, s%60);
    display.drawStr(0, 62, buf);
  }
  display.sendBuffer();
}

void showTrend() {
  char buf[22];
  display.clearBuffer();
  drawHeader("Weather Trend");
  snprintf(buf, sizeof(buf), "Now: %.1f hPa", bmpPres);   display.drawStr(0, 27, buf);
  if (pressFilled > 0) {
    int   oi    = (pressHead - pressFilled + TREND_SAMPLES) % TREND_SAMPLES;
    float delta = bmpPres - pressHist[oi];
    snprintf(buf, sizeof(buf), "3h delta: %+.1f", delta); display.drawStr(0, 39, buf);
  }
  snprintf(buf, sizeof(buf), "[%s]", trendArrow);          display.drawStr(0, 52, buf);
  display.drawStr(24, 52, trendLabel);
  display.sendBuffer();
}

void showSensors() {
  char buf[22];
  display.clearBuffer();
  drawHeader("Sensors & Alt");
  snprintf(buf, sizeof(buf), "DHT22 :%6.1f C", dhtTemp); display.drawStr(0, 27, buf);
  snprintf(buf, sizeof(buf), "BMP280:%6.1f C", bmpTemp); display.drawStr(0, 38, buf);
  snprintf(buf, sizeof(buf), "Avg   :%6.1f C", avgTemp); display.drawStr(0, 49, buf);
  snprintf(buf, sizeof(buf), "Alt   :%6.1f m", altM);    display.drawStr(0, 62, buf);
  display.sendBuffer();
}

void showGraph() {
  display.clearBuffer();
  drawHeader(" Temp (30 min)");
  if (graphFilled < 2) {
    display.setFont(u8g2_font_6x10_tf);
    display.drawStr(5, 40, "Collecting data...");
    display.sendBuffer();
    return;
  }

  int count = graphFilled;

  // Find min/max for auto-scaling
  float mn = 9999, mx = -9999;
  for (int i = 0; i < count; i++) {
    int idx = (graphHead - count + i + GRAPH_SAMPLES) % GRAPH_SAMPLES;
    if (tempGraph[idx] < mn) mn = tempGraph[idx];
    if (tempGraph[idx] > mx) mx = tempGraph[idx];
  }
  if (mx - mn < 1.0f) { mn -= 0.5f; mx += 0.5f; }

  // Graph area: x 28..127, y 16..63
  const int gx = 28, gy = 16, gw = 99, gh = 47;
  char buf[8];
  display.setFont(u8g2_font_5x7_tf);
  snprintf(buf, sizeof(buf), "%.0fC", mx); display.drawStr(0, gy + 6,  buf);
  snprintf(buf, sizeof(buf), "%.0fC", mn); display.drawStr(0, gy + gh, buf);

  for (int i = 0; i < count - 1; i++) {
    int i1 = (graphHead - count + i     + GRAPH_SAMPLES) % GRAPH_SAMPLES;
    int i2 = (graphHead - count + i + 1 + GRAPH_SAMPLES) % GRAPH_SAMPLES;
    int x1 = gx + (i * gw) / (count - 1);
    int x2 = gx + ((i + 1) * gw) / (count - 1);
    int y1 = gy + gh - (int)((tempGraph[i1] - mn) / (mx - mn) * gh);
    int y2 = gy + gh - (int)((tempGraph[i2] - mn) / (mx - mn) * gh);
    display.drawLine(x1, y1, x2, y2);
  }

  // Current value in top-right
  int li = (graphHead - 1 + GRAPH_SAMPLES) % GRAPH_SAMPLES;
  display.setFont(u8g2_font_6x10_tf);
  snprintf(buf, sizeof(buf), "%.1fC", tempGraph[li]);
  display.drawStr(gx + gw - 28, gy + 12, buf);
  display.sendBuffer();
}

void showAlert() {
  display.clearBuffer();
  if ((millis() / 400) % 2 == 0) {  // blink effect
    display.setFont(u8g2_font_9x15B_tf);
    int w = display.getStrWidth(alertLine1);
    display.drawStr((128 - w) / 2, 28, alertLine1);
  }
  display.setFont(u8g2_font_7x13_tf);
  int w2 = display.getStrWidth(alertLine2);
  display.drawStr((128 - w2) / 2, 50, alertLine2);
  display.sendBuffer();
}

// --- Web dashboard ---

void serveClient(WiFiClient& client) {
  // Drain the incoming request before replying (max 300ms)
  unsigned long deadline = millis() + 300;
  while (client.connected() && millis() < deadline)
    if (client.available()) client.read();

  char buf[32];
  unsigned long sec = millis() / 1000;

  client.println(F("HTTP/1.1 200 OK"));
  client.println(F("Content-Type: text/html"));
  client.println(F("Connection: close"));
  client.println();

  // Page head
  client.println(F("<!DOCTYPE html><html lang='en'><head>"
    "<meta charset='UTF-8'>"
    "<meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<meta http-equiv='refresh' content='10'>"
    "<title>Weather Station</title>"
    "<style>"
    "*{box-sizing:border-box;margin:0;padding:0}"
    "body{font-family:monospace;background:#0d1117;color:#e6edf3;padding:20px}"
    "h1{color:#58a6ff;text-align:center;font-size:22px;margin-bottom:20px}"
    ".grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;max-width:900px;margin:0 auto}"
    ".card{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:14px}"
    ".lbl{color:#8b949e;font-size:10px;text-transform:uppercase;letter-spacing:1px}"
    ".val{font-size:24px;font-weight:bold;color:#58a6ff;margin:6px 0 2px}"
    ".sub{font-size:13px;color:#8b949e;margin-top:4px}"
    ".warn{color:#f85149!important}"
    ".ok{color:#3fb950!important}"
    ".sec{margin-top:14px}"
    ".foot{text-align:center;color:#484f58;margin-top:18px;font-size:11px}"
    ".trend{font-size:16px!important}"
    "</style></head><body>"
    "<h1>&#127777; Weather Station &mdash; Uno R4 WiFi</h1>"));

  // Row 1: live readings
  client.println(F("<div class='grid'>"));

  client.print(F("<div class='card'><div class='lbl'>Temperature</div>"
                 "<div class='val'>"));
  snprintf(buf, sizeof(buf), "%.1f", avgTemp); client.print(buf);
  client.print(F(" <span style='font-size:14px'>&#176;C</span></div>"
                 "<div class='sub'>"));
  snprintf(buf, sizeof(buf), "%.1f &deg;F", avgTemp * 9.0f / 5.0f + 32.0f);
  client.print(buf);
  client.println(F("</div></div>"));

  client.print(F("<div class='card'><div class='lbl'>Humidity</div>"
                 "<div class='val'>"));
  snprintf(buf, sizeof(buf), "%.1f", dhtRH); client.print(buf);
  client.println(F(" <span style='font-size:14px'>%</span></div></div>"));

  client.print(F("<div class='card'><div class='lbl'>Pressure</div>"
                 "<div class='val'>"));
  snprintf(buf, sizeof(buf), "%.1f", bmpPres); client.print(buf);
  client.println(F(" <span style='font-size:14px'>hPa</span></div></div>"));

  bool danger = hiC > 39.0f;
  client.print(F("<div class='card'><div class='lbl'>Heat Index</div>"
                 "<div class='val "));
  client.print(danger ? F("warn'") : F("'"));
  client.print(F(">"));
  snprintf(buf, sizeof(buf), "%.1f", hiC); client.print(buf);
  client.print(F(" <span style='font-size:14px'>&#176;C</span></div>"));
  if (danger) client.print(F("<div class='sub warn'>&#9888; Danger</div>"));
  client.println(F("</div>"));

  client.print(F("<div class='card'><div class='lbl'>Dew Point</div>"
                 "<div class='val'>"));
  snprintf(buf, sizeof(buf), "%.1f", dp); client.print(buf);
  client.println(F(" <span style='font-size:14px'>&#176;C</span></div></div>"));

  client.print(F("<div class='card'><div class='lbl'>Abs Humidity</div>"
                 "<div class='val' style='font-size:20px'>"));
  snprintf(buf, sizeof(buf), "%.1f", ah); client.print(buf);
  client.println(F(" <span style='font-size:13px'>g/m&#179;</span></div></div>"));

  client.print(F("<div class='card'><div class='lbl'>Altitude</div>"
                 "<div class='val'>"));
  snprintf(buf, sizeof(buf), "%.0f", altM); client.print(buf);
  client.println(F(" <span style='font-size:14px'>m</span></div></div>"));

  client.print(F("<div class='card'><div class='lbl'>Comfort</div>"
                 "<div class='val' style='font-size:18px'>"));
  client.print(comfortStr(avgTemp, dhtRH));
  client.println(F("</div></div>"));

  client.println(F("</div>"));

  // Row 2: trend + min/max
  client.println(F("<div class='grid sec'>"));

  client.print(F("<div class='card'><div class='lbl'>3-Hour Weather Trend</div>"
                 "<div class='val trend'>"));
  client.print(trendLabel);
  if (pressFilled > 4) {
    int   oi    = (pressHead - pressFilled + TREND_SAMPLES) % TREND_SAMPLES;
    float delta = bmpPres - pressHist[oi];
    client.print(F("</div><div class='sub'>3h delta: "));
    snprintf(buf, sizeof(buf), "%+.1f hPa", delta); client.print(buf);
  }
  client.println(F("</div></div>"));

  client.print(F("<div class='card'><div class='lbl'>Temp Range (session)</div>"
                 "<div class='sub' style='font-size:15px;margin-top:10px'>"));
  if (minMaxInit) { snprintf(buf, sizeof(buf), "%.1f ~ %.1f &#176;C", minT, maxT); client.print(buf); }
  else client.print(F("--"));
  client.println(F("</div></div>"));

  client.print(F("<div class='card'><div class='lbl'>Humidity Range</div>"
                 "<div class='sub' style='font-size:15px;margin-top:10px'>"));
  if (minMaxInit) { snprintf(buf, sizeof(buf), "%.1f ~ %.1f %%", minH, maxH); client.print(buf); }
  else client.print(F("--"));
  client.println(F("</div></div>"));

  client.print(F("<div class='card'><div class='lbl'>Pressure Range</div>"
                 "<div class='sub' style='font-size:15px;margin-top:10px'>"));
  if (minMaxInit) { snprintf(buf, sizeof(buf), "%.0f ~ %.0f hPa", minP, maxP); client.print(buf); }
  else client.print(F("--"));
  client.println(F("</div></div>"));

  client.println(F("</div>"));

  // Row 3: sensor comparison
  client.println(F("<div class='grid sec'>"));

  client.print(F("<div class='card'><div class='lbl'>DHT22 Temperature</div>"
                 "<div class='val' style='font-size:20px'>"));
  snprintf(buf, sizeof(buf), "%.1f &#176;C", dhtTemp); client.print(buf);
  client.println(F("</div></div>"));

  client.print(F("<div class='card'><div class='lbl'>BMP280 Temperature</div>"
                 "<div class='val' style='font-size:20px'>"));
  snprintf(buf, sizeof(buf), "%.1f &#176;C", bmpTemp); client.print(buf);
  client.println(F("</div></div>"));

  client.print(F("<div class='card'><div class='lbl'>Temp Difference</div>"
                 "<div class='val' style='font-size:20px'>"));
  snprintf(buf, sizeof(buf), "%+.1f &#176;C", dhtTemp - bmpTemp); client.print(buf);
  client.println(F("</div></div>"));

  client.println(F("</div>"));

  // Footer
  client.print(F("<div class='foot'>Auto-refreshes every 10s &nbsp;|&nbsp; Uptime: "));
  snprintf(buf, sizeof(buf), "%02lu:%02lu:%02lu", sec/3600, (sec%3600)/60, sec%60);
  client.print(buf);
  client.print(F(" &nbsp;|&nbsp; IP: ")); client.print(ipStr);
  client.println(F("</div></body></html>"));
}

// --- Setup ---

void setup() {
  Serial.begin(9600);
  dht.begin();
  display.begin();

  // Splash screen
  display.clearBuffer();
  display.setFont(u8g2_font_7x13B_tf);
  display.drawStr(2, 18, "Weather Station");
  display.setFont(u8g2_font_6x10_tf);
  display.drawStr(22, 34, "Uno R4 WiFi");
  display.drawStr(26, 50, "Starting...");
  display.sendBuffer();

  // BMP280 - try both common I2C addresses
  bool bmpOK = bmp.begin(0x76);
  if (!bmpOK) bmpOK = bmp.begin(0x77);
  if (!bmpOK) {
    display.clearBuffer();
    display.setFont(u8g2_font_7x13B_tf);
    display.drawStr(5, 28, "BMP280 Error!");
    display.setFont(u8g2_font_6x10_tf);
    display.drawStr(5, 46, "Check SDO/wiring");
    display.sendBuffer();
    while (1) delay(1000);
  }
  bmp.setSampling(Adafruit_BMP280::MODE_NORMAL,
                  Adafruit_BMP280::SAMPLING_X2,
                  Adafruit_BMP280::SAMPLING_X16,
                  Adafruit_BMP280::FILTER_X16,
                  Adafruit_BMP280::STANDBY_MS_500);

  // Connect to WiFi
  display.clearBuffer();
  display.setFont(u8g2_font_7x13B_tf);
  display.drawStr(20, 20, "Connecting");
  display.setFont(u8g2_font_6x10_tf);
  display.drawStr(20, 36, "to WiFi...");
  display.drawStr(10, 52, WIFI_SSID);
  display.sendBuffer();

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500); attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    // Wait for DHCP - status flips to WL_CONNECTED before IP is assigned
    int ipWait = 0;
    while (WiFi.localIP() == IPAddress(0, 0, 0, 0) && ipWait < 20) {
      delay(500); ipWait++;
    }
    wifiOK = true;
    server.begin();
    IPAddress ip = WiFi.localIP();
    snprintf(ipStr, sizeof(ipStr), "%d.%d.%d.%d", ip[0], ip[1], ip[2], ip[3]);

    display.clearBuffer();
    display.setFont(u8g2_font_7x13B_tf);
    display.drawStr(8, 14, "WiFi Connected!");
    display.setFont(u8g2_font_6x10_tf);
    display.drawStr(2, 30, "Open browser at:");
    char full[24];
    snprintf(full, sizeof(full), "http://%s", ipStr);
    display.drawStr(0, 44, full);
    display.drawStr(0, 58, "(bookmark this URL)");
    display.sendBuffer();
    Serial.print(F("Dashboard: http://")); Serial.println(ipStr);
    delay(5000);
  } else {
    display.clearBuffer();
    display.setFont(u8g2_font_6x10_tf);
    display.drawStr(5, 24, "WiFi failed.");
    display.drawStr(5, 38, "Running offline.");
    display.drawStr(5, 52, "OLED only.");
    display.sendBuffer();
    Serial.println(F("[WARN] WiFi not connected"));
    delay(2000);
  }

  readSensors();
}

// --- Loop ---

void loop() {
  unsigned long now = millis();

  if (now - lastSensor >= SENSOR_MS) {
    lastSensor = now;
    readSensors();
  }

  if (now - lastTrend >= TREND_MS) {
    lastTrend = now;
    pressHist[pressHead] = bmpPres;
    pressHead = (pressHead + 1) % TREND_SAMPLES;
    if (pressFilled < TREND_SAMPLES) pressFilled++;
    updateTrend();
  }

  if (now - lastGraph >= GRAPH_MS) {
    lastGraph = now;
    tempGraph[graphHead] = avgTemp;
    graphHead = (graphHead + 1) % GRAPH_SAMPLES;
    if (graphFilled < GRAPH_SAMPLES) graphFilled++;
  }

  if (alertActive && now < alertUntil) {
    showAlert();
  } else if (sensorsReady && now - lastScreen >= SCREEN_MS) {
    lastScreen = now;
    switch (currentScreen) {
      case 0: showEnvironment(); break;
      case 1: showCalculated();  break;
      case 2: showMinMax();      break;
      case 3: showTrend();       break;
      case 4: showSensors();     break;
      case 5: showGraph();       break;
    }
    currentScreen = (currentScreen + 1) % SCREEN_COUNT;
  }

  if (wifiOK) {
    WiFiClient client = server.available();
    if (client) {
      serveClient(client);
      client.stop();
    }
  }
}
