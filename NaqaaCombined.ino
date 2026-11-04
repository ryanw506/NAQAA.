// Naqaa blower: classic Uno/Nano AVR, 16 MHz, D9.
// 9600 baud. Newline commands: V0..V100, R, S, Q.
#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_BME280.h>
#include <math.h>
Adafruit_BME280 bme;
bool sensorReady=false;
unsigned long lastSensorRead=0,lastSensorRetry=0;
const float SEA_LEVEL_HPA=1013.25F;

void initializeSensor(){
 sensorReady=bme.begin(0x76);
 if(!sensorReady)sensorReady=bme.begin(0x77);
 if(!sensorReady)Serial.println(F("{\"sensor_error\":\"BME280 not found at 0x76/0x77\"}"));
 lastSensorRetry=millis();
}
void readEnvironment(){
 if(!sensorReady){if((unsigned long)(millis()-lastSensorRetry)>=5000UL)initializeSensor();return;}
 if((unsigned long)(millis()-lastSensorRead)<1000UL)return;
 lastSensorRead=millis();
 const float temperature=bme.readTemperature();
 const float humidity=bme.readHumidity();
 const float pressure=bme.readPressure()/100.0F;
 if(!isfinite(temperature)||!isfinite(humidity)||!isfinite(pressure)||humidity<0||humidity>100||pressure<=0){Serial.println(F("{\"sensor_error\":\"Invalid BME280 reading\"}"));return;}
 const float altitude=44330.0F*(1.0F-pow(pressure/SEA_LEVEL_HPA,0.1903F));
 Serial.print(F("Temperature = "));Serial.print(temperature,2);Serial.println(F(" *C"));
 Serial.print(F("Humidity = "));Serial.print(humidity,2);Serial.println(F(" %"));
 Serial.print(F("Pressure = "));Serial.print(pressure,2);Serial.println(F(" hPa"));
 Serial.print(F("Approx. Altitude = "));Serial.print(altitude,2);Serial.println(F(" m"));
}
#if !defined(__AVR_ATmega328P__) && !defined(__AVR_ATmega168__)
#error "This Timer1/D9 implementation targets classic Uno/Nano AVR at 16 MHz."
#endif
#if F_CPU != 16000000UL
#error "25 kHz configuration requires a 16 MHz board."
#endif
const byte BLOWER_PIN = 9;
const unsigned int PWM_TOP = 639;
byte speedPercent = 60;
bool blowerRunning = false;
unsigned long blowerLastContact = 0, blowerLastStatus = 0;
char blowerCommand[8];
byte blowerLength = 0;
bool blowerOverflow = false;
void setBlowerSpeed(byte percent) {
 percent = constrain(percent, 0, 100);
 TCCR1A &= ~(_BV(COM1A1) | _BV(COM1A0));
 if(percent == 0) digitalWrite(BLOWER_PIN, LOW);
 else if(percent == 100) digitalWrite(BLOWER_PIN, HIGH);
 else { OCR1A = ((unsigned long)(PWM_TOP + 1) * percent) / 100 - 1; TCCR1A |= _BV(COM1A1); }
}
void blowerReport() {
 Serial.print(F("{\"naqaa_blower\":1,\"running\":"));
 Serial.print(blowerRunning ? F("true") : F("false"));
 Serial.print(F(",\"selected\":"));Serial.print(speedPercent);
 Serial.print(F(",\"applied\":"));Serial.print(blowerRunning ? speedPercent : 0);
 Serial.println(F("}"));blowerLastStatus = millis();
}
void stopBlower(){setBlowerSpeed(0);blowerRunning=false;}
void blowerHandle() {
 blowerCommand[blowerLength]='\0';
 if(blowerLength==1 && (blowerCommand[0]=='Q'||blowerCommand[0]=='H')) {blowerLastContact=millis();blowerReport();return;}
 if(blowerLength==1 && blowerCommand[0]=='S'){stopBlower();blowerLastContact=millis();blowerReport();return;}
 if(blowerLength==1 && blowerCommand[0]=='R'){blowerLastContact=millis();blowerRunning=speedPercent>0;setBlowerSpeed(blowerRunning?speedPercent:0);blowerReport();return;}
 if(blowerLength>=2 && blowerLength<=4 && blowerCommand[0]=='V') {
  unsigned int n=0;
  for(byte i=1;i<blowerLength;i++){if(blowerCommand[i]<'0'||blowerCommand[i]>'9')return;n=n*10+(blowerCommand[i]-'0');}
  if(n>100)return;
  speedPercent=n;blowerLastContact=millis();
  if(n==0)stopBlower();else if(blowerRunning)setBlowerSpeed(speedPercent);
  blowerReport();return;
 }
 Serial.println(F("{\"blower_error\":\"invalid_command\"}"));
}
void blowerSetup(){
 digitalWrite(BLOWER_PIN,LOW);pinMode(BLOWER_PIN,OUTPUT);
 TCCR1A=0;TCCR1B=0;TCNT1=0;ICR1=PWM_TOP;OCR1A=0;
 TCCR1A=_BV(WGM11);TCCR1B=_BV(WGM13)|_BV(WGM12)|_BV(CS10);
 stopBlower();blowerLastContact=millis();blowerReport();
}
void blowerLoop(){
 while(Serial.available()>0){char c=Serial.read();
  if(c=='\n'||c=='\r'){if(!blowerOverflow&&blowerLength)blowerHandle();blowerLength=0;blowerOverflow=false;}
  else if(blowerLength<sizeof(blowerCommand)-1&&!blowerOverflow)blowerCommand[blowerLength++]=c;
  else blowerOverflow=true;
 }
 if(blowerRunning && (unsigned long)(millis()-blowerLastContact)>4000UL){stopBlower();blowerReport();}
 if((unsigned long)(millis()-blowerLastStatus)>=1000UL)blowerReport();
}

void setup(){
 Serial.begin(9600);blowerSetup();
 Wire.begin();
 #if defined(WIRE_HAS_TIMEOUT)
 Wire.setWireTimeout(25000,true);
 #endif
 initializeSensor();
}
void loop(){ blowerLoop();readEnvironment();blowerLoop(); }
