# Arduino readings

Displays Arduino sensor readings.

Website: https://ryanw506.github.io/NAQAA./

Open the website in desktop Chrome or Edge and connect the compatible Arduino over USB. Close Arduino Serial Monitor and other apps using the serial port. The humidity forecast runs locally in the browser; no Python service is needed. Keep the page open and allow about 65 seconds of continuous sensor readings for forecasts. Automatic control uses the device readings and forecast; the Stop blower button turns it off.

To run the site from VS Code, download and extract the repository, select File > Open Folder, install Node.js and run `node preview.cjs` in the terminal. Open http://127.0.0.1:8771/.

The included NaqaaCombined.ino targets a classic 16 MHz Nano, BME280 I2C, D9 PWM, and optional D2 tach feedback. Install Adafruit BME280 and its dependencies in Arduino IDE. RPM assumes two pulses per revolution. Altitude is approximate. Device data and calculations remain on the connected computer. Historical readings are stored locally in the browser.

Copyright (c) 2026 ryanw506. All rights reserved. See LICENSE and credits.html.
