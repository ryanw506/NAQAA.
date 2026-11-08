# Local forecast

From the folder containing api.py and humidity_model.joblib, install requirements.txt, then run `.\.venv\Scripts\python.exe api.py`. See README.md for complete setup. Restart the service when replacing the model. The service processes readings locally and does not open the serial port. It must be running on the computer connected to the Arduino. It uses the supplied 10-second and 60-second models. Automatic control commands are sent by the dashboard using the compatible Nano firmware.
