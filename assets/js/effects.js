/* Spatial effects for the shop. Playback remains entirely in app.js. */
(function () {
  'use strict';

  function boot() {
    var body = document.body;
    var scene = document.getElementById('sceneDepth');
    var toggle = document.getElementById('motionBtn');
    var shopVideo = document.getElementById('shopVideo');
    var cards = Array.prototype.slice.call(document.querySelectorAll('.card'));
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    var storageKey = 'rs-world-3d-motion';
    var wanted = true;
    var enabled = false;
    var raf = 0;
    var lastTime = 0;
    var room = { x: 0, y: 0, tx: 0, ty: 0 };
    var items = [];
    var animations = new Set();
    var burst = null;
    var burstTimer = 0;

    try { wanted = localStorage.getItem(storageKey) !== 'off'; } catch (e) {}

    function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    function decorative(className) {
      var node = document.createElement('span');
      node.className = className;
      node.setAttribute('aria-hidden', 'true');
      return node;
    }

    var atmosphere = document.createElement('div');
    atmosphere.className = 'room-atmosphere';
    atmosphere.setAttribute('aria-hidden', 'true');
    for (var n = 0; n < 18; n++) {
      var mote = decorative('room-mote');
      mote.style.setProperty('--mote-x', ((n * 37 + 11) % 100) + '%');
      mote.style.setProperty('--mote-y', ((n * 29 + 18) % 100) + '%');
      mote.style.setProperty('--mote-size', (1.2 + (n % 3) * .75) + 'px');
      mote.style.setProperty('--mote-depth', (n % 3 * 36 - 50) + 'px');
      mote.style.setProperty('--mote-opacity', String(.16 + n % 4 * .065));
      mote.style.setProperty('--mote-drift', (n % 2 ? 30 : -24) + 'px');
      mote.style.setProperty('--mote-duration', (19 + n % 7 * 3) + 's');
      mote.style.setProperty('--mote-delay', (-n * 2.4) + 's');
      atmosphere.appendChild(mote);
    }
    body.appendChild(atmosphere);

    function rememberAnimation(animation) {
      animations.add(animation);
      animation.onfinish = function () { animations.delete(animation); };
      animation.oncancel = function () { animations.delete(animation); };
      return animation;
    }

    function clearBurst() {
      window.clearTimeout(burstTimer);
      if (burst) burst.remove();
      burst = null;
    }

    function scatter(item) {
      clearBurst();
      var rect = item.card.querySelector('.card__case').getBoundingClientRect();
      burst = document.createElement('div');
      burst.className = 'tape-particles';
      burst.setAttribute('aria-hidden', 'true');
      var x = rect.left + rect.width / 2;
      var y = rect.top + rect.height * .42;
      for (var i = 0; i < 11; i++) {
        var spark = decorative('tape-particle');
        var angle = i / 11 * Math.PI * 2;
        var reach = 34 + i % 4 * 11;
        spark.style.left = x + 'px';
        spark.style.top = y + 'px';
        burst.appendChild(spark);
        rememberAnimation(spark.animate([
          { transform: 'translate(0,0) scale(.3)', opacity: 0 },
          { opacity: .65, offset: .15 },
          { transform: 'translate(' + (Math.cos(angle) * reach).toFixed(1) + 'px,' + (Math.sin(angle) * reach - 24).toFixed(1) + 'px) rotate(130deg) scale(.2)', opacity: 0 }
        ], { duration: 680 + i % 3 * 100, easing: 'cubic-bezier(.16,.7,.3,1)' }));
      }
      body.appendChild(burst);
      burstTimer = window.setTimeout(clearBurst, 950);
    }

    function select(item) {
      if (!enabled || document.hidden || !item.flight.animate) return;
      if (item.selection) item.selection.cancel();
      item.card.classList.add('is-turning');
      var animation = rememberAnimation(item.flight.animate([
        { transform: 'translateY(0) rotateY(0deg) rotateZ(0deg) scale(1)', offset: 0 },
        { transform: 'translateY(-25px) rotateY(65deg) rotateZ(-5deg) scale(1.055)', offset: .24 },
        { transform: 'translateY(-28px) rotateY(235deg) rotateZ(4deg) scale(1.055)', offset: .58 },
        { transform: 'translateY(-4px) rotateY(363deg) rotateZ(-1deg) scale(1.01)', offset: .88 },
        { transform: 'translateY(0) rotateY(360deg) rotateZ(0deg) scale(1)', offset: 1 }
      ], { duration: 1050, easing: 'cubic-bezier(.22,.65,.25,1)' }));
      item.selection = animation;
      var finish = function () {
        animations.delete(animation);
        if (item.selection === animation) {
          item.selection = null;
          item.card.classList.remove('is-turning');
        }
      };
      animation.onfinish = finish;
      animation.oncancel = finish;
      scatter(item);
    }

    cards.forEach(function (card) {
      var cover = card.querySelector('.card__case');
      if (!cover || card.querySelector('.cassette-lift')) return;
      var lift = document.createElement('span');
      var tilt = document.createElement('span');
      var flight = document.createElement('span');
      lift.className = 'cassette-lift';
      tilt.className = 'cassette-tilt';
      flight.className = 'cassette-flight';
      cover.parentNode.insertBefore(lift, cover);
      lift.appendChild(tilt);
      tilt.appendChild(flight);
      flight.appendChild(cover);
      ['back', 'left', 'right', 'top', 'bottom'].forEach(function (side) {
        var face = decorative('cassette-face cassette-face--' + side);
        if (side === 'back') {
          var label = decorative('cassette-back-label');
          label.textContent = 'R’S WORLD · SIDE A';
          face.appendChild(label);
        }
        flight.appendChild(face);
      });
      cover.appendChild(decorative('cassette-glint'));
      var item = { card: card, tilt: tilt, flight: flight, x: 0, y: 0, tx: 0, ty: 0, selection: null };
      items.push(item);

      card.addEventListener('pointermove', function (event) {
        if (!enabled || !finePointer.matches || event.pointerType === 'touch') return;
        // Measure the stable button, never the tilted face, to avoid feedback.
        var rect = card.getBoundingClientRect();
        var x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        var y = clamp((event.clientY - rect.top) / (rect.width * 4 / 3), 0, 1);
        item.tx = (x - .5) * 34;
        item.ty = (.5 - y) * 23;
        card.style.setProperty('--glint-x', (x * 100).toFixed(1) + '%');
        card.style.setProperty('--glint-y', (y * 100).toFixed(1) + '%');
        wake();
      }, { passive: true });
      function release() { item.tx = 0; item.ty = 0; wake(); }
      card.addEventListener('pointerleave', release, { passive: true });
      card.addEventListener('pointercancel', release, { passive: true });
      card.addEventListener('blur', release);
      // The original button handles playback. This listener adds only motion
      // and also runs for native keyboard activation and touch-generated clicks.
      card.addEventListener('click', function () { select(item); });
    });

    function frame(time) {
      raf = 0;
      if (!enabled || document.hidden) return;
      var dt = lastTime ? Math.min(time - lastTime, 40) : 16;
      var ease = 1 - Math.exp(-dt / 92);
      lastTime = time;
      var moving = false;
      room.x += (room.tx - room.x) * ease;
      room.y += (room.ty - room.y) * ease;
      if (scene) {
        scene.style.setProperty('--room-x', (room.x * 7).toFixed(3) + 'px');
        scene.style.setProperty('--room-y', (room.y * 5).toFixed(3) + 'px');
      }
      moving = Math.abs(room.tx - room.x) + Math.abs(room.ty - room.y) > .002;
      items.forEach(function (item) {
        item.x += (item.tx - item.x) * ease;
        item.y += (item.ty - item.y) * ease;
        item.tilt.style.setProperty('--case-rx', item.y.toFixed(2) + 'deg');
        item.tilt.style.setProperty('--case-ry', item.x.toFixed(2) + 'deg');
        if (Math.abs(item.tx - item.x) + Math.abs(item.ty - item.y) > .015) moving = true;
      });
      if (moving) raf = requestAnimationFrame(frame);
      else lastTime = 0;
    }

    function wake() {
      if (!raf && enabled && !document.hidden) raf = requestAnimationFrame(frame);
    }

    function reset() {
      cancelAnimationFrame(raf);
      raf = 0;
      lastTime = 0;
      room.x = room.y = room.tx = room.ty = 0;
      if (scene) {
        scene.style.removeProperty('--room-x');
        scene.style.removeProperty('--room-y');
      }
      items.forEach(function (item) {
        item.x = item.y = item.tx = item.ty = 0;
        item.tilt.style.removeProperty('--case-rx');
        item.tilt.style.removeProperty('--case-ry');
        item.card.classList.remove('is-turning');
      });
      animations.forEach(function (animation) { animation.cancel(); });
      animations.clear();
      clearBurst();
    }

    function updatePreference() {
      enabled = wanted && !reduced.matches;
      body.classList.toggle('motion-enabled', enabled);
      body.classList.toggle('motion-off', !enabled);
      if (toggle) {
        var label = toggle.querySelector('[data-motion-label]') || toggle.querySelector('span') || toggle;
        label.textContent = enabled ? '3D on' : '3D off';
        toggle.setAttribute('aria-pressed', String(enabled));
        toggle.setAttribute('aria-label', enabled ? 'Turn off 3D animations' : 'Turn on 3D animations');
        toggle.disabled = reduced.matches;
        toggle.title = reduced.matches ? '3D animations are off with your reduced-motion preference' : (enabled ? 'Pause the 3D effects' : 'Bring the 3D effects back');
      }
      if (shopVideo) {
        if (!enabled || document.hidden) shopVideo.pause();
        else shopVideo.play().catch(function () {});
      }
      if (!enabled) reset();
    }

    document.addEventListener('pointermove', function (event) {
      if (!enabled || !finePointer.matches || event.pointerType === 'touch') return;
      room.tx = clamp(event.clientX / window.innerWidth * 2 - 1, -1, 1);
      room.ty = clamp(event.clientY / window.innerHeight * 2 - 1, -1, 1);
      wake();
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', function () {
      room.tx = room.ty = 0;
      items.forEach(function (item) { item.tx = item.ty = 0; });
      wake();
    });
    document.addEventListener('visibilitychange', function () {
      body.classList.toggle('motion-paused', document.hidden);
      if (document.hidden) {
        reset();
        if (shopVideo) shopVideo.pause();
      } else {
        if (enabled && shopVideo) shopVideo.play().catch(function () {});
        wake();
      }
    });
    window.addEventListener('blur', reset);
    if (toggle) toggle.addEventListener('click', function () {
      wanted = !wanted;
      try { localStorage.setItem(storageKey, wanted ? 'on' : 'off'); } catch (e) {}
      updatePreference();
    });
    if (reduced.addEventListener) reduced.addEventListener('change', updatePreference);
    else reduced.addListener(updatePreference);
    body.classList.add('motion-ready');
    body.classList.toggle('motion-paused', document.hidden);
    updatePreference();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
