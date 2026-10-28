/* TouchéWorld's first-person hand: a photographic sprite, never an artificial arm. */
(() => {
  'use strict';

  const ownScript = document.currentScript;
  const capability = window.matchMedia('(any-hover: hover) and (any-pointer: fine)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const preferenceKey = 'toucheworld:hand:v2';
  const blockedSelector = 'video, input[type="range"], .stage, .frame, [data-hand-hide]';
  let layer, sprite, art, photo, touchPhoto, toggle, hero;
  let width = window.innerWidth, height = window.innerHeight;
  let x = width * .66, y = height + 100, targetX = x, targetY = y;
  let velocityX = 0, velocityY = 0, alpha = 0, frame = 0, lastTime = 0;
  let pressed = false, pendingTap = false, tapDeadline = 0, pressure = 0;
  let tapX = 0, tapY = 0;
  let visibleHand = false, contactKind = '', touchTipShiftX = 0, touchTipShiftY = 0, reachDepth = .9;
  let rendering = false;
  let hitDirty = true, geometryDirty = true, hitTarget = null, heroRect = null;
  let configuredImage, imagesRequested = false;
  const renderedStyles = new WeakMap();
  let textActive = false, textWasPressed = false, previousTextPressure = 0;
  let textPitch = 0, textRoll = 0, textPitchSpeed = 0, textRollSpeed = 0;
  const contacts = new Map();
  let entered = false, blocked = false, inScene = false, imageReady = false;
  let observedMouse = false, lastTouch = -Infinity;
  let photoWidth = 230, photoHeight = 230, tipX = 115, tipY = 35;
  let userPreference = null;
  try {
    const saved = sessionStorage.getItem(preferenceKey);
    if (saved === 'on' || saved === 'off') userPreference = saved;
  } catch (_) { /* Storage is optional. */ }
  let enabled = userPreference !== 'off';

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const hasMouse = () => observedMouse || capability.matches;
  const allowed = () => enabled && hasMouse() && !document.hidden;

  function writeStyle(element, name, value) {
    let values = renderedStyles.get(element);
    if (!values) { values = new Map(); renderedStyles.set(element, values); }
    if (values.get(name) === value) return;
    values.set(name, value);
    element.style.setProperty(name, value);
  }

  function writeData(name, value) {
    if (layer.dataset[name] !== value) layer.dataset[name] = value;
  }

  function syncToggle() {
    layer.dataset.mouse = String(observedMouse);
    if (!toggle) return;
    toggle.hidden = !hasMouse();
    toggle.dataset.mouse = String(observedMouse);
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.setAttribute('aria-label', enabled ? 'Turn off the first-person hand' : 'Turn on the first-person hand');
    toggle.title = enabled ? 'Turn hand off' : 'Turn hand on';
    toggle.dataset.handEnabled = String(enabled);
    const label = toggle.querySelector('[data-hand-label]');
    if (label) label.textContent = enabled ? 'Hand on' : 'Hand off';
  }

  function requestFrame() {
    if (document.hidden) return;
    if (!frame) { lastTime = performance.now(); frame = requestAnimationFrame(render); }
  }

  function publish(active) {
    window.dispatchEvent(new CustomEvent('touche-hand-move', {
      detail: { x, y, velocityX, velocityY, active, pressed, visible: visibleHand }
    }));
  }

  function clearContacts() {
    contacts.clear(); pendingTap = false; pressed = false;
    textActive = false; textWasPressed = false; previousTextPressure = 0;
    textPitch = 0; textRoll = 0; textPitchSpeed = 0; textRollSpeed = 0;
    if (layer) layer.dataset.textAction = 'none';
  }

  function receiveContact(event) {
    const detail = event.detail;
    if (!detail || !detail.source) return;
    const key = `${detail.source}:${detail.id || detail.source}`;
    if (!detail.active) {
      if (!contacts.delete(key)) return;
    }
    else {
      // Later sections keep their native pointer interactions. Their text
      // contact events must never bring the hero-only hand back onto the page.
      if (!entered || !inScene) return;
      contacts.set(key, { ...detail, time: performance.now() });
    }
    if (!rendering) requestFrame();
  }

  function render(now) {
    rendering = true;
    frame = 0;
    const elapsed = clamp((now - lastTime) / 1000, .001, .05);
    lastTime = now;
    if (entered && hitDirty) {
      updateHitTarget(hitTarget || document.elementFromPoint(targetX, targetY));
      hitDirty = false;
    }
    if (allowed() && entered && inScene && !blocked) ensureImages();
    const visible = allowed() && entered && !blocked && imageReady && inScene;
    visibleHand = visible;
    // Pointer movement elsewhere on the page must not run hand physics or
    // invalidate styles. Scrolling/resize will refresh the hero hit range.
    if (!visible && alpha === 0 && pressure === 0 && !contacts.size) {
      rendering = false;
      return;
    }
    if (!visible || now > tapDeadline || Math.hypot(targetX-tapX,targetY-tapY) > 14) pendingTap = false;
    const ease = 1 - Math.exp(-24 * elapsed);
    const previousX = x, previousY = y;
    x += (targetX - x) * ease;
    y += (targetY - y) * ease;
    if (Math.abs(targetX - x) < .01) x = targetX;
    if (Math.abs(targetY - y) < .01) y = targetY;
    velocityX = (x - previousX) / elapsed;
    velocityY = (y - previousY) / elapsed;
    if (x === targetX && y === targetY) { velocityX = 0; velocityY = 0; }
    alpha += ((visible ? .97 : 0) - alpha) * (1 - Math.exp(-14 * elapsed));
    if (alpha < .001) alpha = 0;
    if (visible && Math.abs(.97 - alpha) < .001) alpha = .97;
    writeStyle(layer, 'opacity', alpha.toFixed(3));
    document.documentElement.classList.toggle('touche-reaching', visible && inScene);
    layer.classList.toggle('is-in-scene', visible);
    writeData('scene', inScene ? 'hero' : 'page');

    // Contact comes from the object under the displayed fingertip. It does not
    // follow the unsmoothed mouse target or a stale pointer velocity.
    let contact;
    for (const [key, value] of contacts) {
      if (now - value.time > 160) { contacts.delete(key); continue; }
      const priority = value.source === 'text' ? 2 : 1;
      const selectedPriority = contact ? (contact.source === 'text' ? 2 : 1) : 0;
      if (priority > selectedPriority || (priority === selectedPriority && value.pressure > contact.pressure)) contact = value;
    }
    const desiredPressure = visible ? clamp(Number(contact?.pressure) || 0, 0, 1) : 0;
    pressure += (desiredPressure - pressure) * (1 - Math.exp(-25 * elapsed));
    if (pressure < .001) pressure = 0;
    if (Math.abs(desiredPressure - pressure) < .001) pressure = desiredPressure;
    contactKind = visible && contact ? contact.kind : '';
    const onText = Boolean(visible && contact?.source === 'text' && contactKind === 'glyph');
    const textAction = onText
      ? ['brush', 'press', 'drag'].includes(contact.phase) ? contact.phase : pressed ? 'press' : 'brush'
      : 'none';
    const slideX = Number.isFinite(contact?.tangentX) ? clamp(contact.tangentX, -1, 1) : clamp(velocityX / 700, -1, 1);
    const slip = Number.isFinite(contact?.slip) ? clamp(contact.slip, 0, 1) : clamp(Math.hypot(velocityX, velocityY) / 850, 0, 1);
    const textPressed = onText && pressed;
    if (reducedMotion.matches) {
      textPitch = 0; textRoll = 0; textPitchSpeed = 0; textRollSpeed = 0;
    } else {
      if (onText && !textActive) {
        textPitchSpeed -= pressure * 14;
        textRollSpeed += slideX * pressure * 9;
      }
      if (textPressed && !textWasPressed) textPitchSpeed -= pressure * 24;
      if (textActive && ((textWasPressed && !textPressed) || !onText)) {
        textPitchSpeed += previousTextPressure * (textWasPressed ? 25 : 11);
      }
      const targetPitch = onText ? -(pressure * 4 + (textAction === 'drag' ? 1.25 : 0)) : 0;
      const targetRoll = onText ? slideX * (1.4 + slip * 2.8) * pressure : 0;
      const steps = Math.max(1, Math.ceil(elapsed / .012));
      const step = elapsed / steps;
      for (let i = 0; i < steps; i += 1) {
        textPitchSpeed += (324 * (targetPitch - textPitch) - 27 * textPitchSpeed) * step;
        textRollSpeed += (324 * (targetRoll - textRoll) - 27 * textRollSpeed) * step;
        textPitchSpeed = clamp(textPitchSpeed, -70, 70);
        textRollSpeed = clamp(textRollSpeed, -60, 60);
        textPitch = clamp(textPitch + textPitchSpeed * step, -6, 3);
        textRoll = clamp(textRoll + textRollSpeed * step, -4.5, 4.5);
        if ((textPitch <= -6 && textPitchSpeed < 0) || (textPitch >= 3 && textPitchSpeed > 0)) textPitchSpeed = 0;
        if (Math.abs(textRoll) >= 4.5 && textRoll * textRollSpeed > 0) textRollSpeed = 0;
      }
      if (Math.abs(textPitch - targetPitch) < .005 && Math.abs(textPitchSpeed) < .025) { textPitch = targetPitch; textPitchSpeed = 0; }
      if (Math.abs(textRoll - targetRoll) < .005 && Math.abs(textRollSpeed) < .025) { textRoll = targetRoll; textRollSpeed = 0; }
    }
    textActive = onText; textWasPressed = textPressed; previousTextPressure = onText ? pressure : 0;
    writeData('textAction', textAction);
    const blend = layer.classList.contains('has-touch-pose') && layer.dataset.pose !== 'fallback' ? pressure : 0;
    writeStyle(layer, '--hc-pressure', blend.toFixed(3));
    writeStyle(layer, '--hc-align-x', `${(-touchTipShiftX * blend).toFixed(2)}px`);
    writeStyle(layer, '--hc-align-y', `${(-touchTipShiftY * blend).toFixed(2)}px`);
    writeStyle(layer, '--hc-pivot-x', `${(tipX + touchTipShiftX * blend).toFixed(2)}px`);
    writeStyle(layer, '--hc-pivot-y', `${(tipY + touchTipShiftY * blend).toFixed(2)}px`);
    writeStyle(layer, '--hc-shadow-y', `${(5 - pressure * (onText ? 4.5 : 3.8)).toFixed(2)}px`);
    writeStyle(layer, '--hc-shadow-blur', `${(7 - pressure * (onText ? 5.7 : 4)).toFixed(2)}px`);
    writeData('contact', contactKind || 'none');
    layer.classList.toggle('is-pressed', pressed && desiredPressure > 0);

    // Distant points shrink the hand. A small wrist roll makes lateral movement
    // feel like a reach through the scene instead of a flat cursor replacement.
    const normalizedX = (x / Math.max(width, 1) - .5) * 2;
    const desiredDepth = contactKind === 'glyph' ? .96 : Number.isFinite(contact?.depth)
      ? .78 + .2 * clamp(contact.depth, 0, 1) : .78 + .2 * clamp(y / Math.max(height, 1), 0, 1);
    reachDepth += (desiredDepth - reachDepth) * (1 - Math.exp(-14 * elapsed));
    if (Math.abs(desiredDepth - reachDepth) < .0001) reachDepth = desiredDepth;
    const depth = reachDepth;
    const resistance = 1 - pressure * .6;
    const yaw = clamp(normalizedX * 13 + velocityX * .004 * resistance, -20, 20);
    // Text resistance rotates around the existing fingertip origin. Keep the
    // sprite x/y unchanged so published contact and the visible fingertip agree.
    const rollLimit = onText || Math.abs(textRoll) > .001 ? 22 : 18;
    const roll = clamp(normalizedX * 10 + velocityX * .006 * resistance + textRoll, -rollLimit, rollLimit);
    const pitch = 24 + (1 - depth) * 16 + clamp(velocityY * -.002 * resistance, -4, 4) - pressure * 3 + textPitch;
    writeStyle(sprite, 'transform', `translate3d(${x - tipX}px,${y - tipY}px,0)`);
    writeStyle(art, 'transform', `perspective(700px) rotateX(${pitch}deg) rotateY(${yaw}deg) rotateZ(${roll}deg) scale(${depth})`);
    publish(allowed() && entered && !blocked && inScene);
    if (pendingTap && visible && Math.hypot(tapX-x,tapY-y) < 5) {
      pendingTap = false;
      window.dispatchEvent(new CustomEvent('touche-hand-tap', { detail: { x, y, pressed } }));
    }
    rendering = false;
    const unsettled = x !== targetX || y !== targetY || alpha !== (visible ? .97 : 0)
      || pressure !== desiredPressure || reachDepth !== desiredDepth
      || Math.abs(textPitchSpeed) > .025 || Math.abs(textRollSpeed) > .025;
    if (!document.hidden && (unsettled || contacts.size || pendingTap)) frame = requestAnimationFrame(render);
  }

  function updateHitTarget(element) {
    const wasInScene = inScene;
    if (!hero?.isConnected) { hero = document.querySelector('.cinematic-hero'); geometryDirty = true; }
    if (geometryDirty) { heroRect = hero?.getBoundingClientRect(); geometryDirty = false; }
    const rect = heroRect;
    const viewportWidth = document.documentElement.clientWidth || width;
    const viewportHeight = window.innerHeight;
    const left = rect ? Math.max(0, rect.left) : 0;
    const top = rect ? Math.max(0, rect.top) : 0;
    const right = rect ? Math.min(viewportWidth, rect.right) : 0;
    const bottom = rect ? Math.min(viewportHeight, rect.bottom) : 0;
    const intersectsViewport = Boolean(rect && right > left && bottom > top);
    const pointerInHero = intersectsViewport && targetX >= left && targetX < right && targetY >= top && targetY < bottom;
    blocked = Boolean(element?.closest(blockedSelector));
    inScene = Boolean(pointerInHero && element && hero.contains(element));
    // Clip the photo too, so a hand near the hero's lower edge cannot extend
    // over the showcase or comparison sections while its fingertip is inside.
    if (layer) writeStyle(layer, 'clip-path', intersectsViewport
      ? `inset(${top}px ${Math.max(0, width - right)}px ${Math.max(0, height - bottom)}px ${left}px)`
      : 'inset(100% 0 0 0)');
    if ((!inScene || blocked) && (wasInScene || visibleHand || alpha > 0 || pressure > 0)) concealHand();
  }

  function concealHand() {
    // Scope changes are immediate. A fade would leave a ghost hand over the
    // next section after the native cursor has already returned.
    visibleHand = false; alpha = 0; pressure = 0; contactKind = '';
    velocityX = 0; velocityY = 0; clearContacts();
    document.documentElement.classList.remove('touche-reaching');
    if (layer) {
      writeStyle(layer, 'opacity', '0'); writeStyle(layer, '--hc-pressure', '0');
      layer.classList.remove('is-pressed', 'is-in-scene');
      layer.dataset.scene = 'page'; layer.dataset.contact = 'none';
    }
    publish(false);
  }

  function syncHeroRange() {
    geometryDirty = true; hitDirty = true; hitTarget = null;
    if (entered) requestFrame();
  }

  function hide() {
    entered = false; inScene = false;
    cancelAnimationFrame(frame); frame = 0;
    concealHand();
  }

  function setEnabled(value) {
    enabled = Boolean(value); userPreference = enabled ? 'on' : 'off';
    if (!enabled) { visibleHand = false; clearContacts(); publish(false); }
    try { sessionStorage.setItem(preferenceKey, userPreference); } catch (_) { /* Storage is optional. */ }
    syncToggle(); requestFrame();
  }

  /** Geometry accepts displayed dimensions, fingertip origin, and wrist fade. */
  function setImage(url, geometry = {}, onError) {
    if (!url || !photo) return;
    imagesRequested = true;
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      const reachingPose = url.includes('reaching-hand');
      photoWidth = geometry.width || (reachingPose ? 270 : 230);
      photoHeight = geometry.height || photoWidth * image.naturalHeight / image.naturalWidth;
      tipX = Number.isFinite(geometry.tipX) ? geometry.tipX : photoWidth * (reachingPose ? 170 / 1536 : .5);
      tipY = Number.isFinite(geometry.tipY) ? geometry.tipY : photoHeight * (reachingPose ? 55 / 1024 : .14);
      // The bent fingertip is lower in its source photograph. Move the wrist
      // toward the contact plane as the finger bends, keeping contact fixed.
      touchTipShiftX = reachingPose ? photoWidth * (-5 / 1536) : 0;
      touchTipShiftY = reachingPose ? photoHeight * (135 / 1024) : 0;
      sprite.style.width = `${photoWidth}px`; sprite.style.height = `${photoHeight}px`;
      art.style.transformOrigin = `${tipX}px ${tipY}px`;
      const fadeStart = Number.isFinite(geometry.fadeStart) ? geometry.fadeStart : (reachingPose ? 68 : 88);
      const fadeEnd = Number.isFinite(geometry.fadeEnd) ? geometry.fadeEnd : (reachingPose ? 88 : 100);
      const fadeDirection = geometry.fadeDirection || (reachingPose ? '135deg' : 'to bottom');
      const mask = `linear-gradient(${fadeDirection},#000 0%,#000 ${fadeStart}%,transparent ${fadeEnd}%)`;
      for (const element of [photo, touchPhoto]) {
        element.style.width = `${photoWidth}px`; element.style.height = `${photoHeight}px`;
        element.style.maskImage = mask; element.style.webkitMaskImage = mask;
      }
      photo.src = image.src; imageReady = true;
      layer.dataset.pose = geometry.pose || 'reach';
      requestFrame();
    };
    if (onError) image.onerror = onError;
    image.src = url;
  }

  function setTouchImage(url) {
    if (!url || !touchPhoto) return;
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => { touchPhoto.src = image.src; layer.classList.add('has-touch-pose'); };
    image.src = url;
  }

  function ensureImages() {
    if (imagesRequested || configuredImage === 'none' || !allowed()) return;
    imagesRequested = true;
    if (configuredImage && configuredImage !== 'auto') setImage(configuredImage);
    else setImage('assets/reaching-hand.png', {}, () => {
      setImage('assets/first-person-hand.png', {
        width: 184.32, height: 276.48, tipX: 88.2, tipY: 7.2,
        fadeStart: 61, fadeEnd: 70, pose: 'fallback'
      });
    });
    setTouchImage('assets/reaching-hand-touch.png');
  }

  function init() {
    if (document.querySelector('.hand-cursor-layer')) return;
    layer = document.createElement('div'); layer.className = 'hand-cursor-layer';
    layer.setAttribute('aria-hidden', 'true');
    sprite = document.createElement('div'); sprite.className = 'hc-sprite';
    art = document.createElement('div'); art.className = 'hc-hand-art';
    const gesture = document.createElement('div'); gesture.className = 'hc-gesture';
    photo = document.createElement('img'); photo.className = 'hc-photo hc-base-photo'; photo.alt = ''; photo.draggable = false;
    touchPhoto = document.createElement('img'); touchPhoto.className = 'hc-photo hc-touch-photo'; touchPhoto.alt = ''; touchPhoto.draggable = false;
    gesture.append(photo, touchPhoto); art.append(gesture); sprite.append(art); layer.append(sprite); document.body.append(layer);
    hero = document.querySelector('.cinematic-hero');
    toggle = document.getElementById('hand-toggle');
    if (toggle) toggle.addEventListener('click', () => setEnabled(!enabled));
    syncToggle();

    function followPointer(event) {
      if (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') {
        lastTouch = performance.now(); hide(); return;
      }
      if (!event.pointerType && (event.sourceCapabilities?.firesTouchEvents || performance.now() - lastTouch < 800)) return;
      if (!observedMouse) { observedMouse = true; syncToggle(); }
      targetX = event.clientX; targetY = event.clientY;
      hitTarget = event.target; hitDirty = true; entered = true;
      if (enabled) requestFrame();
    }
    document.addEventListener(window.PointerEvent ? 'pointermove' : 'mousemove', followPointer, { passive: true });
    document.documentElement.addEventListener('pointerenter', followPointer, { passive: true });
    document.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch') { lastTouch = performance.now(); hide(); return; }
      if (event.isPrimary === false || event.button !== 0) return;
      if (!allowed()) return;
      targetX = event.clientX; targetY = event.clientY;
      updateHitTarget(event.target);
      if (blocked || !inScene) return;
      pressed = true; entered = true;
      pendingTap = true; tapX = targetX; tapY = targetY; tapDeadline = performance.now() + 360;
      requestFrame();
    }, { passive: true });
    document.addEventListener('pointerup', () => { pressed = false; requestFrame(); }, { passive: true });
    document.addEventListener('pointercancel', hide, { passive: true });
    document.documentElement.addEventListener('pointerleave', hide, { passive: true });
    window.addEventListener('blur', hide);
    window.addEventListener('scroll', syncHeroRange, { passive: true, capture: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
    window.addEventListener('resize', () => { width = window.innerWidth; height = window.innerHeight; syncHeroRange(); }, { passive: true });
    window.visualViewport?.addEventListener('resize', syncHeroRange, { passive: true });
    window.visualViewport?.addEventListener('scroll', syncHeroRange, { passive: true });
    if (hero && window.ResizeObserver) new ResizeObserver(syncHeroRange).observe(hero);
    capability.addEventListener('change', () => { syncToggle(); requestFrame(); });
    window.addEventListener('touche-hand-contact', receiveContact);

    configuredImage = ownScript?.dataset.handImage || document.documentElement.dataset.handImage;
    window.HandCursor = Object.freeze({ setEnabled, setImage, setTouchImage });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
