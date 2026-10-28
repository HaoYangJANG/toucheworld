(() => {
 const labels = ['GT','Hand skeleton','Teacher','Causal'];
 const host = document.querySelector('#videos'), button = document.querySelector('#play'), seek = document.querySelector('#seek'), time = document.querySelector('#time'), status = document.querySelector('#status');
 if (!host || !button || !window.comparisonCases?.length) return;
 const saveData = Boolean(navigator.connection?.saveData);
 let videos = [], sources = [], playing = false, buffering = false, starting = false, loaded = false, near = false;
 let caseVersion = 0, playToken = 0, syncTimer = 0, currentNote = '', savedTime = 0, restoreTime = null, resumeSeek = false;
 const duration = () => videos.length ? Math.min(...videos.map(video => Number.isFinite(video.duration) ? video.duration : 0)) : 0;
 const stamp = value => Math.floor(value / 60) + ':' + String(Math.floor(value % 60)).padStart(2,'0');
 function render() {
  const d = duration(), t = videos[0]?.currentTime || 0;
  seek.disabled = !loaded || !d; seek.value = d ? t / d * 1000 : 0; time.textContent = stamp(t) + ' / ' + stamp(d);
 }
 function stopClock() { clearTimeout(syncTimer); syncTimer = 0; }
 function pause() {
  ++playToken; playing = false; buffering = false; starting = false; stopClock();
  videos.forEach(video => { video.pause(); video.preload = loaded ? 'metadata' : 'none'; });
  button.textContent = '▶'; button.setAttribute('aria-label','Play all videos');
  status.textContent = currentNote;
 }
 function attachSources() {
  if (loaded) return;
  loaded = true; restoreTime = savedTime;
  videos.forEach((video,index) => { video.preload = 'metadata'; video.src = sources[index]; });
 }
 function releaseSources() {
  if (!loaded) return;
  savedTime = Number.isFinite(videos[0]?.currentTime) ? videos[0].currentTime : savedTime; pause(); loaded = false; restoreTime = null;
  videos.forEach(video => { video.removeAttribute('src'); video.preload = 'none'; video.load(); });
  seek.disabled = true;
 }
 function sync() {
  syncTimer = 0;
  if (!playing || buffering || starting || document.hidden) return;
  const master = videos[0];
  if (!master.seeking) for (const video of videos.slice(1)) {
   if (!video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - master.currentTime) > .06) video.currentTime = master.currentTime;
  }
  render(); syncTimer = setTimeout(sync,100);
 }
 async function start() {
  if (starting || !videos.length || document.hidden) return;
  attachSources(); starting = true; playing = true; buffering = false;
  const token = ++playToken, groupVersion = caseVersion;
  const t = duration() && videos[0].currentTime >= duration() - .04 ? 0 : videos[0].currentTime;
  videos.forEach(video => { video.preload = 'auto'; if (video.readyState >= 1 && Math.abs(video.currentTime - t) > .025) video.currentTime = t; });
  button.textContent = 'Ⅱ'; button.setAttribute('aria-label','Pause all videos'); status.textContent = 'Loading all four videos…';
  try {
   await Promise.all(videos.map(video => video.play()));
   if (token !== playToken || groupVersion !== caseVersion) return;
   starting = false; status.textContent = currentNote; stopClock(); sync();
  } catch (error) {
   if (token !== playToken || groupVersion !== caseVersion) return;
   pause(); status.textContent = 'Playback did not start. Click play again.';
  }
 }
 function resumeBuffered() {
  if (playing && buffering && !starting && videos.every(video => video.readyState >= 3 && !video.seeking)) { buffering = false; start(); }
 }
 button.onclick = () => playing ? pause() : start();
 seek.addEventListener('input',() => {
  const d = duration(); if (!loaded || !d) return;
  resumeSeek = resumeSeek || playing; pause(); const t = d * Number(seek.value) / 1000;
  videos.forEach(video => { video.currentTime = t; }); savedTime = t; render();
 });
 seek.addEventListener('change',() => { if (resumeSeek) { resumeSeek = false; start(); } });
 function loadCase(index,requested = false) {
  const item = window.comparisonCases[index]; if (!item) return;
  pause(); ++caseVersion;
  videos.forEach(video => { video.removeAttribute('src'); video.load(); });
  videos = []; sources = []; loaded = false; savedTime = 0; restoreTime = null; resumeSeek = false;
  host.replaceChildren(); button.disabled = false; seek.disabled = true; seek.value = 0; status.textContent = '';
  document.querySelectorAll('#cases .case').forEach((element,i) => element.setAttribute('aria-pressed',String(i === index)));
  currentNote = item.note || ''; const token = caseVersion;
  labels.forEach((label,i) => {
   const column = document.createElement('div'); column.className = i === 3 ? 'featured' : '';
   const heading = document.createElement('h2'); heading.textContent = label;
   const frame = document.createElement('div'); frame.className = 'frame'; column.append(heading,frame); host.append(column);
   if (!item.sources[i]) { frame.textContent = label + ' coming soon'; frame.style.cssText = 'display:grid;place-items:center;background:#f1f2f4;color:#777'; return; }
   const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.preload = 'none';
   frame.append(video); videos.push(video); sources.push(item.sources[i]);
   video.addEventListener('loadedmetadata',() => {
    if (token !== caseVersion || !loaded) return;
    if (restoreTime !== null && videos.every(member => member.readyState >= 1)) {
     const target = Math.min(restoreTime,Math.max(0,duration() - .04));
     videos.forEach(member => { member.currentTime = target; }); restoreTime = null;
    }
    render();
   });
   video.addEventListener('loadeddata',() => { if (token === caseVersion && !playing) { status.textContent = currentNote; render(); } });
   video.addEventListener('error',() => { if (token === caseVersion && loaded) { releaseSources(); status.textContent = label + ' video failed to load. Click play to try again.'; } });
   video.addEventListener('ended',() => { if (token === caseVersion && playing) { pause(); videos.forEach(member => { member.currentTime = 0; }); savedTime = 0; render(); } });
   video.addEventListener('waiting',() => {
    if (token !== caseVersion || !playing || starting || buffering) return;
    buffering = true; stopClock(); videos.forEach(member => member.pause()); status.textContent = 'Buffering. All four videos will resume together…';
   });
   for (const event of ['canplay','seeked']) video.addEventListener(event,() => { if (token === caseVersion) resumeBuffered(); });
  });
  button.disabled = !videos.length;
  if ((near && !saveData) || requested) attachSources();
  render();
 }
 window.comparisonCases.forEach((item,index) => {
  const element = document.createElement('button'); element.className = 'case'; element.setAttribute('aria-pressed','false');
  if (item) {
   element.setAttribute('aria-label',item.name);
   const image = document.createElement('img'); image.src = item.poster; image.alt = ''; image.loading = 'lazy'; image.decoding = 'async';
   const label = document.createElement('span'); label.textContent = item.name; element.append(image,label); element.onclick = () => loadCase(index,true);
  } else { element.disabled = true; element.textContent = 'Case 0' + (index + 1) + ' · Coming soon'; }
  document.querySelector('#cases').append(element);
 });
 if ('IntersectionObserver' in window) {
  new IntersectionObserver(entries => {
   near = entries[0].isIntersecting;
   if (near && !saveData) attachSources(); else if (!near) releaseSources();
  }, {rootMargin:'300px 0px'}).observe(host);
  new IntersectionObserver(entries => { if (!entries[0].isIntersecting) pause(); }, {threshold:0}).observe(host);
 }
 document.addEventListener('visibilitychange',() => { if (document.hidden) pause(); });
 loadCase(0);
})();
