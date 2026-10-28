(() => {
 const scenes = [
  ['20261012-143733','Walk up and throw away trash'],['20261012-143810','Arrange the boxes'],['IMG_5212','Pick up the cola bottle'],
  ['IMG_5214','Put down the phone'],['IMG_5216','Move the cola bottle'],['IMG_5217','Place the bottle on the ground'],
  ['el_0021','Wash the cup',true],['clip-000173','Shake the coffee machine',true],['clip-000147','Adjust the desk lamp',true]
 ];
 const grid = document.querySelector('#grid');
 if (!grid) return;
 const groups = [];
 const saveData = Boolean(navigator.connection?.saveData);
 const controllers = new Map();
 let activeStage = null;
 const nearObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  entries.forEach(entry => controllers.get(entry.target)?.setNear(entry.isIntersecting));
 }, {rootMargin:'300px 0px'}) : null;
 const visibleObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  entries.forEach(entry => controllers.get(entry.target)?.setVisible(entry.isIntersecting && entry.intersectionRatio >= .25));
 }, {threshold:[0,.25]}) : null;
 if (grid.dataset.domainGroups === 'true') {
  for (const [domain,title] of [['out-of-domain','Out-of-domain results'],['in-domain','In-domain results']]) {
   const group = document.createElement('section'); group.className = 'wipe-domain-group';
   const heading = document.createElement('h3'); heading.className = 'wipe-domain-title'; heading.id = grid.id + '-' + domain + '-title'; heading.textContent = title;
   group.setAttribute('aria-labelledby',heading.id);
   const gallery = document.createElement('div'); gallery.className = 'wipe-grid';
   group.append(heading,gallery); grid.append(group); groups.push(gallery);
  }
 }
 const cards = scenes.map(([id,name,teacherOnly],i) => {
  const file = 'demo5_' + id + '_0.mp4';
  const gtSource = teacherOnly ? 'samples/' + id + '/gt-h264.mp4' : 'gt/' + file;
  const card = document.createElement('section');
  card.innerHTML = '<h2>' + name + '</h2>' +
   '<div class="stage"><video class="ours" muted playsinline preload="none"></video><video class="gt" muted playsinline preload="none"></video><div class="line"><span class="handle">‹ ›</span></div><input class="wipe" type="range" min="0" max="100" value="50" aria-label="' + name + ' comparison position"><span class="badge left">Ground Truth</span><span class="badge right">ours</span></div>' +
   '<div class="controls"><button type="button">Play</button><input class="seek" type="range" min="0" max="1000" value="0" aria-label="' + name + ' playback position" disabled><span class="time">0.00 / —</span></div><div class="status" role="status"></div>';
  (groups.length ? groups[i < 6 ? 0 : 1] : grid).append(card);
  const stage = card.querySelector('.stage'), gt = card.querySelector('.gt'), ours = card.querySelector('.ours');
  const button = card.querySelector('button'), seek = card.querySelector('.seek'), time = card.querySelector('.time'), status = card.querySelector('.status');
  let selectedVersion = document.querySelector('#version')?.value || 'disk';
  let attached = false, near = false, visible = false, playing = false, starting = false;
  let playToken = 0, syncTimer = 0, savedTime = 0, restoreTime = null;
  const resultSource = () => teacherOnly ? 'samples/' + id + '/teacher-h264.mp4' : selectedVersion + '/' + file;
  const duration = () => [gt,ours].every(video => video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0) ? Math.min(gt.duration,ours.duration) : 0;
  function render() {
   const d = duration();
   seek.disabled = !attached || !d;
   if (d) { seek.value = gt.currentTime / d * 1000; time.textContent = gt.currentTime.toFixed(2) + ' / ' + d.toFixed(2); }
  }
  function stopClock() { clearTimeout(syncTimer); syncTimer = 0; }
  function pause() {
   ++playToken; playing = false; starting = false; stopClock();
   if (activeStage === stage) activeStage = null;
   gt.pause(); ours.pause(); button.textContent = 'Play';
   gt.preload = ours.preload = attached ? 'metadata' : 'none';
  }
  function load() {
   if (attached) return;
   attached = true; restoreTime = savedTime;
   gt.preload = ours.preload = 'metadata';
   gt.src = gtSource; ours.src = resultSource();
  }
  function unload() {
   if (!attached) return;
   savedTime = Number.isFinite(gt.currentTime) ? gt.currentTime : savedTime; pause(); attached = false; restoreTime = null;
   for (const video of [gt,ours]) { video.removeAttribute('src'); video.preload = 'none'; video.load(); }
   seek.disabled = true;
  }
  function sync() {
   syncTimer = 0;
   if (!playing || document.hidden) return;
   if (!gt.seeking && !ours.seeking && ours.readyState >= 3 && Math.abs(gt.currentTime - ours.currentTime) > .065) ours.currentTime = gt.currentTime;
   render(); syncTimer = setTimeout(sync,100);
  }
  async function play() {
   if (document.hidden || starting) return;
   if (activeStage && activeStage !== stage) controllers.get(activeStage)?.pause();
   activeStage = stage;
   load(); playing = true; starting = true; const token = ++playToken;
   status.textContent = ''; button.textContent = 'Pause';
   gt.preload = ours.preload = 'auto';
   if (duration() && gt.currentTime >= duration() - .05) gt.currentTime = 0;
   if (ours.readyState >= 1) ours.currentTime = gt.currentTime;
   try {
    await Promise.all([gt.play(),ours.play()]);
    if (token !== playToken) return;
    starting = false; stopClock(); sync();
   } catch (error) {
    if (token !== playToken) return;
    pause(); status.textContent = 'Click play to start. If playback still fails, try again.';
   }
  }
  button.onclick = () => playing ? pause() : play();
  card.querySelector('.wipe').oninput = event => stage.style.setProperty('--split',event.target.value + '%');
  seek.oninput = () => {
   const d = duration();
   if (attached && d) { restoreTime = null; gt.currentTime = d * seek.value / 1000; ours.currentTime = gt.currentTime; savedTime = gt.currentTime; render(); }
  };
  gt.addEventListener('timeupdate',render);
  for (const video of [gt,ours]) {
   video.addEventListener('loadedmetadata',() => {
    if (!attached) return;
    if (video === gt && gt.videoWidth && gt.videoHeight) stage.style.aspectRatio = gt.videoWidth + '/' + gt.videoHeight;
    if (restoreTime !== null && duration()) {
     const target = Math.min(restoreTime,Math.max(0,duration() - .05));
     gt.currentTime = ours.currentTime = Number.isFinite(target) ? target : 0; restoreTime = null;
    }
    render();
   });
   video.addEventListener('error',() => { if (attached) { unload(); status.textContent = 'Video failed to load. Click play to try again.'; } });
   video.addEventListener('ended',() => {
    if (!playing || !video.ended) return;
    pause(); gt.currentTime = ours.currentTime = savedTime = 0;
    if (visible && !document.hidden) play();
   });
  }
  const controller = {
   pause,
   setNear(value) {
    near = value;
    if (near && !saveData) load();
    else if (!near) { visible = false; unload(); }
   },
   setVisible(value) {
    visible = value;
    if (!visible) pause();
   },
   switchVersion(value) {
    if (teacherOnly || !['disk','plain'].includes(value) || value === selectedVersion) return;
    const resume = playing;
    if (attached && Number.isFinite(gt.currentTime)) savedTime = gt.currentTime;
    unload(); selectedVersion = value;
    if (near && !saveData) load();
    if (resume && visible && !document.hidden) play();
   }
  };
  controllers.set(stage,controller);
  nearObserver?.observe(stage); visibleObserver?.observe(stage);
  return controller;
 });
 const versionControl = document.querySelector('#version');
 if (versionControl) versionControl.onchange = event => cards.forEach(card => card.switchVersion(event.target.value));
 document.addEventListener('visibilitychange',() => { if (document.hidden) cards.forEach(card => card.pause()); });
})();
