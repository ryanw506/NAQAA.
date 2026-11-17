/* Hardware-independent protocol and transport. No simulated readings. */
(function(root){
const keys=['temperatureC','humidityPercent','panelVoltage'];
function valid(i,v){return typeof v==='number'&&Number.isFinite(v)&&(i!==1||(v>=0&&v<=100))&&(i!==2||(v>=0&&v<=25))}
function parseLine(line){
 const result=[];let object;try{object=JSON.parse(line)}catch{}
 if(object&&typeof object==='object'){
  if(object.naqaa===2){
   if(object.sensor_ok===true)[['temperature',0],['humidity',1]].forEach(([key,i])=>{if(valid(i,object[key]))result.push([i,object[key]])});
   if(valid(2,object.voltage))result.push([2,object.voltage]);
  }else keys.forEach((key,i)=>{if(valid(i,object[key]))result.push([i,object[key]])});
  return result;
 }
 const names=['Temperature','Humidity','(?:Panel\\s+)?Voltage'];
 names.forEach((name,i)=>{const match=line.match(new RegExp('(?:^|\\s)'+name+'\\s*[:=]\\s*([-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?)(?=\\s|[°%*]|V\\b|$)','i'));if(match&&valid(i,Number(match[1])))result.push([i,Number(match[1])])});
 return result;
}
class LineDecoder{constructor(onLine){this.decoder=new TextDecoder();this.buffer='';this.onLine=onLine}push(bytes){this.buffer+=this.decoder.decode(bytes,{stream:true});this.drain(false)}drain(final){const lines=this.buffer.split(/\r\n|\n|\r/);this.buffer=lines.pop();for(const line of lines)if(line.trim())this.onLine(line.trim());if(final&&this.buffer.trim()){this.onLine(this.buffer.trim());this.buffer=''}if(this.buffer.length>8192)this.buffer=''}finish(){this.buffer+=this.decoder.decode();this.drain(true)}}
class SerialConnection{constructor(onLine){this.onLine=onLine;this.port=null;this.reader=null;this.stopping=false;this.running=false}async start(port,baud,onOpen){if(this.running)throw new Error('Already running');this.running=true;this.stopping=false;this.port=port;let opened=false;try{await port.open({baudRate:baud});opened=true;onOpen();if(!port.readable)throw new Error('Port is not readable');this.reader=port.readable.getReader();const decoder=new LineDecoder(this.onLine);while(!this.stopping){const {value,done}=await this.reader.read();if(done)break;decoder.push(value)}decoder.finish()}finally{this.reader?.releaseLock();this.reader=null;if(opened)try{await port.close()}catch{}this.port=null;this.running=false}}async stop(){this.stopping=true;try{await this.reader?.cancel()}catch{}}}
const api={keys,valid,parseLine,LineDecoder,SerialConnection};if(typeof module!=='undefined')module.exports=api;else root.NaqaaCore=api;
})(globalThis);
