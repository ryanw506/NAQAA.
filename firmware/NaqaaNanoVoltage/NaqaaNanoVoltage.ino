#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>
#include <util/atomic.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

#if !defined(__AVR_ATmega328P__) || F_CPU != 16000000UL
#error Select the classic 16 MHz ATmega328P Arduino Nano.
#endif

const byte BLOWER_PIN = 9;
const byte TACH_PIN = 2;

// حساس الفولت: غيّر A1 فقط إذا شبكتوه على مدخل آخر
const byte VOLTAGE_PIN = A1;

// الإعدادات المستخدمة في اختبار حساس الفولت
const float ADC_REFERENCE_VOLTAGE = 5.0F;
const float VOLTAGE_DIVIDER_RATIO = 5.0F;

// إعدادات المنفاخ
const bool PWM_HIGH_RUNS = true;
const float PULSES_PER_REVOLUTION = 2.0;
const uint16_t PWM_TOP = 639; // 25 kHz

const unsigned long COMMAND_TIMEOUT_MS = 6000UL;
const unsigned long SAMPLE_MS = 1000UL;
const unsigned long AUTO_DELAY_MS = 10000UL; // إضافة: مدة الانتظار 10 ثوانٍ

Adafruit_BME280 bme;

volatile unsigned long tachPulses = 0;

byte appliedPercent = 0;
bool sensorFound = false;
bool sensorOK = false;

unsigned long lastCommand = 0;
unsigned long lastSample = 0;
unsigned long lastRetry = 0;

unsigned long autoConditionStartTime = 0; // إضافة: لحساب بداية وقت تحقق الشرط
bool autoConditionActive = false;         // إضافة: لمعرفة هل الشرط مستمر أم لا
bool voltageControlEnabled = false;
bool voltageAutoRunning = false;
byte requestedPercent = 0;

char commandBuffer[20];
byte commandLength = 0;
bool commandOverflow = false;

void countTachPulse() {
  tachPulses++;
}

void setBlowerPercent(byte percent) {
  if (percent > 100) {
    percent = 100;
  }

  byte highPercent = PWM_HIGH_RUNS ? percent : 100 - percent;

  TCCR1A &= ~(_BV(COM1A1) | _BV(COM1A0));

  if (highPercent == 0) {
    digitalWrite(BLOWER_PIN, LOW);
  } else if (highPercent == 100) {
    digitalWrite(BLOWER_PIN, HIGH);
  } else {
    uint16_t highCounts =
      ((unsigned long)(PWM_TOP + 1) * highPercent) / 100;

    OCR1A = highCounts - 1;
    TCCR1A |= _BV(COM1A1);
  }

  appliedPercent = percent;
}

void handleCommand(const char *command) {
  if (strcmp(command, "S") == 0) {
    voltageControlEnabled = false;
    voltageAutoRunning = false;
    autoConditionActive = false;
    requestedPercent = 0;
    setBlowerPercent(0);
    lastCommand = millis();
    return;
  }

  if (
    (strncmp(command, "D:", 2) != 0 && strncmp(command, "V:", 2) != 0) ||
    command[2] < '0' ||
    command[2] > '9'
  ) {
    setBlowerPercent(0);
    return;
  }

  for (const char *p = command + 2; *p; ++p) {
    if (*p < '0' || *p > '9') {
      setBlowerPercent(0);
      return;
    }
  }

  long value = strtol(command + 2, NULL, 10);

  if (value < 0 || value > 100) {
    setBlowerPercent(0);
    return;
  }

  lastCommand = millis();
  voltageControlEnabled = command[0] == 'V';
  requestedPercent = (byte)value;
  if (!voltageControlEnabled) {
    autoConditionActive = false;
    voltageAutoRunning = false;
  }
  setBlowerPercent(sensorOK ? (voltageAutoRunning ? 100 : requestedPercent) : 0);
}

void readCommands() {
  while (Serial.available()) {
    char c = Serial.read();

    if (c == '\r') {
      continue;
    }

    if (c == '\n') {
      commandBuffer[commandLength] = '\0';

      if (commandOverflow) {
        setBlowerPercent(0);
      } else if (commandLength) {
        handleCommand(commandBuffer);
      }

      commandLength = 0;
      commandOverflow = false;
    } else if (commandLength < sizeof(commandBuffer) - 1) {
      commandBuffer[commandLength++] = c;
    } else {
      commandOverflow = true;
    }
  }
}

bool findSensor() {
  return bme.begin(0x76) || bme.begin(0x77);
}

void setup() {
  digitalWrite(BLOWER_PIN, PWM_HIGH_RUNS ? LOW : HIGH);
  pinMode(BLOWER_PIN, OUTPUT);

  TCCR1A = 0;
  TCCR1B = 0;
  TCNT1 = 0;

  ICR1 = PWM_TOP;
  OCR1A = 0;

  TCCR1A = _BV(WGM11);
  TCCR1B = _BV(WGM13) | _BV(WGM12) | _BV(CS10);

  setBlowerPercent(0);

  pinMode(VOLTAGE_PIN, INPUT);

  pinMode(TACH_PIN, INPUT_PULLUP);
  attachInterrupt(
    digitalPinToInterrupt(TACH_PIN),
    countTachPulse,
    FALLING
  );

  Serial.begin(9600);
  Wire.begin();

#if defined(WIRE_HAS_TIMEOUT)
  Wire.setWireTimeout(25000UL, true);
#endif

  sensorFound = findSensor();
  lastSample = lastCommand = lastRetry = millis();
}

void loop() {
  readCommands();

  unsigned long now = millis();

  if (now - lastCommand >= COMMAND_TIMEOUT_MS || !sensorOK) {
    voltageControlEnabled = false;
    voltageAutoRunning = false;
    autoConditionActive = false;
    setBlowerPercent(0);
  }

  if (!sensorFound && now - lastRetry >= 5000UL) {
    lastRetry = now;
    sensorFound = findSensor();
  }

  if (now - lastSample < SAMPLE_MS) {
    return;
  }

  unsigned long elapsed = now - lastSample;
  lastSample = now;

  unsigned long pulses;

  ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
    pulses = tachPulses;
    tachPulses = 0;
  }

  float rpm =
    pulses * 60000.0F /
    (PULSES_PER_REVOLUTION * elapsed);

  unsigned long voltageTotal = 0;

  for (byte i = 0; i < 20; i++) {
    voltageTotal += analogRead(VOLTAGE_PIN);
  }

  float voltage =
    (voltageTotal / 20.0F) *
    ADC_REFERENCE_VOLTAGE *
    VOLTAGE_DIVIDER_RATIO / 1023.0F;

  float temperature =
    sensorFound ? bme.readTemperature() : NAN;

  float humidity =
    sensorFound ? bme.readHumidity() : NAN;

  float pressure =
    sensorFound ? bme.readPressure() / 100.0F : NAN;

  float altitude =
    isfinite(pressure) && pressure > 0
      ? 44330.0F * (1.0F - pow(pressure / 1013.25F, 0.1903F))
      : NAN;

  sensorOK =
    isfinite(temperature) &&
    isfinite(humidity) &&
    humidity >= 0 &&
    humidity <= 100;

  if (!sensorOK) {
    setBlowerPercent(0);
    sensorFound = false;
  }

  // ---------------------------------------------------------
  // شرط الجهد مستقل عن الرطوبة. يفعّله الموقع بأوامر V أثناء الوضع التلقائي.
  if (voltageControlEnabled && sensorOK && isfinite(voltage) && voltage <= 7.0) {
    if (!autoConditionActive) {
      autoConditionActive = true;
      autoConditionStartTime = now; // يبدأ يحسب الوقت
    } else if (now - autoConditionStartTime >= AUTO_DELAY_MS) {
      voltageAutoRunning = true;
    }
  } else {
    autoConditionActive = false; // يصفر العداد إذا تجاوز الجهد 7 فولت أو توقف التلقائي
    voltageAutoRunning = false;
  }
  if (sensorOK && now - lastCommand < COMMAND_TIMEOUT_MS) {
    setBlowerPercent(voltageAutoRunning ? 100 : requestedPercent);
  }
  // ---------------------------------------------------------

  Serial.print(F("{\"naqaa\":2,\"sensor_ok\":"));
  Serial.print(sensorOK ? F("true") : F("false"));

  Serial.print(F(",\"temperature\":"));
  if (sensorOK) {
    Serial.print(temperature, 2);
  } else {
    Serial.print(F("null"));
  }

  Serial.print(F(",\"humidity\":"));
  if (sensorOK) {
    Serial.print(humidity, 2);
  } else {
    Serial.print(F("null"));
  }

  Serial.print(F(",\"pressure\":"));
  if (isfinite(pressure) && pressure > 0) {
    Serial.print(pressure, 2);
  } else {
    Serial.print(F("null"));
  }

  Serial.print(F(",\"altitude\":"));
  if (isfinite(altitude)) {
    Serial.print(altitude, 2);
  } else {
    Serial.print(F("null"));
  }

  Serial.print(F(",\"voltage\":"));
  Serial.print(voltage, 2);

  Serial.print(F(",\"voltage_rule\":1,\"voltage_limit\":7,\"voltage_auto\":"));
  Serial.print(voltageAutoRunning ? F("true") : F("false"));
  Serial.print(F(",\"voltage_wait_seconds\":"));
  Serial.print(autoConditionActive
    ? (now - autoConditionStartTime >= AUTO_DELAY_MS ? 0UL : (AUTO_DELAY_MS - (now - autoConditionStartTime) + 999UL) / 1000UL)
    : 0UL);

  Serial.print(F(",\"rpm\":"));
  Serial.print(rpm, 0);

  Serial.print(F(",\"applied\":"));
  Serial.print(appliedPercent);

  Serial.print(F(",\"command_timeout\":"));
  Serial.print(
    now - lastCommand >= COMMAND_TIMEOUT_MS
      ? F("true")
      : F("false")
  );

  Serial.println(F("}"));
}
