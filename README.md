# Arduino readings

Displays Arduino sensor readings.

Website: https://ryanw506.github.io/NAQAA./

## Run locally with VS Code
1. Download ZIP from GitHub and extract it.
2. In VS Code, choose File > Open Folder and select the folder containing index.html and preview.cjs.
3. Install Node.js if it is not installed. No npm packages are required.
4. Open Terminal > New Terminal and run:

```sh
node preview.cjs
```

5. Open http://127.0.0.1:8771/ in desktop Chrome or Edge. Keep the terminal open.
6. Close Arduino Serial Monitor and Serial Plotter, connect the board by a data-capable USB cable, select 9600 baud and click Connect device.

## Firmware
NaqaaCombined.ino targets classic 16 MHz Uno/Nano AVR, BME280 over I2C at 0x76 or 0x77, and 25 kHz PWM on D9. Install Adafruit BME280 Library and its dependencies in Arduino IDE. Copy the sketch into Arduino IDE and upload to the matching board and port. Use the existing external motor driver circuit; do not power a motor directly from D9.

Blower control supports 0–100% PWM with Start and Stop. The panel requires confirmation from compatible firmware. The firmware starts stopped and stops the PWM output after about four seconds without website communication while loop() is running. RPM is unavailable unless actual speed feedback is supplied; the included firmware does not measure RPM.

USB data belongs to the device attached to the visitor's computer. It is not remotely shared. History uses second aggregates retained locally for one hour, with 1-minute, 10-minute and 1-hour views. Recording requires an open connected page. The hardware has not been fully tested with this combined firmware.

## Rights
Copyright (c) 2026 ryanw506. All rights reserved. See LICENSE. Third-party notices remain in credits.html.
