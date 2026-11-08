"""Loopback-only inference and policy service. Never opens USB or sends commands."""
import math
import os
import time
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

MODEL_PATH = Path(os.environ.get('NAQAA_MODEL_PATH', str(Path(__file__).with_name('humidity_model.joblib'))))
bundle = joblib.load(MODEL_PATH)
if not {10, 60}.issubset(bundle.get('models', {})):
    raise RuntimeError('This service requires the updated 10s AND 60s models.')
app = FastAPI(title='NAQAA local forecast and control policy')
app.add_middleware(CORSMiddleware, allow_origins=[
    'http://127.0.0.1:8771', 'http://localhost:8771', 'https://ryanw506.github.io'
], allow_methods=['GET', 'POST'], allow_headers=['Content-Type'])


class Reading(BaseModel):
    timestamp: float = Field(allow_inf_nan=False)
    temperature_c: float = Field(allow_inf_nan=False)
    humidity_percent: float = Field(ge=0, le=100, allow_inf_nan=False)


class Request(BaseModel):
    readings: list[Reading] = Field(min_length=1, max_length=240)


def average_to_duty(current, forecast10, forecast60):
    avg = (current + forecast10 + forecast60) / 3
    duty = 0 if current < 65 else math.floor(7 + max(0, min(1, (avg-65)/35))*93 + .5)
    return avg, duty


@app.get('/health')
def health():
    return {'status': 'ok', 'api_version': 2, 'horizons_seconds': [10, 60],
            'model_loaded': True, 'serial_access': False}


@app.post('/forecast')
def forecast(request: Request):
    rows = request.readings
    if any(b.timestamp <= a.timestamp for a, b in zip(rows, rows[1:])):
        raise HTTPException(422, 'Timestamps must increase, in Unix seconds.')
    now = time.time()
    if not -2 <= now-rows[-1].timestamp <= 3:
        raise HTTPException(422, 'Fresh readings are required.')
    start = 0
    for i in range(1, len(rows)):
        if rows[i].timestamp-rows[i-1].timestamp > 3:
            start = i
    rows = rows[start:]
    h = rows[-1].humidity_percent
    reference = next((r for r in reversed(rows) if rows[-1].timestamp-r.timestamp >= 5), None)
    override = h >= 85 and reference is not None and h-reference.humidity_percent >= .3
    elapsed = rows[-1].timestamp-rows[0].timestamp
    result = {'api_version': 2, 'status': 'collecting', 'remaining_seconds': max(0, math.ceil(65-elapsed)),
              'source_timestamp': rows[-1].timestamp, 'current_humidity_percent': h,
              'forecast_10s': None, 'forecast_60s': None, 'average_rh': None,
              'prediction_base_timestamp': None, 'target_10s': None, 'target_60s': None,
              'requested_duty': 100 if override else 0,
              'mode': 'FULL_SPEED_RH_85_RISING' if override else ('OFF_BELOW_65' if h < 65 else 'WAITING_FOR_HISTORY'),
              'outside_training_range': not bundle['rh_range'][0] <= h <= bundle['rh_range'][1]}
    if elapsed >= 65:
        frame = pd.DataFrame([r.model_dump() for r in rows])
        frame.index = pd.to_datetime(frame.timestamp, unit='s', utc=True)
        grid = frame[['humidity_percent', 'temperature_c']].resample('1s').last().ffill().iloc[:-1]
        if len(grid) < 61:
            return result
        hs, ts = grid.humidity_percent.to_numpy(), grid.temperature_c.to_numpy()
        values = [hs[-1], ts[-1]] + [v for lag in (5,15,30,60)
                                   for v in (hs[-1]-hs[-1-lag], ts[-1]-ts[-1-lag])]
        predictions = {s: float(np.clip(values[0]+bundle['models'][s].predict([values])[0], 0, 100)) for s in (10,60)}
        avg, duty = average_to_duty(h, predictions[10], predictions[60])
        base = float(grid.index[-1].timestamp()+1)
        result.update(status='ready', forecast_10s=predictions[10], forecast_60s=predictions[60],
                      average_rh=avg, prediction_base_timestamp=base, target_10s=base+10, target_60s=base+60,
                      requested_duty=100 if override else duty,
                      mode='FULL_SPEED_RH_85_RISING' if override else ('OFF_BELOW_65' if h < 65 else 'AVERAGE_CONTROL'))
    return result


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=8000)
