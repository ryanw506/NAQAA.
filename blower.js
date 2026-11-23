/* Protocol v2 only. Automatic control is opt-in and never persisted. */
(()=>{
const by=id=>document.getElementById(id),tr=(en,ar)=>document.documentElement.lang==='ar'?ar:en;
by('blower-panel').hidden=false;
const gauge=document.createElement('div');gauge.className='duty-gauge';gauge.innerHTML='<div class="duty-gauge-inner"><span id="gauge-value">—</span><small id="gauge-label"></small></div>';by('blower-duty').parentElement.prepend(gauge);
const modes=document.createElement('div');modes.className='auto-controls';modes.innerHTML='<label><input type="checkbox" id="auto-enable"><span id="auto-label"></span></label><span id="auto-policy"></span>';by('blower-controls').before(modes);
const manual=document.createElement('details');manual.className='manual-controls';manual.innerHTML='<summary id="manual-label"></summary>';by('blower-controls').before(manual);manual.appendChild(by('blower-controls'));
const voltageNote=document.createElement('p');voltageNote.className='blower-note';voltageNote.setAttribute('role','status');modes.appendChild(voltageNote);
let armed=false,port=null,epoch=0,verified=false,telemetry=null,lastAck=0,lastSend=0,lastMatched=0,auto=false,desired=0,pending=false,policy=null,version=0,chain=Promise.resolve(),message='connect',autoSince=0;
const reasons={connect:['Connect a Nano with compatible firmware.','وصّل النانو ببرنامج متوافق.'],waiting:['Waiting for firmware tag naqaa:2. Old firmware cannot control this panel.','بانتظار تعريف naqaa:2؛ البرنامج القديم لا يدعم هذه الخانة.'],confirmed:['Nano confirmed the blower setting.','أكد النانو قوة تشغيل المنفاخ.'],pending:['Command sent; waiting for Nano confirmation.','أُرسل الأمر؛ بانتظار تأكيد النانو.'],stale:['Telemetry stopped. Automatic control disabled; STOP requested.','توقفت بيانات النانو. عُطّل التلقائي وطُلب الإيقاف.'],sensor:['Invalid sensor data. Automatic control disabled; STOP requested.','قراءات المستشعر غير صالحة. عُطّل التلقائي وطُلب الإيقاف.'],service:['Prediction unavailable. Automatic control disabled; STOP requested.','التوقع غير متاح. عُطّل التلقائي وطُلب الإيقاف.'],stopped:['STOP requested. Automatic control is off.','طُلب الإيقاف. التحكم التلقائي مطفأ.'],failed:['USB write failed. Use the physical switch if needed.','تعذر إرسال الأمر. استخدم المفتاح الفعلي عند الحاجة.'],background:['Automatic control stopped because the page is in the background.','أُوقف التحكم التلقائي لأن الصفحة في الخلفية.'],invalid:['Enter a whole number from 0 to 100.','أدخل عددًا صحيحًا من 0 إلى 100.']};
const policyNames={OFF_BELOW_65:['Off · RH below 65%','متوقف · الرطوبة أقل من 65%'],WAITING_FOR_HISTORY:['Waiting for prediction history','بانتظار سجل التوقع'],AVERAGE_CONTROL:['Current + 10s + 60s average','متوسط الحالية وتوقعي 10 و60 ثانية'],FULL_SPEED_RH_85_RISING:['Full duty · RH ≥85% and rising','قوة كاملة · الرطوبة ≥85% وترتفع']};
function policyFresh(){return policy&&Date.now()-policy.received<3000&&Date.now()/1000-policy.data.source_timestamp<=3}
function humidityDuty(){
 if(policyFresh())return policy.data.requested_duty;
 const rh=telemetry.humidity;
 return rh<65?0:Math.round(7+Math.min(1,(rh-65)/35)*93);
}
function humidityPolicyText(){
 return policyFresh()?policyNames[policy.data.mode][document.documentElement.lang==='ar'?1:0]:tr('Forecast unavailable · controlling from measured humidity','التوقع غير متاح · التحكم حسب الرطوبة المقاسة');
}
function fresh(){return verified&&telemetry&&Date.now()-lastAck<3000}
function paint(){const live=fresh(),usable=live&&telemetry.sensor_ok;
voltageNote.textContent=!live?'':(telemetry.voltage_rule!==1||telemetry.voltage_limit!==5)?tr('Upload the updated Nano firmware to enable the 5 V / 90 s rule.','ارفع كود النانو الجديد لتفعيل شرط 5 فولت و90 ثانية.'):!auto?tr('Automatic mode enables the voltage rule · ≤5 V for 90 s → 100% power.','الوضع التلقائي يفعّل شرط الجهد · 5 فولت أو أقل لمدة 90 ثانية ← قوة 100٪.'):telemetry.voltage_auto===true?tr('Voltage remained ≤5 V for 90 s · full power (100%).','استمر الجهد 5 فولت أو أقل لمدة 90 ثانية · قوة كاملة 100٪.'):telemetry.voltage_wait_seconds>0?tr('Low voltage · confirming conditions, ','جهد منخفض · التحقق من استمرار الانخفاض، ')+telemetry.voltage_wait_seconds+tr(' seconds remaining. Humidity control continues.',' ثانية متبقية. تحكم الرطوبة مستمر.'):tr('Humidity control active · voltage rule waits for ≤5 V.','تحكم الرطوبة يعمل · شرط الفولت ينتظر قراءة 5 فولت أو أقل.');
by('manual-label').textContent=tr('Manual speed control','التحكم اليدوي بالسرعة');by('auto-label').textContent=tr('Automatic control','التحكم التلقائي');by('auto-enable').closest('.auto-controls').dataset.active=auto?'true':'false';by('auto-enable').checked=auto;by('auto-enable').disabled=!usable;
by('auto-policy').textContent=armed?tr('Waiting for device and forecast model','بانتظار الجهاز ونموذج التوقع'):auto?humidityPolicyText():tr('Manual mode · automatic is off','الوضع اليدوي · التلقائي مطفأ');
by('blower-duty').textContent=live?telemetry.applied+'%':'—';by('gauge-value').textContent=live?telemetry.applied+'%':'—';by('gauge-label').textContent=tr('BLOWER POWER','قوة تشغيل المنفاخ');gauge.style.setProperty('--duty',live?telemetry.applied:0);gauge.dataset.fresh=live?'true':'false';const rpm=live&&typeof telemetry.rpm==='number'?Math.round(telemetry.rpm):null;
by('blower-rpm').textContent=rpm===null?'—':rpm.toLocaleString(document.documentElement.lang);by('blower-rpm-note').textContent=rpm===null?tr('No tach feedback available','لا توجد إشارة سرعة متاحة'):telemetry.applied>0&&rpm===0?tr('No rotation detected · check tach / blower','لم يُرصد دوران · تحقق من المنفاخ وإشارة السرعة'):tr('Tach feedback · assumes 2 pulses/revolution','إشارة Tach · بافتراض نبضتين لكل دورة');
by('blower-state').textContent=!live?tr('Unconfirmed','غير مؤكد'):telemetry.applied>0?tr('Running','يعمل'):tr('Stopped','متوقف');by('blower-state').dataset.state=live&&telemetry.applied>0?'live':'disconnected';
by('blower-controls').disabled=!usable||auto;by('blower-stop').disabled=!verified||!port;
const r=reasons[message];by('blower-message').textContent=tr(r[0],r[1])+' '+tr('Requested: ','المطلوب: ')+(verified?desired+'%':'—');}
function sync(){const next=connection.running&&connection.port?.writable?connection.port:null;if(next!==port||epoch!==openedAt){version++;port=next;epoch=openedAt;verified=false;telemetry=null;auto=false;armed=false;desired=0;pending=false;policy=null;lastAck=lastSend=lastMatched=0;message=port?'waiting':'connect'}}
function send(duty){const target=port,token=version;if(!target||!verified)return Promise.resolve();lastSend=Date.now();if(desired!==duty||!pending)lastMatched=Date.now();desired=duty;pending=true;
const command=auto&&telemetry?.voltage_rule===1&&telemetry.voltage_limit===5?'V:'+duty+'\n':NaqaaControl.command(duty);
const task=chain.then(async()=>{if(token!==version||target!==port)return;const writer=target.writable.getWriter();try{await writer.write(new TextEncoder().encode(command))}finally{writer.releaseLock()}});chain=task.catch(()=>{});task.catch(()=>{if(token===version){auto=false;desired=0;message='failed';paint()}});return task;}
function stop(reason='stopped'){armed=false;auto=false;desired=0;version++;message=reason;const task=send(0);paint();return task}
by('auto-enable').onchange=()=>{const enabled=by('auto-enable').checked;armed=false;sync();if(enabled&&fresh()&&telemetry.sensor_ok&&!document.hidden){auto=true;autoSince=Date.now();message='pending';send(0)}else stop();paint()};
function value(){const n=by('blower-number').valueAsNumber;return Number.isInteger(n)&&n>=0&&n<=100?n:null}
by('blower-range').oninput=()=>by('blower-number').value=by('blower-range').value;by('blower-number').oninput=()=>{const n=value();if(n!==null)by('blower-range').value=n};
by('blower-apply').onclick=()=>{const n=value();if(n===null){message='invalid';paint();return}if(!auto&&fresh()&&telemetry.sensor_ok){armed=false;send(n);message='pending';paint()}};
by('blower-start').onclick=()=>{const n=value();if(n===null){message='invalid';paint();return}if(!auto&&fresh()&&telemetry.sensor_ok){armed=false;message='pending';send(n);paint()}};
by('blower-stop').onclick=()=>stop();
addEventListener('naqaa-line',event=>{sync();if(!port)return;const p=NaqaaControl.packet(event.detail);if(!p)return;const first=!verified;verified=true;telemetry=p;lastAck=Date.now();if(first){message='pending';send(0)}if(!p.sensor_ok){if(auto||desired!==0)stop('sensor');else message='sensor'}if(p.applied===(auto&&p.voltage_auto===true?100:desired)){pending=false;lastMatched=Date.now();if(['pending','waiting'].includes(message))message='confirmed'}paint()});
addEventListener('naqaa-forecast',event=>{const d=event.detail;if(d.session!==epoch||!NaqaaControl.decision(d.data))return;policy={...d,received:Date.now()};paint()});
addEventListener('naqaa-forecast-unavailable',()=>{policy=null;paint()});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&auto)stop('background')});
setInterval(()=>{sync();if(port&&verified){if(!fresh()){if(auto||desired!==0)stop('stale');message='stale'}if(pending&&Date.now()-lastMatched>3000&&desired!==0)stop('stale');if(auto){if(!fresh()||!telemetry.sensor_ok)stop('sensor');else{const n=humidityDuty();if(n!==desired){message='pending';send(n)}}}if(Date.now()-lastSend>=1000)send(fresh()&&telemetry.sensor_ok?desired:0)}paint()},200);
window.NaqaaBlower={stop};paint();
})();
