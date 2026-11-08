/* Forecast using the same scaler and trained Ridge coefficients as the Python model. */
(function(root){
const clip=x=>Math.max(0,Math.min(100,x));
function forecast(rows,bundle,now=Date.now()/1000){
 if(!Array.isArray(rows)||!rows.length)throw Error('No readings');
 for(let i=0;i<rows.length;i++){const r=rows[i];if(!Number.isFinite(r.timestamp)||!Number.isFinite(r.temperature_c)||!Number.isFinite(r.humidity_percent)||r.humidity_percent<0||r.humidity_percent>100||(i&&r.timestamp<=rows[i-1].timestamp))throw Error('Invalid readings')}
 if(now-rows.at(-1).timestamp>3||rows.at(-1).timestamp-now>2)throw Error('Stale readings');
 let start=0;for(let i=1;i<rows.length;i++)if(rows[i].timestamp-rows[i-1].timestamp>3)start=i;rows=rows.slice(start);
 const last=rows.at(-1),h=last.humidity_percent,ref=[...rows].reverse().find(r=>last.timestamp-r.timestamp>=5),override=h>=85&&ref&&h-ref.humidity_percent>=.3,elapsed=last.timestamp-rows[0].timestamp;
 const out={api_version:2,status:'collecting',remaining_seconds:Math.max(0,Math.ceil(65-elapsed)),source_timestamp:last.timestamp,current_humidity_percent:h,forecast_10s:null,forecast_60s:null,average_rh:null,target_10s:null,target_60s:null,requested_duty:override?100:0,mode:override?'FULL_SPEED_RH_85_RISING':h<65?'OFF_BELOW_65':'WAITING_FOR_HISTORY',outside_training_range:h<bundle.rh_range[0]||h>bundle.rh_range[1]};
 if(elapsed<65)return out;
 const bins=new Map();for(const r of rows)bins.set(Math.floor(r.timestamp),r);
 const first=Math.floor(rows[0].timestamp),end=Math.floor(last.timestamp),grid=[];let previous=null;
 for(let second=first;second<end;second++){previous=bins.get(second)||previous;if(previous)grid.push(previous)}
 if(grid.length<61)return out;
 const current=grid.at(-1),features=[current.humidity_percent,current.temperature_c];for(const lag of [5,15,30,60]){const old=grid.at(-1-lag);features.push(current.humidity_percent-old.humidity_percent,current.temperature_c-old.temperature_c)}
 const predict=seconds=>{const m=bundle.models[String(seconds)];if(!m||m.coef.length!==features.length)throw Error('Invalid model');let v=m.intercept;for(let i=0;i<features.length;i++)v+=((features[i]-m.mean[i])/m.scale[i])*m.coef[i];return clip(current.humidity_percent+v)};
 const f10=predict(10),f60=predict(60),avg=(h+f10+f60)/3,duty=h<65?0:Math.floor(7+Math.min(1,Math.max(0,(avg-65)/35))*93+.5),base=end;
 return {...out,status:'ready',forecast_10s:f10,forecast_60s:f60,average_rh:avg,target_10s:base+10,target_60s:base+60,requested_duty:override?100:duty,mode:override?'FULL_SPEED_RH_85_RISING':h<65?'OFF_BELOW_65':'AVERAGE_CONTROL'};
}
const api={forecast};if(typeof module!=='undefined')module.exports=api;else root.NaqaaModel=api;
})(globalThis);
