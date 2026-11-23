/* P opens an uncluttered, vertically scrolling view of the live site. */
(()=>{
 const body=document.body,dashboard=document.getElementById('readings');
 const overview=document.createElement('div');overview.className='presentation-overview';
 const heading=dashboard.querySelector('.section-heading'),cards=document.getElementById('cards');
 heading.before(overview);overview.append(heading,cards);
 const blower=document.getElementById('blower-panel'),connection=document.getElementById('connection');
 const controls=document.createElement('div');controls.className='showcase-controls';
 blower.before(controls);controls.append(blower,connection);
 const sections=[overview,document.getElementById('forecast-panel'),controls];
 sections.forEach(section=>section.classList.add('showcase-section'));
 const video=document.createElement('div');video.className='video-resource';
 const videoLink=document.createElement('a');
 videoLink.href='https://youtu.be/mZ1OZCOTwSU';videoLink.target='_blank';videoLink.rel='noopener noreferrer';
 videoLink.dataset.en='EDS explained on YouTube ↗';videoLink.dataset.ar='شرح EDS على YouTube ↗';
 videoLink.textContent=videoLink.dataset[document.documentElement.lang==='ar'?'ar':'en'];
 video.appendChild(videoLink);dashboard.appendChild(video);
 let active=false,entering=false,ownedFullscreen=false,previousFocus=null,previousScroll=0;
 async function enter(){
  if(active||entering)return;
  entering=true;previousFocus=document.activeElement;previousScroll=window.scrollY;
  active=true;body.classList.add('presentation-view');dashboard.tabIndex=-1;
  dashboard.scrollTop=0;window.scrollTo(0,0);dashboard.focus({preventScroll:true});
  try{
   if(!document.fullscreenElement&&document.documentElement.requestFullscreen){
    await document.documentElement.requestFullscreen();ownedFullscreen=true;
    if(!active){ownedFullscreen=false;await document.exitFullscreen()}
   }
  }catch{}finally{entering=false}
 }
 function exit(){
  if(!active)return;
  active=false;body.classList.remove('presentation-view');dashboard.removeAttribute('tabindex');
  if(ownedFullscreen&&document.fullscreenElement)document.exitFullscreen().catch(()=>{});
  ownedFullscreen=false;window.scrollTo(0,previousScroll);previousFocus?.focus?.({preventScroll:true});
 }
 document.addEventListener('keydown',event=>{
  if(event.ctrlKey||event.altKey||event.metaKey||event.repeat||event.isComposing)return;
  if(event.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
  if(document.querySelector('dialog[open]'))return;
  if(event.code==='KeyP'){event.preventDefault();active?exit():enter()}
  else if(active&&event.key==='Escape'){event.preventDefault();exit()}
 });
 document.addEventListener('fullscreenchange',()=>{
  if(active&&ownedFullscreen&&!document.fullscreenElement)exit();
 });
})();
