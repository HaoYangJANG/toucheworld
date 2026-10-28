const scenes = [
 ['20261012-143733','Walk up and throw away trash'],['20261012-143810','Arrange the boxes'],['IMG_5212','Pick up the cola bottle'],
 ['IMG_5214','Put down the phone'],['IMG_5216','Move the cola bottle'],['IMG_5217','Place the bottle on the ground'],
 ['el_0021','Wash the cup',true],['clip-000173','Shake the coffee machine',true],['clip-000147','Adjust the desk lamp',true]
];
const wipeGrid=document.querySelector('#grid');
const wipeGroupContainers=[];
if(wipeGrid.dataset.domainGroups==='true'){
 for(const [domain,title] of [['out-of-domain','Out-of-domain results'],['in-domain','In-domain results']]){
  const group=document.createElement('section');group.className='wipe-domain-group';
  const heading=document.createElement('h3');heading.className='wipe-domain-title';heading.id=`${wipeGrid.id}-${domain}-title`;heading.textContent=title;
  group.setAttribute('aria-labelledby',heading.id);
  const gallery=document.createElement('div');gallery.className='wipe-grid';
  group.append(heading,gallery);wipeGrid.append(group);wipeGroupContainers.push(gallery);
 }
}
const cards = scenes.map(([id,name,teacherOnly],i) => {
 const file=`demo5_${id}_0.mp4`;
 const gtSource=teacherOnly?`samples/${id}/gt-h264.mp4`:`gt/${file}`;
 const resultSource=teacherOnly?`samples/${id}/teacher-h264.mp4`:`disk/${file}`;
 const card=document.createElement('section');
 card.innerHTML=`<h2>${name}</h2>
 <div class="stage"><video class="ours" muted playsinline preload="auto" src="${resultSource}"></video><video class="gt" muted playsinline preload="auto" src="${gtSource}"></video><div class="line"><span class="handle">‹ ›</span></div><input class="wipe" type="range" min="0" max="100" value="50" aria-label="${name} comparison position"><span class="badge left">Ground Truth</span><span class="badge right">ours</span></div>
 <div class="controls"><button type="button">Play</button><input class="seek" type="range" min="0" max="1000" value="0" aria-label="${name} playback position"><span class="time">0.00 / —</span></div><div class="status" role="status"></div>`;
 (wipeGroupContainers.length?wipeGroupContainers[i<6?0:1]:wipeGrid).append(card);
 const stage=card.querySelector('.stage'),gt=card.querySelector('.gt'),ours=card.querySelector('.ours'),button=card.querySelector('button'),seek=card.querySelector('.seek'),time=card.querySelector('.time'),status=card.querySelector('.status');
 let playing=false,visible=false,changing=false;
 const duration=()=>Math.min(gt.duration||Infinity,ours.duration||Infinity);
 function pause(){playing=false;gt.pause();ours.pause();button.textContent='Play'}
 async function play(){
  if(changing)return;
  playing=true;status.textContent='';
  if(gt.currentTime>=duration()-.05)gt.currentTime=0;
  ours.currentTime=gt.currentTime;
  try{await Promise.all([gt.play(),ours.play()]);if(!playing){gt.pause();ours.pause();return}button.textContent='Pause'}catch(e){pause();status.textContent='Click play to start. If playback still fails, check the local video files.'}
 }
 button.onclick=()=>playing?pause():play();
 card.querySelector('.wipe').oninput=e=>stage.style.setProperty('--split',`${e.target.value}%`);
 seek.oninput=()=>{const d=duration();if(Number.isFinite(d)){gt.currentTime=d*seek.value/1000;ours.currentTime=gt.currentTime;render()}};
 function render(){const d=duration();if(Number.isFinite(d)){seek.value=gt.currentTime/d*1000;time.textContent=`${gt.currentTime.toFixed(2)} / ${d.toFixed(2)}`}}
 gt.addEventListener('timeupdate',render);
 for(const v of [gt,ours]){
  v.addEventListener('loadedmetadata',()=>{if(v===gt)stage.style.aspectRatio=`${gt.videoWidth}/${gt.videoHeight}`;render()});
  v.addEventListener('error',()=>{pause();status.textContent='Video failed to load. Check that all media files are present.'});
  v.addEventListener('ended',()=>{if(playing){gt.currentTime=0;ours.currentTime=0;play()}});
 }
 // Correct drift against GT while preserving a common timeline.
 setInterval(()=>{if(playing&&!gt.seeking&&!ours.seeking&&ours.readyState>=3){if(Math.abs(gt.currentTime-ours.currentTime)>.065)ours.currentTime=gt.currentTime;if(gt.currentTime>=duration()-.045){gt.currentTime=0;ours.currentTime=0}}},80);
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)play();else pause()},{threshold:.25});observer.observe(stage);
 return {async switchVersion(version){if(teacherOnly)return;const resume=playing,t=gt.currentTime;pause();changing=true;status.textContent='Switching…';ours.src=`${version}/${file}`;ours.load();await new Promise(resolve=>{ours.addEventListener('loadeddata',resolve,{once:true});ours.addEventListener('error',resolve,{once:true})});changing=false;if(ours.error)return;gt.currentTime=Math.min(t,duration());ours.currentTime=gt.currentTime;status.textContent='';if(resume&&visible)play();},pause};
});
document.querySelector('#version').onchange=e=>cards.forEach(c=>c.switchVersion(e.target.value));
document.addEventListener('visibilitychange',()=>{if(document.hidden)cards.forEach(c=>c.pause())});
