/* Local-only inference. Predictions are plotted at their target time. */
(()=>{
const panel=document.createElement('section');panel.className='glass forecast-panel';panel.id='forecast-panel';
panel.innerHTML='<div class="connection-heading"><div><p class="eyebrow" id="forecast-eyebrow"></p><h2 id="forecast-title"></h2></div><span class="state-badge" id="forecast-state"></span></div><div class="forecast-values"><div><span id="forecast-current-label"></span><strong id="forecast-current">—</strong></div><div class="forecast-prediction short"><span id="forecast-short-label"></span><strong id="forecast-short">—</strong><small id="forecast-short-time"></small></div><div class="forecast-prediction"><span id="forecast-next-label"></span><strong id="forecast-value">—</strong><small id="forecast-long-time"></small></div></div><p id="forecast-message" role="status" aria-live="polite"></p><div class="forecast-legend" id="forecast-legend"></div><div id="forecast-chart" class="forecast-chart"></div><p class="blower-note" id="forecast-error"></p><p class="blower-note" id="forecast-note"></p>';
document.getElementById('blower-panel').before(panel);
const el=id=>document.getElementById(id),tr=(en,ar)=>document.documentElement.lang==='ar'?ar:en;
const modelPromise=fetch('model-parameters.json?v=1').then(r=>{if(!r.ok)throw Error('Model unavailable');return r.json()});
let rows=[],observations=[],predictions=[],temp=null,humidity=null,epoch=0,lastPosted=0,inflight=false,result=null,mode='disconnected',controller=null,generation=0;
const time=s=>new Date(s*1000).toLocaleTimeString(document.documentElement.lang==='ar'?'ar-SA':'en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
function unavailable(){window.dispatchEvent(new CustomEvent('naqaa-forecast-unavailable'))}
function reset(clearChart=false){rows=[];temp=null;humidity=null;result=null;lastPosted=0;generation++;controller?.abort();mode='waiting';if(clearChart){observations=[];predictions=[]}unavailable()}
function chart(){const now=Date.now()/1000,start=now-600,end=now+60,x=t=>48+(t-start)/(end-start)*900,y=v=>210-v*1.9;
if(!observations.length)return '<div class="chart-empty">'+tr('Waiting for measured humidity','بانتظار الرطوبة المقاسة')+'</div>';
let svg='<svg viewBox="0 0 980 250" role="img" aria-label="'+tr('Measured humidity and forecasts at their target times','الرطوبة المقاسة والتوقعات عند أوقاتها المستهدفة')+'">';
for(let v=0;v<=100;v+=25)svg+='<path d="M48 '+y(v)+'H948" stroke="#cfb88b22"/><text x="38" y="'+(y(v)+4)+'" text-anchor="end" fill="#c5b69d" font-size="11">'+v+'</text>';
function line(points,color,dash=''){let path='',last=null;for(const p of points){if(p.t<start||p.t>end)continue;path+=(last!==null&&p.t-last<=3?'L':'M')+x(p.t).toFixed(1)+','+y(p.v).toFixed(1)+' ';last=p.t}return '<path d="'+path+'" fill="none" stroke="'+color+'" stroke-width="2" '+(dash?'stroke-dasharray="5 4"':'')+'/>'}
svg+=line(observations.map(o=>({t:o.timestamp,v:o.humidity_percent})),'#a9d7bf');
for(const [seconds,color] of [[10,'#efb363'],[60,'#9cdaeb']])svg+=line(predictions.map(p=>({t:p['target_'+seconds+'s'],v:p['forecast_'+seconds+'s']})),color,true);
svg+='<path d="M'+x(now)+' 12V210" stroke="#ead7b566" stroke-dasharray="3 4"/><text x="'+(x(now)-5)+'" y="12" text-anchor="end" fill="#d2c3ac" font-size="11">'+tr('Now','الآن')+'</text>';
for(let i=0;i<=4;i++){const t=start+(end-start)*i/4;svg+='<text x="'+x(t)+'" y="240" text-anchor="'+(i===0?'start':i===4?'end':'middle')+'" fill="#b4a58b" font-size="11">'+time(t)+'</text>'}return svg+'</svg>'}
function paint(){
el('forecast-eyebrow').textContent=tr('ENVIRONMENTAL INTELLIGENCE','الذكاء البيئي');el('forecast-title').textContent=tr('A clearer view of what comes next.','رؤية أوضح لما يأتي.');
el('forecast-current-label').textContent=tr('Current humidity','الرطوبة الحالية');el('forecast-short-label').textContent=tr('In 10 seconds','بعد 10 ثوانٍ');el('forecast-next-label').textContent=tr('In 1 minute','بعد دقيقة');
const fresh=connection.running&&humidity&&Date.now()-humidity.time<=3000,ready=mode==='ready'&&fresh&&result;
el('forecast-current').textContent=fresh?humidity.value.toFixed(2)+'%':'—';el('forecast-short').textContent=ready?result.forecast_10s.toFixed(2)+'%':'—';el('forecast-value').textContent=ready?result.forecast_60s.toFixed(2)+'%':'—';
el('forecast-short-time').textContent=ready?tr('Target: ','الوقت المستهدف: ')+time(result.target_10s):'';el('forecast-long-time').textContent=ready?tr('Target: ','الوقت المستهدف: ')+time(result.target_60s):'';
const labels={disconnected:tr('Disconnected','غير متصل'),waiting:tr('Awaiting readings','بانتظار القراءات'),collecting:tr('Collecting history','جمع البيانات'),ready:tr('Forecast ready','التوقع جاهز'),offline:tr('Service unavailable','الخدمة غير متاحة'),stale:tr('Awaiting fresh readings','بانتظار قراءات حديثة')};el('forecast-state').textContent=labels[mode];el('forecast-state').dataset.state=ready?'live':'disconnected';
const msgs={disconnected:tr('Connect your Arduino to begin.','وصّل الأردوينو للبدء.'),waiting:tr('Waiting for valid temperature and humidity readings.','بانتظار قراءات حرارة ورطوبة صالحة.'),collecting:tr('Building history · about '+(result?.remaining_seconds??65)+' seconds remaining.','جمع السجل · متبقي نحو '+(result?.remaining_seconds??65)+' ثانية.'),ready:result?.outside_training_range?tr('Outside training range · forecast unvalidated.','خارج نطاق التدريب · التوقع غير متحقق منه.'):tr('Live model estimates · not sensor measurements.','توقعات النموذج المباشرة · ليست قياسات مستشعر.'),offline:tr('The forecast model could not be loaded. Refresh the page and check your connection.','تعذر تحميل نموذج التوقع. حدّث الصفحة وتحقق من اتصالك.'),stale:tr('Readings stopped. Rebuilding continuous history.','توقفت القراءات. يلزم جمع سجل متصل جديد.')};el('forecast-message').textContent=msgs[mode];
el('forecast-legend').innerHTML='<span style="--key:#a9d7bf">'+tr('Measured','المقاسة')+'</span><span style="--key:#efb363">'+tr('10s forecast','توقع 10 ثوانٍ')+'</span><span style="--key:#9cdaeb">'+tr('60s forecast','توقع 60 ثانية')+'</span>';
el('forecast-chart').innerHTML=chart();
const errors=[10,60].map(s=>{const es=predictions.filter(p=>p['error_'+s]!==undefined);return s+'s: '+(es.length?(es.reduce((a,p)=>a+p['error_'+s],0)/es.length).toFixed(2)+' '+tr('RH points','نقطة رطوبة')+' ('+es.length+')':'—')});el('forecast-error').textContent=tr('Live mean absolute error · ','متوسط الخطأ المطلق المباشر · ')+errors.join(' · ');
el('forecast-note').textContent=tr('Last 10 minutes · dashed forecasts are shown at their target times. Errors use only matched actual readings. Automatic control starts when the device and forecast model are ready.','آخر 10 دقائق · التوقعات المتقطعة عند وقتها المستهدف. الخطأ يُحسب فقط عند توفر قراءة فعلية مقابلة. يبدأ التحكم التلقائي بعد جاهزية الجهاز ونموذج التوقع.');
}
addEventListener('naqaa-line',event=>{
if(!connection.running)return;if(epoch!==openedAt){reset(true);epoch=openedAt}
let p;try{p=JSON.parse(event.detail)}catch{}if(p?.naqaa===2&&p.sensor_ok===false){reset();mode='stale';return}
const now=Date.now();for(const [id,value] of NaqaaCore.parseLine(event.detail)){if(id===0)temp={value,time:now};if(id===1)humidity={value,time:now}}
if(temp&&humidity&&Math.abs(temp.time-humidity.time)<=3000&&temp.time>(rows.at(-1)?.temperature_time??0)&&humidity.time>(rows.at(-1)?.humidity_time??0)){
if(rows.length&&now/1000-rows.at(-1).timestamp>3){reset();return}
const stamp=Math.max(temp.time,humidity.time)/1000;if(rows.length&&stamp<=rows.at(-1).timestamp)return;
const row={timestamp:stamp,temperature_c:temp.value,humidity_percent:humidity.value,temperature_time:temp.time,humidity_time:humidity.time};rows.push(row);rows=rows.filter(r=>stamp-r.timestamp<=180).slice(-240);observations.push(row);observations=observations.filter(r=>stamp-r.timestamp<=600);
for(const p of predictions)for(const s of [10,60])if(p['error_'+s]===undefined&&Math.abs(stamp-p['target_'+s+'s'])<=1.5)p['error_'+s]=Math.abs(row.humidity_percent-p['forecast_'+s+'s']);
predictions=predictions.filter(p=>stamp-p.target_60s<=600);if(mode==='waiting'||mode==='stale')mode='collecting';
}});
async function tick(){
if(!connection.running){if(epoch||rows.length){reset();epoch=0}mode='disconnected';paint();return}if(epoch!==openedAt){reset(true);epoch=openedAt}
const last=rows.at(-1);if(!last){paint();return}if(Date.now()/1000-last.timestamp>3){reset();mode='stale';paint();return}paint();if(inflight||last.timestamp<=lastPosted)return;
inflight=true;lastPosted=last.timestamp;const version=generation,session=epoch;controller=new AbortController();const ownController=controller,timeout=setTimeout(()=>ownController.abort(),2500);
try{const bundle=await modelPromise;const data=NaqaaModel.forecast(rows,bundle);if(version!==generation||!connection.running)return;
if(!NaqaaControl.decision(data)||data.source_timestamp!==last.timestamp||data.status==='ready'&&![data.target_10s,data.target_60s].every(Number.isFinite))throw Error('API v2 required');
result=data;mode=data.status;if(data.status==='ready'&&predictions.at(-1)?.source_timestamp!==data.source_timestamp)predictions.push({...data});window.dispatchEvent(new CustomEvent('naqaa-forecast',{detail:{session,data}}));
}catch{if(version===generation){result=null;mode='offline';unavailable()}}finally{clearTimeout(timeout);inflight=false;paint()}}
new MutationObserver(paint).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});setInterval(tick,1000);paint();
})();
