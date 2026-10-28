const labels=['GT','Hand skeleton','Teacher','Causal'];
const host=document.querySelector('#videos'),button=document.querySelector('#play'),seek=document.querySelector('#seek'),time=document.querySelector('#time'),status=document.querySelector('#status');
let videos=[],playing=false,version=0,buffering=false,starting=false,currentNote='';
const duration=()=>Math.min(...videos.map(v=>Number.isFinite(v.duration)?v.duration:0));
const stamp=t=>`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`; // taste-skill-ignore: MM:SS playback clock.
function render(){const d=duration(),t=videos[0]?.currentTime||0;seek.value=d?t/d*1000:0;time.textContent=`${stamp(t)} / ${stamp(d||0)}`}
function pause(){playing=false;buffering=false;videos.forEach(v=>v.pause());button.textContent='▶';button.setAttribute('aria-label','Play all')}
async function start(){
 if(starting||!videos.length||videos.some(v=>v.readyState<2))return;
 starting=true;playing=true;const token=version;
 const t=videos[0].currentTime>=duration()-.04?0:videos[0].currentTime;
 videos.forEach(v=>{if(Math.abs(v.currentTime-t)>.025)v.currentTime=t});
 try{await Promise.all(videos.map(v=>v.play()));if(token!==version)return;if(!playing){videos.forEach(v=>v.pause());return}button.textContent='Ⅱ';button.setAttribute('aria-label','Pause all');status.textContent=currentNote}
 catch(e){if(token===version){pause();status.textContent='Playback did not start. Click play again.'}}
 finally{if(token===version)starting=false}
}
button.onclick=()=>playing?pause():start();
let resumeSeek=false;
seek.addEventListener('input',()=>{resumeSeek=resumeSeek||playing;pause();const t=duration()*Number(seek.value)/1000;videos.forEach(v=>v.currentTime=t);render()});
seek.addEventListener('change',()=>{if(resumeSeek){resumeSeek=false;start()}});
function loadCase(index){
 pause();version++;starting=false;resumeSeek=false;videos=[];host.replaceChildren();button.disabled=true;seek.disabled=true;seek.value=0;status.textContent='Loading all four videos…';
 document.querySelectorAll('#cases .case').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));
 const item=window.comparisonCases[index];
 currentNote=item.note||'';
 const expected=item.sources.filter(Boolean).length;
 labels.forEach((label,i)=>{
  const column=document.createElement('div');column.className=i===3?'featured':'';
  const heading=document.createElement('h2');heading.textContent=label;
  const frame=document.createElement('div');frame.className='frame';column.append(heading,frame);host.append(column);
  if(!item.sources[i]){frame.textContent=`${label} coming soon`;frame.style.cssText='display:grid;place-items:center;background:#f1f2f4;color:#777';return}
  const v=document.createElement('video');v.muted=true;v.playsInline=true;v.preload='auto';frame.append(v);videos.push(v);
  v.addEventListener('loadeddata',()=>{if(videos.length===expected&&videos.every(x=>x.readyState>=2)){button.disabled=false;seek.disabled=false;status.textContent=currentNote;render()}});
  v.addEventListener('error',()=>{pause();button.disabled=true;seek.disabled=true;status.textContent=`${label} video failed to load. Check the file.`});
  v.addEventListener('ended',()=>{if(playing){pause();videos.forEach(x=>x.currentTime=0);render()}});
  v.addEventListener('waiting',()=>{if(playing&&!starting){buffering=true;videos.forEach(x=>x.pause());status.textContent='Buffering. All four videos will resume together…'}});
  v.src=item.sources[i];
 });
 render();
}
window.comparisonCases.forEach((item,i)=>{const b=document.createElement('button');b.className='case';b.setAttribute('aria-pressed','false');if(item){b.setAttribute('aria-label',item.name);const img=document.createElement('img');img.src=item.poster;img.alt='';const label=document.createElement('span');label.textContent=item.name;b.append(img,label);b.onclick=()=>loadCase(i)}else{b.disabled=true;b.textContent=`Case 0${i+1} · Coming soon`}document.querySelector('#cases').append(b)});
setInterval(()=>{
 if(playing&&buffering&&!starting&&videos.every(v=>v.readyState>=3&&!v.seeking)){buffering=false;start()}
 if(playing&&!buffering&&!starting){const master=videos[0];for(const v of videos.slice(1)){if(!v.seeking&&Math.abs(v.currentTime-master.currentTime)>.06)v.currentTime=master.currentTime}}
 render();
},80);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});
loadCase(0);
