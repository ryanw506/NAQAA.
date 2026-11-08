// classic 16 MHz ATmega328P Nano only
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
const bool PWM_HIGH_RUNS = true; // matches your latest working LOW=stop, HIGH=run setting
const float PULSES_PER_REVOLUTION = 2.0; // verify against blower specification
const uint16_t PWM_TOP = 639; // 16 MHz / 640 = 25 kHz
const unsigned long COMMAND_TIMEOUT_MS = 6000UL;
const unsigned long SAMPLE_MS = 1000UL;

Adafruit_BME280 bme;
volatile unsigned long tachPulses = 0;
byte appliedPercent = 0;
bool sensorFound = false;
bool sensorOK = false;
unsigned long lastCommand = 0;
unsigned long lastSample = 0;
unsigned long lastRetry = 0;
char commandBuffer[20];
byte commandLength = 0;
bool commandOverflow = false;

void countTachPulse() { tachPulses++; }

void setBlowerPercent(byte percent) {
  if (percent > 100) percent = 100;
  byte highPercent = PWM_HIGH_RUNS ? percent : 100 - percent;
  TCCR1A &= ~(_BV(COM1A1) | _BV(COM1A0));
  if (highPercent == 0) digitalWrite(BLOWER_PIN, LOW);
  else if (highPercent == 100) digitalWrite(BLOWER_PIN, HIGH);
  else {
    uint16_t highCounts = ((unsigned long)(PWM_TOP + 1) * highPercent) / 100;
    OCR1A = highCounts - 1;
    TCCR1A |= _BV(COM1A1);
  }
  appliedPercent = percent;
}

void handleCommand(const char *command) {
  if (strcmp(command, "S") == 0) {
    setBlowerPercent(0);
    lastCommand = millis();
    return;
  }
  if (strncmp(command, "D:", 2) != 0 || command[2] < '0' || command[2] > '9') {
    setBlowerPercent(0);
    return;
  }
  // accept only decimal integer duty commands, no suffixes or sign
  for (const char *p = command + 2; *p; ++p) {
    if (*p < '0' || *p > '9') { setBlowerPercent(0); return; }
  }
  long value = strtol(command + 2, NULL, 10);
  if (value < 0 || value > 100) { setBlowerPercent(0); return; }
  lastCommand = millis();
  setBlowerPercent(sensorOK ? (byte)value : 0);
}

void readCommands() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      commandBuffer[commandLength] = '\0';
      if (commandOverflow) setBlowerPercent(0);
      else if (commandLength) handleCommand(commandBuffer);
      commandLength = 0;
      commandOverflow = false;
    } else if (commandLength < sizeof(commandBuffer) - 1) {
      commandBuffer[commandLength++] = c;
    } else commandOverflow = true;
  }
}

bool findSensor() {
  return bme.begin(0x76) || bme.begin(0x77);
}

void setup() {
  digitalWrite(BLOWER_PIN, PWM_HIGH_RUNS ? LOW : HIGH);
  pinMode(BLOWER_PIN, OUTPUT);
  TCCR1A = 0; TCCR1B = 0; TCNT1 = 0;
  ICR1 = PWM_TOP; OCR1A = 0;
  TCCR1A = _BV(WGM11);
  TCCR1B = _BV(WGM13) | _BV(WGM12) | _BV(CS10);
  setBlowerPercent(0);
  pinMode(TACH_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(TACH_PIN), countTachPulse, FALLING);
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
  if (now - lastCommand >= COMMAND_TIMEOUT_MS || !sensorOK) setBlowerPercent(0);
  if (!sensorFound && now - lastRetry >= 5000UL) {
    lastRetry = now;
    sensorFound = findSensor();
  }
  if (now - lastSample < SAMPLE_MS) return;
  unsigned long elapsed = now - lastSample;
  lastSample = now;
  unsigned long pulses;
  ATOMIC_BLOCK(ATOMIC_RESTORESTATE) { pulses = tachPulses; tachPulses = 0; }
  float rpm = pulses * 60000.0F / (PULSES_PER_REVOLUTION * elapsed);
  float temperature = sensorFound ? bme.readTemperature() : NAN;
  float humidity = sensorFound ? bme.readHumidity() : NAN;
  float pressure = sensorFound ? bme.readPressure() / 100.0F : NAN;
  float altitude = isfinite(pressure) && pressure > 0 ? 44330.0F * (1.0F - pow(pressure / 1013.25F, 0.1903F)) : NAN;
  sensorOK = isfinite(temperature) && isfinite(humidity) && humidity >= 0 && humidity <= 100;
  if (!sensorOK) { setBlowerPercent(0); sensorFound = false; }
  Serial.print(F("{\"naqaa\":2,\"sensor_ok\":"));
  Serial.print(sensorOK ? F("true") : F("false"));
  Serial.print(F(",\"temperature\":"));
  if (sensorOK) Serial.print(temperature, 2); else Serial.print(F("null"));
  Serial.print(F(",\"humidity\":"));
  if (sensorOK) Serial.print(humidity, 2); else Serial.print(F("null"));
  Serial.print(F(",\"pressure\":")); if (isfinite(pressure) && pressure > 0) Serial.print(pressure, 2); else Serial.print(F("null"));
  Serial.print(F(",\"altitude\":")); if (isfinite(altitude)) Serial.print(altitude, 2); else Serial.print(F("null"));
  Serial.print(F(",\"rpm\":")); Serial.print(rpm, 0);
  Serial.print(F(",\"applied\":")); Serial.print(appliedPercent);
  Serial.print(F(",\"command_timeout\":"));
  Serial.print(now - lastCommand >= COMMAND_TIMEOUT_MS ? F("true") : F("false"));
  Serial.println(F("}"));
}
