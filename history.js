/* Retains genuine observations as minute aggregates for 24 hours. */
(function(root){
const MINUTE=60000,DAY=86400000;
class HistoryStore{
 constructor(){this.data=Array.from({length:4},()=>new Map());this.latest=Array(4).fill(null)}
 add(sensor,value,time=Date.now()){
  if(!Number.isInteger(sensor)||sensor<0||sensor>3||!Number.isFinite(value)||!Number.isFinite(time))return;
  const minute=Math.floor(time/MINUTE)*MINUTE,map=this.data[sensor];let b=map.get(minute);
  if(!b){b={minute,sum:0,count:0,min:value,max:value,last:value,time,first:time};map.set(minute,b)}
  b.sum+=value;b.count++;b.min=Math.min(b.min,value);b.max=Math.max(b.max,value);b.first=Math.min(b.first,time);
  if(time>=b.time){b.last=value;b.time=time}if(!this.latest[sensor]||time>=this.latest[sensor].time)this.latest[sensor]={value,time};
 }
 prune(now=Date.now()){const cutoff=Math.floor((now-DAY)/MINUTE)*MINUTE;for(const map of this.data)for(const minute of map.keys())if(minute<cutoff)map.delete(minute);this.latest=this.latest.map(p=>p&&p.time>=now-DAY?p:null)}
 range(sensor,hours,now=Date.now()){
  // Minute resolution; include only buckets whose final observation lies within the requested window.
  const cutoff=now-hours*3600000;return [...this.data[sensor].values()].filter(b=>b.time>=cutoff&&b.time<=now).sort((a,b)=>a.minute-b.minute)
 }
 stats(buckets){if(!buckets.length)return{min:null,max:null,average:null,count:0};let min=Infinity,max=-Infinity,sum=0,count=0;for(const b of buckets){min=Math.min(min,b.min);max=Math.max(max,b.max);sum+=b.sum;count+=b.count}return{min,max,average:sum/count,count}}
 serialize(now=Date.now()){this.prune(now);return JSON.stringify({version:1,data:this.data.map(m=>[...m.values()])})}
 restore(text,now=Date.now()){let parsed;try{parsed=JSON.parse(text)}catch{return}if(parsed?.version!==1||!Array.isArray(parsed.data)||parsed.data.length!==4)return;
  parsed.data.forEach((rows,i)=>{if(!Array.isArray(rows))return;for(const b of rows){if(!b||!['minute','sum','count','min','max','last','time','first'].every(k=>typeof b[k]==='number'&&Number.isFinite(b[k])))continue;if(!Number.isInteger(b.count)||b.count<1||b.minute%MINUTE!==0||b.time<b.minute||b.time>=b.minute+MINUTE||b.first>b.time||b.first<b.minute||b.min>b.max||b.last<b.min||b.last>b.max||b.time>now||b.time<now-DAY)continue;this.data[i].set(b.minute,{...b});if(!this.latest[i]||b.time>this.latest[i].time)this.latest[i]={value:b.last,time:b.time}}});this.prune(now)
 }
}
function segments(buckets){const groups=[];for(const bucket of buckets){const group=groups.at(-1);if(!group||bucket.minute-group.at(-1).minute>MINUTE)groups.push([bucket]);else group.push(bucket)}return groups}
const api={HistoryStore,segments};if(typeof module!=='undefined')module.exports=api;else root.NaqaaHistory=api;
})(globalThis);
