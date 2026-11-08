(function(root){
const finite=n=>typeof n==='number'&&Number.isFinite(n);
function packet(line){let p;try{p=JSON.parse(line)}catch{return null}if(!p||p.naqaa!==2||typeof p.sensor_ok!=='boolean'||!Number.isInteger(p.applied)||p.applied<0||p.applied>100)return null;if(p.rpm!=null&&(!finite(p.rpm)||p.rpm<0))return null;return {...p,sensor_ok:p.sensor_ok&&finite(p.temperature)&&finite(p.humidity)&&p.humidity>=0&&p.humidity<=100}}
function decision(d){return d&&d.api_version===2&&['ready','collecting'].includes(d.status)&&Number.isInteger(d.requested_duty)&&d.requested_duty>=0&&d.requested_duty<=100&&finite(d.source_timestamp)&&['OFF_BELOW_65','WAITING_FOR_HISTORY','FULL_SPEED_RH_85_RISING','AVERAGE_CONTROL'].includes(d.mode)&&(d.status!=='ready'||[d.forecast_10s,d.forecast_60s].every(v=>finite(v)&&v>=0&&v<=100))}
function command(n){if(!Number.isInteger(n)||n<0||n>100)throw Error('Invalid duty');return 'D:'+n+'\n'}
const api={packet,decision,command};if(typeof module!=='undefined')module.exports=api;else root.NaqaaControl=api;
})(globalThis);
