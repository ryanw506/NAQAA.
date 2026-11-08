# Arduino readings

Displays Arduino sensor readings.

Website: https://ryanw506.github.io/NAQAA./

## Run the forecast service

1. Download the repository ZIP, extract it, and open the extracted folder in VS Code using **File > Open Folder**.
2. Install Python, then open **Terminal > New Terminal** and run:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe api.py
```

Keep this terminal open. The service listens only on this computer at http://127.0.0.1:8000. Restart it after replacing the model. Only load a model file you trust.

## Open the dashboard

Use the website link above in desktop Chrome or Edge. For local development, install Node.js, open a second terminal in the extracted folder, run `node preview.cjs`, and visit http://127.0.0.1:8771/.

Connect the board using USB, close Arduino Serial Monitor and any other program using its port, and select 9600 baud. Temperature and humidity need about 65 seconds of uninterrupted readings for the forecast. The site and Python service must run on the computer connected to the board.

## Arduino

`NaqaaCombined.ino` targets a classic 16 MHz ATmega328P Nano with BME280 I2C, 25 kHz PWM on D9 and optional tachometer input on D2. Install Adafruit BME280 and its dependencies in Arduino IDE. Keep existing suitable motor-driver wiring; do not connect motor power to the Arduino pin. RPM assumes two tach pulses per revolution. Altitude is approximate, based on standard sea-level pressure.

Automatic mode can request blower operation when the sensor and local forecast service are ready. The firmware requests stop on missing sensor data or command timeout; use the physical switch if needed. Forecasts are estimates and history is stored in the local browser. Data from a USB-connected device is not shared remotely.

## Rights

Copyright (c) 2026 ryanw506. All rights reserved. See LICENSE. Third-party notices remain in credits.html.
