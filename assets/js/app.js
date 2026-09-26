/* ==========================================================================
   R'S WORLD — Hits of the 90s
   All behaviour lives here. To change playlists or links, edit config.js.
   ========================================================================== */
(function () {
  'use strict';

  /* ---- where the CRT sits inside the background footage (1916 x 1080) ---- */
  var VIDEO_AR = 1916 / 1080;
  var TV_RECT  = { x: 0.0760, y: 0.5790, w: 0.1215, h: 0.1640 };

  /* On phones the shop is shown as a band across the top instead of a full
     bleed. This zoom keeps BOTH the whole "R'S WORLD" marquee and the little
     CRT (which starts at x 0.076) inside the visible slice. */
  var MOBILE_ZOOM = 1.12;

  /* YouTube misbehaves in a very small iframe, and the CRT on a phone is only
     ~50px wide — so below this the player is kept big and scaled down. */
  var MIN_FRAME = 300;

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var el = {
    body:     document.body,
    stage:    $('#stage'),
    video:    $('#shopVideo'),
    bdA:      $('#backdropA'),
    bdB:      $('#backdropB'),
    tv:       $('#tv'),
    tvSlot:   $('#tvSlot'),
    homeBtn:  $('#homeBtn'),
    ytmBtn:   $('#ytmBtn'),
    igBtn:    $('#igBtn'),
    liveWrap: $('#live'),
    liveN:    $('#liveN'),
    creditNm: $('.credit__name'),
    devCard:  $('#devCard'),
    devScrim: $('#devScrim'),
    devName:  $('#devName'),
    devRole:  $('#devRole'),
    devIg:    $('#devIg'),
    devX:     $('#devX'),
    devLi:    $('#devLi'),
    deck:     $('#deck'),
    disc:     $('#disc'),
    discArt:  $('#discArt'),
    label:    $('#deckLabel'),
    title:    $('#deckTitle'),
    titleWrap:$('.deck__titlewrap'),
    seek:     $('#seek'),
    seekFill: $('#seekFill'),
    tCur:     $('#tCur'),
    tDur:     $('#tDur'),
    prevBtn:  $('#prevBtn'),
    playBtn:  $('#playBtn'),
    nextBtn:  $('#nextBtn'),
    listBtn:  $('#listBtn'),
    sheet:    $('#sheet'),
    sheetT:   $('#sheetTitle'),
    sheetL:   $('#sheetList'),
    sheetX:   $('#sheetClose'),
    rack:     $('#rack'),
    nudge:    $('#soundNudge'),
    shuffle:  $('#shuffleBtn'),
    repeat:   $('#repeatBtn'),
    surprise: $('#surpriseBtn'),
    volume:   $('#volume'),
    sleep:    $('#sleepBtn'),
    sleepLabel: $('#sleepLabel'),
    status:   $('#playerStatus'),
    toast:    $('#toast')
  };

  var state = {
    view:      'home',   // 'home' or a singer key
    deckKey:   'home',
    queue:     [],
    index:     0,
    playing:   false,
    loading:   false,
    unlocked:  false,
    soundRequested: false,
    ready:     false,
    sheetOpen: false,
    devOpen:   false,
    errors:    0,
    errorTrack: -1,
    lastError: 0,
    autoUnlockUntil: 0,
    pausedByUser: false,
    autoplay:  true,
    shuffle:   SITE.shuffle !== false,
    repeat:    false,
    loadId:    0,
    trackId:   0,
    resolving: null,
    failed:    false,
    bdFront:   el.bdA
  };

  var player = null;
  var apiTimer, apiScript, errorTimer, unlockTimer, soundCheckTimer, toastTimer, sleepTimer;
  var backdropId = 0, sleepMinutes = 0, sleepUntil = 0;
  var savedVolume = readSetting('rw-volume');
  var volume = savedVolume === null ? (SITE.startVolume == null ? 85 : SITE.startVolume) : Number(savedVolume);
  volume = isFinite(volume) ? clamp(volume, 0, 100) : 85;
  var lastAudibleVolume = Number(readSetting('rw-audible-volume')) || volume || 85;
  var unavailable = {};
  try { unavailable = JSON.parse(readSetting('rw-unavailable') || '{}') || {}; } catch (e) {}
  if (typeof unavailable !== 'object' || Array.isArray(unavailable)) unavailable = {};
  if (typeof PLAYBACK_AVAILABILITY !== 'undefined') {
    var checkedUntil = Date.parse(PLAYBACK_AVAILABILITY.checkedAt) + 7 * 86400000;
    if (checkedUntil > Date.now()) Object.keys(PLAYBACK_AVAILABILITY.blocked || {}).forEach(function (id) {
      if (!unavailable[id]) unavailable[id] = { until: checkedUntil, code: PLAYBACK_AVAILABILITY.blocked[id] };
    });
  }

  function isUnavailable(id) { return unavailable[id] && unavailable[id].until > Date.now(); }
  function eligibleTracks(items) { return items.filter(function (t) { return !isUnavailable(t.id); }); }
  function rememberUnavailable(id, code) {
    unavailable[id] = { until: Date.now() + (code === 100 || code === 101 || code === 150 ? 86400000 : 300000), code: code };
    saveSetting('rw-unavailable', JSON.stringify(unavailable));
  }

  /* ======================================================================
     SMALL HELPERS
     ====================================================================== */

  function readSetting(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function saveSetting(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  function setStatus(message) {
    if (el.status) el.status.textContent = message || '';
  }

  function toast(message) {
    if (!el.toast) return;
    clearTimeout(toastTimer);
    el.toast.textContent = message;
    el.toast.classList.add('is-visible');
    toastTimer = setTimeout(function () { el.toast.classList.remove('is-visible'); }, 3000);
  }

  function setPlaying(playing) {
    state.playing = playing;
    el.body.classList.toggle('is-playing', playing);
    syncSoundUI();
  }

  function syncSoundUI() {
    var silent = state.playing && (!state.unlocked || volume === 0);
    el.body.classList.toggle('is-silent', silent);
    var label = silent ? 'Play with sound' : state.playing ? 'Pause' : 'Play';
    el.playBtn.setAttribute('aria-label', label);
    el.playBtn.title = label;
    el.playBtn.setAttribute('aria-busy', String(state.loading));
  }

  function motionAllowed() {
    return !el.body.classList.contains('motion-off') && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function time(s) {
    if (!isFinite(s) || s < 0) s = 0;
    var m = Math.floor(s / 60), r = Math.floor(s % 60);
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function videoId(s) {
    if (!s) return '';
    s = String(s).trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    var m = s.match(/(?:v=|\/embed\/|youtu\.be\/|\/shorts\/|\/v\/)([\w-]{11})/);
    return m ? m[1] : '';
  }

  function listId(s) {
    if (!s) return '';
    s = String(s).trim();
    if (/^PASTE_/i.test(s)) return '';
    if (/^(PL|OL|UU|LL|RD|FL)[\w-]{10,}$/.test(s)) return s;
    var m = s.match(/[?&]list=([\w-]+)/);
    return m ? m[1] : '';
  }

  function thumb(id) { return 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg'; }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  var isSmall = function () {
    return window.matchMedia('(max-width: 899px), (orientation: portrait), (max-height: 500px) and (pointer: coarse)').matches;
  };

  /* ======================================================================
     LAYOUT — the stage, the TV and the playlist sheet
     ====================================================================== */

  function layout() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var small = isSmall();
    var w, h, left, top;

    if (small) {
      /* PHONES — the frame is landscape, so covering a portrait screen would
         throw away three quarters of it (sign included). Instead: fit it
         across the width and pin it just under the topbar, as a band. */
      w = vw * MOBILE_ZOOM;
      if (vw > vh) w = Math.min(w, vh * .58 * VIDEO_AR);
      h = w / VIDEO_AR;
      left = (vw - w) / 2;
      var bar = document.querySelector('.topbar');
      top = (bar ? bar.offsetHeight : 56) + 4;
    } else {
      /* DESKTOP — unchanged: cover the viewport on a grid we can measure,
         so the TV overlay lands exactly on the real CRT in the footage. */
      w = vw; h = vw / VIDEO_AR;
      if (h < vh) { h = vh; w = vh * VIDEO_AR; }
      left = (vw - w) / 2;
      top  = (vh - h) / 2;
    }

    el.stage.style.width  = w + 'px';
    el.stage.style.height = h + 'px';
    el.stage.style.left   = left + 'px';
    el.stage.style.top    = top + 'px';

    /* tell the CSS where the band ends so the page can start below it */
    document.documentElement.style.setProperty('--band-bottom', (top + h) + 'px');

    /* The TV sits on the real CRT in the footage — on desktop and, now that
       the whole frame is visible in the band, on phones as well. */
    var box = {
      l: left + TV_RECT.x * w,
      t: top  + TV_RECT.y * h,
      w: TV_RECT.w * w,
      h: TV_RECT.h * h
    };
    el.tv.style.left   = box.l + 'px';
    el.tv.style.top    = box.t + 'px';
    el.tv.style.width  = box.w + 'px';
    el.tv.style.height = box.h + 'px';

    /* fill the screen with the 16:9 embed, cropping the sides */
    var frame = el.tv.querySelector('iframe');
    if (frame) {
      frame.tabIndex = -1;
      var iw = box.w + 2, ih = (box.w + 2) * 9 / 16;
      if (ih < box.h + 2) { ih = box.h + 2; iw = ih * 16 / 9; }

      if (iw < MIN_FRAME) {
        /* phones: the CRT is tiny, so keep the player at a size YouTube is
           happy with and shrink it visually instead of literally */
        var k = iw / MIN_FRAME;
        frame.style.width  = MIN_FRAME + 'px';
        frame.style.height = (ih / k) + 'px';
        frame.style.transform = 'translate(-50%,-50%) scale(' + k + ')';
      } else {
        frame.style.width  = iw + 'px';
        frame.style.height = ih + 'px';
        frame.style.removeProperty('transform');   /* desktop: untouched */
      }
    }

    layoutSheet();
  }

  function layoutSheet() {
    if (!state.sheetOpen) return;
    if (isSmall()) {
      /* Phones use a viewport-anchored sheet, even after scrolling the deck. */
      el.sheet.style.removeProperty('top');
      el.sheet.style.removeProperty('max-height');
      return;
    }
    var d = el.deck.getBoundingClientRect();
    var gap = 12, headroom = 62;

    /* the sheet may only use the room that actually exists above the player */
    var avail = d.top - gap - headroom;
    el.sheet.style.maxHeight = Math.max(150, avail) + 'px';

    var top = d.top - gap - el.sheet.offsetHeight;
    el.sheet.style.top = Math.max(headroom, top) + 'px';
  }

  /* ======================================================================
     BACKDROPS
     ====================================================================== */

  function setBackdrop(key) {
    var request = ++backdropId;
    if (!key) {
      el.bdA.classList.remove('is-on');
      el.bdB.classList.remove('is-on');
      return;
    }
    var back = state.bdFront === el.bdA ? el.bdB : el.bdA;
    back.style.backgroundImage = 'url("assets/img/' + key + '-bg.jpg")';
    /* let the browser paint it before fading in */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (request !== backdropId) return;
        back.classList.add('is-on');
        state.bdFront.classList.remove('is-on');
        state.bdFront = back;
      });
    });
  }

  function preloadBackdrops() {
    SITE.singers.forEach(function (s) {
      var i = new Image();
      i.src = 'assets/img/' + s.key + '-bg.jpg';
    });
  }

  /* ======================================================================
     CARDS
     ====================================================================== */

  function buildCards() {
    SITE.singers.forEach(function (s, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'card';
      b.dataset.key = s.key;
      b.style.setProperty('--i', i);
      b.style.setProperty('--c', s.accent);
      b.setAttribute('aria-label', 'Play ' + s.name);
      b.innerHTML =
        '<span class="card__case">' +
          '<img class="card__art" src="assets/img/' + s.key + '-card.jpg" alt="' + s.name + '" loading="eager">' +
          '<span class="card__spine"></span>' +
          '<span class="card__sheen"></span>' +
          '<span class="card__glow"></span>' +
          '<span class="card__eq"><i></i><i></i><i></i><i></i></span>' +
        '</span>' +
        '<span class="card__plate">' + s.name + '</span>' +
        '<span class="card__tag">' + (s.tag || '') + '</span>';
      b.addEventListener('click', function () { openSinger(s.key); });
      el.rack.appendChild(b);
    });
  }

  function markCards() {
    $$('.card').forEach(function (c) {
      c.classList.toggle('is-live', c.dataset.key === state.view);
      c.setAttribute('aria-pressed', String(c.dataset.key === state.view));
    });
  }

  /* ======================================================================
     PLAYLIST RESOLUTION
     ====================================================================== */

  function deckConf(key) { return SITE.decks[key] || SITE.decks.home; }

  function resolveDeck(key, request) {
    var d = deckConf(key);
    if (d._items && d._items.length) return Promise.resolve(d._items);
    if (!state.ready || !player) return Promise.resolve([]);

    var items = [];
    if (d.tracks && d.tracks.length) {
      items = d.tracks.map(function (t) {
        if (typeof t === 'string') return { id: videoId(t), title: '' };
        return { id: videoId(t.id || t.url || ''), title: t.title || '' };
      }).filter(function (t) { return t.id; });
      if (items.length) { d._items = items; grabTitles(eligibleTracks(items)); }
      return Promise.resolve(items);
    }

    var list = listId(d.playlist);
    if (!list) return Promise.resolve([]);
    // Some public lists open on YouTube but return no IDs through cuePlaylist.
    // Use the songs read from that exact playlist page, without replacing its
    // URL or mixing in another singer's queue. Unknown URLs use the live API.
    var snapshot = typeof PLAYLIST_SNAPSHOTS !== 'undefined' && PLAYLIST_SNAPSHOTS[list];
    if (snapshot && snapshot.tracks && snapshot.tracks.length) {
      items = snapshot.tracks.filter(function (t) { return videoId(t.id) === t.id; })
        .map(function (t) { return { id: t.id, title: t.title || '' }; });
      if (items.length) { d._items = items; return Promise.resolve(items); }
    }
    return listFromPlayer(list, request).then(function (ids) {
      if (request !== state.loadId) return [];
      items = ids.map(function (id) { return { id: id, title: '' }; });
      if (items.length) { d._items = items; grabTitles(eligibleTracks(items)); }
      return items;
    });
  }

  /* A request owns the shared player until it is cancelled or resolved.
     Never cache an old playlist returned while YouTube changes selections. */
  function listFromPlayer(list, request) {
    return new Promise(function (resolve) {
      if (!state.ready || !player || !player.cuePlaylist) return resolve([]);
      var previous = '';
      try { previous = (player.getPlaylist() || []).join(','); } catch (e) {}
      var resolver = { request: request, cued: false };
      state.resolving = resolver;
      var tries = 0, stable = 0, last = '';
      var finish = function (ids) {
        clearInterval(iv);
        if (state.resolving === resolver) state.resolving = null;
        resolve(ids);
      };
      resolver.cancel = function () { finish([]); };
      try { player.cuePlaylist({ list: list, listType: 'playlist' }); }
      catch (e) { state.resolving = null; return resolve([]); }
      var iv = setInterval(function () {
        if (request !== state.loadId) return finish([]);
        var ids = [], reported = '';
        try {
          ids = (player.getPlaylist() || []).filter(function (id) { return videoId(id) === id; });
          if (typeof player.getPlaylistId === 'function') reported = player.getPlaylistId() || '';
          if (!reported && player.getVideoUrl) reported = listId(player.getVideoUrl());
        } catch (e) {}
        var signature = ids.join(',');
        stable = signature && signature === last ? stable + 1 : 0;
        last = signature;
        var confirmed = resolver.cued && (reported ? reported === list : signature !== previous);
        if (ids.length && confirmed && stable >= 1) return finish(ids.slice());
        if (++tries >= 65) finish([]);
      }, 150);
    });
  }

  /* Fetch a bounded number of titles; a blocked request must not stall the rest. */
  function grabTitles(items) {
    var pending = items.filter(function (t) { return !t.title; }).slice(0, 80);
    (function step(i) {
      if (i >= pending.length) return;
      var t = pending[i];
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var timeout;
      var request = fetch('https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=' + t.id,
        controller ? { signal: controller.signal } : {})
        .then(function (r) { return r.ok ? r.json() : null; });
      Promise.race([request, new Promise(function (resolve) {
        timeout = setTimeout(function () { if (controller) controller.abort(); resolve(null); }, 4500);
      })]).then(function (j) {
        if (j && j.title) {
          t.title = j.title;
          if (state.sheetOpen) renderSheet();
          if (state.queue[state.index] === t) paintNowPlaying();
        }
      }).catch(function () {}).then(function () {
        clearTimeout(timeout);
        return sleep(70).then(function () { step(i + 1); });
      });
    })(0);
  }

  /* ======================================================================
     PLAYBACK
     ====================================================================== */

  function loadDeck(key, autoplay) {
    var request = ++state.loadId;
    var interruptedPlaylist = !!state.resolving;
    if (state.resolving && state.resolving.cancel) state.resolving.cancel();
    clearTimeout(errorTimer);
    clearTimeout(unlockTimer);
    clearTimeout(soundCheckTimer);
    state.autoUnlockUntil = 0;
    state.loading = false;
    state.trackId++;
    state.deckKey = key;
    state.autoplay = autoplay !== false;
    state.pausedByUser = autoplay === false;
    state.failed = false;
    state.queue = [];
    state.errors = 0;
    setPlaying(false);
    el.label.textContent = deckConf(key).label || '';
    el.title.classList.remove('is-long');
    el.title.style.removeProperty('--shift');
    el.title.textContent = 'Loading the playlist…';
    setStatus('');
    setSeek(0, 0);
    syncYtMusic();
    if (state.sheetOpen) renderSheet();
    if (!state.ready) return Promise.resolve();
    // cuePlaylist is asynchronous. If a different selection interrupts it,
    // an old response can otherwise masquerade as the newly requested list.
    // A new iframe session keeps that pending response out of the new deck.
    if (interruptedPlaylist) {
      state.ready = false;
      startPlayer();
      return Promise.resolve();
    }
    try { player.stopVideo(); } catch (e) {}

    return resolveDeck(key, request).then(function (items) {
      if (request !== state.loadId) return;
      if (!items.length) { showEmptyDeck(); return; }
      state.queue = eligibleTracks(items);
      if (!state.queue.length) {
        el.title.textContent = 'No playable songs in this tape';
        el.discArt.src = 'assets/img/shop-poster.jpg';
        playbackFailure(150);
        return;
      }
      if (state.shuffle) shuffle(state.queue);
      // A playlist can contain many videos that refuse embeds. Start with a
      // song that this browser has actually played, if it is still in the list.
      var proven = readSetting('rw-playable-' + key);
      var provenIndex = state.queue.findIndex(function (track) { return track.id === proven; });
      if (provenIndex > 0) state.queue = state.queue.slice(provenIndex).concat(state.queue.slice(0, provenIndex));
      state.index = 0;
      playIndex(0, state.autoplay && !state.pausedByUser);
    });
  }

  function showEmptyDeck() {
    state.queue = [];
    state.failed = true;
    setPlaying(false);
    el.title.classList.remove('is-long');
    el.title.style.removeProperty('--shift');
    el.title.textContent = 'This tape is taking a break';
    setStatus('This playlist cannot play here. Try another singer, press Play to retry, or open YT Music.');
    el.discArt.src = 'assets/img/shop-poster.jpg';
    el.nudge.hidden = true;
    syncYtMusic();
    if (state.sheetOpen) renderSheet();
  }

  function playIndex(i, autoplay, direction) {
    if (!state.queue.length || !state.ready || !player || !player.loadVideoById) return;
    clearTimeout(errorTimer);
    clearTimeout(soundCheckTimer);
    state.autoUnlockUntil = 0;
    var candidate = (i % state.queue.length + state.queue.length) % state.queue.length;
    var checked = 0;
    while (checked < state.queue.length && isUnavailable(state.queue[candidate].id)) {
      candidate = (candidate + (direction === -1 ? -1 : 1) + state.queue.length) % state.queue.length;
      checked++;
    }
    if (checked === state.queue.length) { playbackFailure(state.lastError || 150); return; }
    state.trackId++;
    state.loading = true;
    state.failed = false;
    state.pausedByUser = autoplay === false;
    state.index = candidate;
    setPlaying(false);
    var t = state.queue[state.index];
    setStatus('');
    setSeek(0, 0);
    try {
      if (autoplay === false) player.cueVideoById(t.id);
      else player.loadVideoById(t.id);
    } catch (e) { onError(); }
    paintNowPlaying();
    syncYtMusic();
    if (state.sheetOpen) renderSheet();
  }

  function next() {
    if (state.queue.length) {
      state.pausedByUser = false;
      unlockSound();
      state.errors = 0;
      playIndex(state.index + 1, true);
    }
  }
  function prev() {
    if (!state.queue.length) return;
    state.pausedByUser = false;
    unlockSound();
    var t = 0;
    try { t = player.getCurrentTime() || 0; } catch (e) {}
    if (!state.loading && t > 4) { try { player.seekTo(0, true); } catch (e) {} return; }
    state.errors = 0;
    playIndex(state.index - 1, true, -1);
  }

  function togglePlay() {
    state.soundRequested = true;
    if (!state.ready) { startPlayer(); toast('Connecting to the tape deck…'); return; }
    if (state.loading) { unlockSound(); return; }
    if (state.playing && (!state.unlocked || volume === 0)) {
      state.pausedByUser = false;
      unlockSound(true);
      return;
    }
    if (state.playing) {
      state.pausedByUser = true;
      clearTimeout(errorTimer);
      clearTimeout(unlockTimer);
      try { player.pauseVideo(); } catch (e) {}
      setPlaying(false);
      return;
    }
    state.pausedByUser = false;
    if (!state.queue.length || state.failed) { unlockSound(); loadDeck(state.deckKey, true); return; }
    unlockSound(true);
    try { player.playVideo(); } catch (e) {}
  }

  function paintNowPlaying() {
    var t = state.queue[state.index];
    if (!t) return;
    el.discArt.src = thumb(t.id);
    var name = t.title || 'Track ' + (state.index + 1);
    el.title.textContent = name;
    el.title.title = name;
    fitTitle();
  }

  function fitTitle() {
    el.title.classList.remove('is-long');
    el.title.style.removeProperty('--shift');
    requestAnimationFrame(function () {
      var over = el.title.scrollWidth - el.titleWrap.clientWidth;
      if (over > 8) {
        el.title.style.setProperty('--shift', -(over + 14) + 'px');
        el.title.classList.add('is-long');
      }
    });
  }

  function setSeek(cur, dur) {
    var pct = dur > 0 ? (cur / dur) * 100 : 0;
    el.seekFill.style.width = clamp(pct, 0, 100) + '%';
    el.seek.setAttribute('aria-valuenow', Math.round(pct));
    el.seek.setAttribute('aria-valuetext', time(cur) + ' of ' + time(dur));
    el.tCur.textContent = time(cur);
    el.tDur.textContent = time(dur);
  }

  /* ======================================================================
     VIEWS
     ====================================================================== */

  function goHome() {
    state.pausedByUser = false;
    unlockSound();
    state.view = 'home';
    el.body.classList.add('is-home');
    el.body.classList.remove('is-singer');
    document.documentElement.style.setProperty('--accent', '#FFB43C');
    setBackdrop(null);
    markCards();
    closeSheet();
    replayCrt();
    layout();
    toTop();
    loadDeck('home', true);
  }

  /* re-run the little switch-on flash whenever the TV comes back */
  function replayCrt() {
    el.tv.classList.remove('is-ready');
    void el.tv.offsetWidth;
    el.tv.classList.add('is-ready');
  }

  function toTop() {
    if (isSmall()) window.scrollTo({ top: 0, behavior: motionAllowed() ? 'smooth' : 'auto' });
  }

  function openSinger(key) {
    state.pausedByUser = false;
    var s = SITE.singers.filter(function (x) { return x.key === key; })[0];
    state.view = key;
    el.body.classList.remove('is-home');
    el.body.classList.add('is-singer');
    document.documentElement.style.setProperty('--accent', (s && s.accent) || '#FFB43C');
    setBackdrop(key);
    markCards();
    closeSheet();
    layout();
    toTop();
    unlockSound();
    loadDeck(key, true);
  }

  /* ======================================================================
     PLAYLIST SHEET
     ====================================================================== */

  function openSheet() {
    state.sheetOpen = true;
    el.sheet.hidden = false;
    renderSheet();
    requestAnimationFrame(function () {
      if (!state.sheetOpen) return;
      el.sheet.classList.add('is-open');
      layoutSheet();
      setTimeout(layoutSheet, 260);          /* thumbnails change the height */
      var cur = el.sheetL.querySelector('.is-current');
      if (cur) cur.scrollIntoView({ block: 'nearest' });
    });
    el.listBtn.classList.add('is-open');
    el.listBtn.setAttribute('aria-expanded', 'true');
  }

  function closeSheet() {
    if (!state.sheetOpen) return;
    state.sheetOpen = false;
    el.sheet.classList.remove('is-open');
    el.listBtn.classList.remove('is-open');
    el.listBtn.setAttribute('aria-expanded', 'false');
    setTimeout(function () { if (!state.sheetOpen) el.sheet.hidden = true; }, 360);
  }

  function renderSheet() {
    el.sheetT.textContent = deckConf(state.deckKey).label || '';
    el.sheetL.innerHTML = '';

    if (!state.queue.length) {
      var p = document.createElement('li');
      p.className = 'sheet__empty';
      p.textContent = state.failed ? 'This playlist is unavailable here. Choose another singer or open YT Music.' : 'Warming up this playlist…';
      el.sheetL.appendChild(p);
      return;
    }

    state.queue.forEach(function (t, i) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'row' + (i === state.index ? ' is-current' : '');
      b.innerHTML =
        '<span class="row__n">' + (i === state.index
            ? '<span class="bars"><i></i><i></i><i></i></span>'
            : (i + 1)) + '</span>' +
        '<span class="row__thumb"><img src="' + thumb(t.id) + '" alt="" loading="lazy"></span>' +
        '<span class="row__t"></span>';
      b.querySelector('.row__t').textContent = t.title || 'Track ' + (i + 1);
      if (i === state.index) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', function () {
        state.pausedByUser = false;
        state.errors = 0;
        unlockSound();
        playIndex(i, true);
      });
      li.appendChild(b);
      el.sheetL.appendChild(li);
    });
  }

  /* ======================================================================
     DEVELOPER CARD  —  purely cosmetic. It never calls the player, so the
     song keeps running the whole time this is open.
     ====================================================================== */

  function devConf() {
    var d = SITE.developer || {};
    return {
      name: d.name || SITE.creditName || '',
      role: d.role || '',
      links: [
        { a: el.devIg, url: d.instagram },
        { a: el.devX,  url: d.x },
        { a: el.devLi, url: d.linkedin }
      ]
    };
  }

  function usable(url) {
    return !!url && !/PASTE_/i.test(url) && url !== '#';
  }

  function initDevCard() {
    var d = devConf();

    if (d.name) el.devName.textContent = d.name;
    if (d.role) el.devRole.textContent = d.role;
    else el.devRole.hidden = true;

    d.links.forEach(function (l) {
      if (!l.a) return;
      if (usable(l.url)) l.a.href = l.url;
      else l.a.hidden = true;      /* not filled in yet — just don't show it */
    });
  }

  /* sit the card right under the name, and keep it on screen */
  function placeDevCard() {
    if (!state.devOpen) return;
    var r  = el.creditNm.getBoundingClientRect();
    var cw = el.devCard.offsetWidth;
    var gap = 10;

    var right = window.innerWidth - r.right;
    right = clamp(right, 12, Math.max(12, window.innerWidth - cw - 12));

    el.devCard.style.top   = (r.bottom + gap) + 'px';
    el.devCard.style.right = right + 'px';
  }

  function openDev() {
    if (state.devOpen) return;
    state.devOpen = true;

    el.devScrim.hidden = false;
    el.devCard.hidden  = false;
    placeDevCard();

    requestAnimationFrame(function () {
      if (!state.devOpen) return;
      el.devScrim.classList.add('is-on');
      el.devCard.classList.add('is-open');
      placeDevCard();
    });

    el.creditNm.setAttribute('aria-expanded', 'true');
  }

  function closeDev() {
    if (!state.devOpen) return;
    state.devOpen = false;

    el.devScrim.classList.remove('is-on');
    el.devCard.classList.remove('is-open');
    el.creditNm.setAttribute('aria-expanded', 'false');

    setTimeout(function () {
      if (state.devOpen) return;
      el.devCard.hidden  = true;
      el.devScrim.hidden = true;
    }, 300);
  }

  function toggleDev() { state.devOpen ? closeDev() : openDev(); }

  /* ======================================================================
     SOUND UNLOCK — browsers only allow a muted autostart
     ====================================================================== */

  function unlockSound(explicit, automatic) {
    if (!automatic) state.soundRequested = true;
    if (!state.ready || !player || (state.pausedByUser && explicit !== true)) return;
    try {
      if (explicit === true && volume === 0) {
        volume = clamp(lastAudibleVolume, 1, 100);
        saveSetting('rw-volume', volume);
        if (el.volume) {
          el.volume.value = volume;
          el.volume.setAttribute('aria-valuetext', volume + '%');
        }
      }
      // A browser may accept unMute() then pause asynchronously instead of
      // emitting onAutoplayBlocked. Keep a short recovery window for this
      // automatic attempt only; deliberate pauses must still be respected.
      state.autoUnlockUntil = automatic ? Date.now() + 2000 : 0;
      if (automatic) state.mutedFallback = -1;
      player.setVolume(volume);
      player.unMute();
      if (volume > 0 && (!player.isMuted || !player.isMuted())) {
        state.unlocked = true;
        el.nudge.hidden = true;
      } else { state.unlocked = false; el.nudge.hidden = false; }
      syncSoundUI();
      if (explicit === true && !state.pausedByUser && state.queue.length && !state.resolving) player.playVideo();
      // The iframe receives unMute asynchronously; isMuted can still return
      // its old value until the next message from YouTube arrives.
      clearTimeout(soundCheckTimer);
      var request = state.loadId, track = state.trackId;
      soundCheckTimer = setTimeout(function () {
        if (request !== state.loadId || track !== state.trackId || state.pausedByUser || state.failed) return;
        try {
          state.unlocked = volume > 0 && !player.isMuted();
          el.nudge.hidden = state.unlocked;
          syncSoundUI();
        } catch (e) {}
      }, 250);
    } catch (e) { el.nudge.hidden = false; }
  }

  function watchForGesture() {
    /* Generic interactions may unlock an already playing tape. Controls and
       dialogs keep their own intent: opening credits never starts audio. */
    var gesture = function (event) {
      if (state.unlocked || state.pausedByUser || state.devOpen || state.sheetOpen) return;
      var target = event.target;
      if (target && target.closest && target.closest('button,a,input,select,textarea,[role="slider"],[role="dialog"],[contenteditable]')) return;
      if (event.type === 'keydown' && event.key !== 'Enter') return;
      if (!state.playing) return;
      unlockSound();
    };
    window.addEventListener('pointerdown', gesture, { passive: true });
    window.addEventListener('keydown', gesture);
  }

  /* ======================================================================
     LIVE COUNT
     ====================================================================== */

  function startLive() {
    var cfg = SITE.live || {};
    if (!cfg.enabled) { el.liveWrap.style.display = 'none'; return; }

    if (cfg.endpoint) {
      var pull = function () {
        fetch(cfg.endpoint)
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (j && typeof j.count === 'number' && isFinite(j.count) && j.count >= 0) {
              el.liveN.textContent = Math.floor(j.count);
              el.liveN.hidden = false;
              var liveLabel = el.liveWrap.querySelector('.live__label');
              if (liveLabel) liveLabel.textContent = 'listening now';
              el.liveWrap.title = 'People in the shop right now';
            }
          })
          .catch(function () {});
      };
      pull();
      setInterval(pull, 15000);
      return;
    }

    el.liveN.hidden = true;
    var label = el.liveWrap.querySelector('.live__label');
    if (label) label.textContent = 'shop is open';
    el.liveWrap.title = 'The music is always welcome here';
  }

  /* ======================================================================
     LINKS
     ====================================================================== */

  function syncYtMusic() {
    var d = deckConf(state.deckKey);
    var url = d.ytMusicUrl;
    if (!url) {
      var list = listId(d.playlist);
      if (list) url = 'https://music.youtube.com/playlist?list=' + list;
    }
    if (!url) {
      var t = state.queue[state.index];
      url = t ? 'https://music.youtube.com/watch?v=' + t.id : 'https://music.youtube.com';
    }
    el.ytmBtn.href = url;
  }

  /* ======================================================================
     YOUTUBE PLAYER
     ====================================================================== */

  var playerSession = 0;

  function connectionFailed() {
    if (state.ready) return;
    clearTimeout(apiTimer);
    setPlaying(false);
    setStatus('The tape deck could not connect to YouTube. Press Play to retry. In an in-app preview, try opening this page in Chrome or Safari.');
    el.playBtn.setAttribute('aria-label', 'Retry music connection');
    el.playBtn.title = 'Retry music connection';
  }

  function createPlayer() {
    if (player || !window.YT || !YT.Player) return;
    var session = ++playerSession;
    try {
      player = new YT.Player('ytPlayer', {
        width: '640', height: '360',
        playerVars: {
          autoplay: 1, controls: 0, mute: state.soundRequested ? 0 : 1, playsinline: 1,
          rel: 0, modestbranding: 1, iv_load_policy: 3,
          disablekb: 1, fs: 0, origin: location.origin
        },
        events: {
          onReady: function () { if (session === playerSession) onReady(); },
          onStateChange: function (e) { if (session === playerSession) onStateChange(e); },
          onError: function (event) { if (session === playerSession) onError(event); },
          onAutoplayBlocked: function () { if (session === playerSession) autoplayBlocked(); }
        }
      });
    } catch (e) { player = null; connectionFailed(); }
  }

  window.onYouTubeIframeAPIReady = createPlayer;

  function startPlayer() {
    if (state.ready) return;
    clearTimeout(apiTimer);
    if (player) {
      playerSession++;
      try { player.destroy(); } catch (e) {}
      player = null;
      if (!$('#ytPlayer')) {
        var slot = $('#tvVideo');
        slot.textContent = '';
        var placeholder = document.createElement('div');
        placeholder.id = 'ytPlayer';
        slot.appendChild(placeholder);
      }
    }
    setStatus('');
    apiTimer = setTimeout(connectionFailed, 16000);
    if (window.YT && YT.Player) { createPlayer(); return; }
    if (apiScript) apiScript.remove();
    apiScript = document.createElement('script');
    apiScript.src = 'https://www.youtube.com/iframe_api';
    apiScript.onerror = connectionFailed;
    document.head.appendChild(apiScript);
  }

  function onReady() {
    state.ready = true;
    clearTimeout(apiTimer);
    try {
      player.setVolume(volume);
      if (state.soundRequested) player.unMute();
      else player.mute();
    } catch (e) {}
    el.tv.classList.add('is-ready');
    layout();
    var key = state.deckKey;
    loadDeck(key, state.autoplay && !state.pausedByUser).then(function () {
      if (state.deckKey !== key || !state.queue.length) return;
      clearTimeout(unlockTimer);
      var request = state.loadId, track = state.trackId;
      unlockTimer = setTimeout(function () {
        if (request !== state.loadId || track !== state.trackId) return;
        if (state.pausedByUser || state.devOpen || state.sheetOpen || !state.queue.length) return;
        unlockSound(false, true);
        if (!state.unlocked) el.nudge.hidden = false;
      }, 900);
    });
  }

  function autoplayBlocked() {
    state.unlocked = false;
    syncSoundUI();
    if (state.pausedByUser || !state.queue.length) return;
    el.nudge.hidden = false;
    try {
      player.mute();
      if (state.mutedFallback !== state.trackId) {
        state.mutedFallback = state.trackId;
        player.playVideo();
      }
    } catch (e) {}
  }

  function onStateChange(e) {
    if (state.resolving) {
      if (e.data === 5) state.resolving.cued = true;
      return;
    }
    if (!state.queue.length) { setPlaying(false); return; }
    /* Events may arrive late after a rapid switch. Only the selected video
       may change playback UI or advance our queue. */
    try {
      var eventVideo = player.getVideoData();
      if (eventVideo && eventVideo.video_id && eventVideo.video_id !== state.queue[state.index].id) return;
    } catch (err) {}
    if (e.data === YT.PlayerState.PLAYING) {
      if (state.pausedByUser) { try { player.pauseVideo(); } catch (err) {} return; }
      state.loading = false;
      setPlaying(true);
      saveSetting('rw-playable-' + state.deckKey, state.queue[state.index].id);
      state.errors = 0;
      setStatus('');
      try {
        var d = player.getVideoData();
        var t = state.queue[state.index];
        if (d && d.title && t && d.video_id === t.id && !t.title) {
          t.title = d.title;
          paintNowPlaying();
          if (state.sheetOpen) renderSheet();
        }
        if (volume > 0 && !player.isMuted()) { state.unlocked = true; el.nudge.hidden = true; }
        else { state.unlocked = false; el.nudge.hidden = false; }
        syncSoundUI();
      } catch (err) {}
    } else if (e.data === YT.PlayerState.PAUSED) {
      state.loading = false;
      setPlaying(false);
      if (!state.pausedByUser && Date.now() < state.autoUnlockUntil) {
        state.autoUnlockUntil = 0;
        autoplayBlocked();
      } else if (!state.pausedByUser && !state.unlocked) el.nudge.hidden = false;
    } else if (e.data === YT.PlayerState.ENDED) {
      setPlaying(false);
      if (!state.pausedByUser) playIndex(state.repeat ? state.index : state.index + 1, true);
    } else if (e.data === 5) {
      state.loading = false;
      setPlaying(false);
    } else if (e.data === -1) setPlaying(false);
  }

  /* Playlist access and video embedding permission are separate. Try each
     track at most once; a fixed six-song cutoff abandons otherwise good lists. */
  function onError(event) {
    var code = event && Number(event.data) || 0;
    if (state.resolving) {
      // Error 150 can refer to the first video while the list itself is valid.
      // Configuration/client errors, however, cannot be repaired by skipping.
      if (code === 153 || code === 5) {
        var resolving = state.resolving;
        resolving.cancel();
        state.loadId++;
        playbackFailure(code);
      }
      return;
    }
    if (!state.queue.length || state.pausedByUser) return;
    try {
      var failedVideo = player.getVideoData();
      if (failedVideo && failedVideo.video_id && failedVideo.video_id !== state.queue[state.index].id) return;
    } catch (e) {}
    state.lastError = code;
    if (state.errorTrack === state.trackId) return;
    state.errorTrack = state.trackId;
    clearTimeout(errorTimer);
    state.loading = false;
    setPlaying(false);
    var selected = state.queue[state.index];
    console.warn("[R's World] YouTube playback error", {
      code: code, videoId: selected.id, playlist: state.deckKey,
      attempt: state.errors + 1, tracks: state.queue.length
    });
    if (readSetting('rw-playable-' + state.deckKey) === selected.id) {
      saveSetting('rw-playable-' + state.deckKey, '');
    }
    if (code === 153 || code === 5) { playbackFailure(code); return; }
    rememberUnavailable(selected.id, code);
    state.errors++;
    if (!eligibleTracks(state.queue).length) { playbackFailure(code); return; }
    setStatus('Skipping an unavailable song…');
    var request = state.loadId, track = state.trackId;
    errorTimer = setTimeout(function () {
      if (request === state.loadId && track === state.trackId && !state.pausedByUser) playIndex(state.index + 1, true);
    }, 150);
  }

  function playbackFailure(code) {
    state.loading = false;
    state.failed = true;
    setPlaying(false);
    setSeek(0, 0);
    el.nudge.hidden = true;
    if (code === 153) {
      setStatus('YouTube could not verify this browser (error 153). Open this page in Chrome or Safari, or use YT Music.');
    } else if (code === 5) {
      setStatus('YouTube could not start its video player (error 5). Press Play to retry, or open YT Music.');
    } else if (code === 101 || code === 150) {
      setStatus('YouTube blocks embedded playback for every song tried in this playlist (error ' + code + '). Open YT Music to listen.');
    } else {
      setStatus('No songs in this playlist could play here. Press Play to retry, or open YT Music.');
    }
    if (state.sheetOpen) renderSheet();
  }

  function cycleSleep() {
    var options = [0, 15, 30, 60];
    sleepMinutes = options[(options.indexOf(sleepMinutes) + 1) % options.length];
    clearTimeout(sleepTimer);
    sleepUntil = sleepMinutes ? Date.now() + sleepMinutes * 60000 : 0;
    var label = sleepMinutes ? sleepMinutes + ' min' : 'Sleep';
    if (el.sleepLabel) el.sleepLabel.textContent = label;
    el.sleep.setAttribute('aria-label', sleepMinutes ? 'Sleep timer: ' + label + '. Click to change.' : 'Set sleep timer');
    el.sleep.setAttribute('aria-pressed', String(!!sleepMinutes));
    el.sleep.title = sleepMinutes ? 'Pause in ' + label : 'Set sleep timer';
    toast(sleepMinutes ? 'Music will pause in ' + label + '.' : 'Sleep timer off.');
    if (sleepMinutes) sleepTimer = setTimeout(checkSleep, sleepMinutes * 60000);
  }

  function checkSleep() {
    if (!sleepUntil || Date.now() < sleepUntil) return;
    sleepMinutes = 0;
    sleepUntil = 0;
    state.pausedByUser = true;
    clearTimeout(errorTimer);
    clearTimeout(unlockTimer);
    try { if (player) player.pauseVideo(); } catch (e) {}
    setPlaying(false);
    if (el.sleepLabel) el.sleepLabel.textContent = 'Sleep';
    if (el.sleep) {
      el.sleep.setAttribute('aria-pressed', 'false');
      el.sleep.setAttribute('aria-label', 'Set sleep timer');
      el.sleep.title = 'Set sleep timer';
    }
    toast('Sleep timer finished. Rest easy.');
  }

  function wireExtras() {
    if (el.shuffle) {
      el.shuffle.setAttribute('aria-pressed', String(state.shuffle));
      el.shuffle.addEventListener('click', function () {
        state.shuffle = !state.shuffle;
        el.shuffle.setAttribute('aria-pressed', String(state.shuffle));
        var current = state.queue[state.index];
        if (current) {
          var ordered = eligibleTracks(deckConf(state.deckKey)._items || state.queue);
          if (!ordered.some(function (t) { return t.id === current.id; })) ordered.push(current);
          if (state.shuffle) {
            state.queue = [current].concat(shuffle(ordered.filter(function (t) { return t.id !== current.id; })));
          } else state.queue = ordered;
          state.index = state.queue.findIndex(function (t) { return t.id === current.id; });
          paintNowPlaying();
          if (state.sheetOpen) renderSheet();
        }
        toast(state.shuffle ? 'Shuffle on. A little surprise in every tape.' : 'Original track order restored.');
      });
    }
    if (el.repeat) el.repeat.addEventListener('click', function () {
      state.repeat = !state.repeat;
      el.repeat.setAttribute('aria-pressed', String(state.repeat));
      toast(state.repeat ? 'This track is on repeat.' : 'Repeat off.');
    });
    if (el.surprise) el.surprise.addEventListener('click', function () {
      var singers = SITE.singers.filter(function (s) {
        if (s.key === state.view) return false;
        var d = deckConf(s.key);
        var snapshot = typeof PLAYLIST_SNAPSHOTS !== 'undefined' && PLAYLIST_SNAPSHOTS[listId(d.playlist)];
        var items = d._items || (snapshot && snapshot.tracks);
        return !items || eligibleTracks(items).length > 0;
      });
      if (!singers.length) return;
      var singer = singers[Math.floor(Math.random() * singers.length)];
      openSinger(singer.key);
      toast('A little ' + singer.name + ' for your night.');
    });
    if (el.volume) {
      el.volume.value = volume;
      el.volume.setAttribute('aria-valuetext', volume + '%');
      el.volume.addEventListener('input', function () {
        volume = clamp(Number(el.volume.value), 0, 100);
        saveSetting('rw-volume', volume);
        if (volume > 0) {
          lastAudibleVolume = volume;
          saveSetting('rw-audible-volume', volume);
        }
        el.volume.setAttribute('aria-valuetext', volume + '%');
        try { if (player && state.ready) player.setVolume(volume); } catch (e) {}
        if (volume > 0 && !state.pausedByUser) unlockSound();
        else if (volume === 0) {
          state.unlocked = false;
          if (state.playing) el.nudge.hidden = false;
          syncSoundUI();
        }
      });
    }
    if (el.sleep) el.sleep.addEventListener('click', cycleSleep);
  }

  function tick() {
    if (state.queue.length && !state.resolving && !state.failed && !state.loading && player && player.getDuration) {
      try {
        var d = player.getDuration() || 0;
        var c = player.getCurrentTime() || 0;
        if (d > 0) setSeek(c, d);
      } catch (e) {}
    }
    setTimeout(tick, 300);
  }

  /* ======================================================================
     WIRING
     ====================================================================== */

  function wire() {
    el.homeBtn.addEventListener('click', function () { unlockSound(); goHome(); });
    el.playBtn.addEventListener('click', togglePlay);
    el.nextBtn.addEventListener('click', function () { unlockSound(); next(); });
    el.prevBtn.addEventListener('click', function () { unlockSound(); prev(); });
    el.listBtn.addEventListener('click', function () {
      state.sheetOpen ? closeSheet() : openSheet();
    });
    el.sheetX.addEventListener('click', closeSheet);
    el.nudge.addEventListener('click', function () { state.pausedByUser = false; unlockSound(true); });
    wireExtras();

    /* ---- developer card ---- */
    el.creditNm.addEventListener('click', function (e) {
      e.stopPropagation();          /* don't let this click close it again */
      toggleDev();
    });
    /* any click on the page (the scrim covers all of it) closes the card,
       and the click stops there so nothing else gets triggered by accident */
    el.devScrim.addEventListener('click', closeDev);
    /* clicks inside the card stay inside — the three links keep working */
    el.devCard.addEventListener('click', function (e) { e.stopPropagation(); });

    document.addEventListener('click', function (e) {
      if (!state.sheetOpen) return;
      /* Selecting a song rebuilds the rows before this event reaches document.
         Its original path still identifies a tap inside the playlist. */
      var path = e.composedPath ? e.composedPath() : [];
      if (path.indexOf(el.sheet) !== -1 || el.sheet.contains(e.target) || el.listBtn.contains(e.target)) return;
      closeSheet();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeSheet(); closeDev(); }
      if (e.defaultPrevented || e.repeat) return;
      if (e.target && e.target.closest && e.target.closest('button,a,input,select,textarea,[role="slider"],[role="dialog"],[contenteditable]')) return;
      /* Space on the name opens the card instead of pausing the music */
      if (e.target === el.creditNm || (el.devCard && el.devCard.contains(e.target))) return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      if (e.key === 'ArrowRight' && e.altKey) { e.preventDefault(); unlockSound(); next(); }
      if (e.key === 'ArrowLeft' && e.altKey) { e.preventDefault(); unlockSound(); prev(); }
    });

    /* seek */
    var seekTo = function (clientX) {
      var r = el.seek.getBoundingClientRect();
      var p = clamp((clientX - r.left) / r.width, 0, 1);
      try {
        var d = player.getDuration() || 0;
        if (d) { player.seekTo(d * p, true); setSeek(d * p, d); }
      } catch (e) {}
    };
    el.seek.addEventListener('click', function (e) { unlockSound(); seekTo(e.clientX); });
    var seekPointer = null;
    el.seek.addEventListener('pointerdown', function (e) {
      if (!e.isPrimary || e.button !== 0) return;
      seekPointer = e.pointerId;
      el.seek.setPointerCapture(e.pointerId);
      unlockSound();
      seekTo(e.clientX);
    });
    el.seek.addEventListener('pointermove', function (e) {
      if (e.pointerId === seekPointer) seekTo(e.clientX);
    });
    el.seek.addEventListener('lostpointercapture', function () { seekPointer = null; });
    el.seek.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      try {
        var d = player.getDuration() || 0, c = player.getCurrentTime() || 0;
        player.seekTo(clamp(c + (e.key === 'ArrowRight' ? 5 : -5), 0, d), true);
      } catch (err) {}
    });

    /* keep the TV glued to the right spot */
    var raf = null;
    var relayout = function () {
      if (raf) return;
      raf = requestAnimationFrame(function () { raf = null; layout(); placeDevCard(); });
    };
    window.addEventListener('resize', relayout);
    window.addEventListener('orientationchange', relayout);
    window.addEventListener('scroll', relayout, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(relayout).observe(document.body);

    /* Safari sometimes parks the background video after a tab switch */
    document.addEventListener('visibilitychange', function () {
      checkSleep();
      if (!document.hidden && el.video.paused && motionAllowed()) el.video.play().catch(function () {});
    });
  }

  /* ======================================================================
     BOOT
     ====================================================================== */

  function boot() {
    el.body.classList.remove('is-booting');
    if (SITE.creditName) el.creditNm.textContent = SITE.creditName;
    el.igBtn.href = SITE.instagramUrl || '#';

    initDevCard();
    buildCards();
    markCards();
    wire();
    watchForGesture();
    layout();
    startLive();
    preloadBackdrops();
    tick();

    if (motionAllowed()) el.video.play().catch(function () {});
    else el.video.pause();

    if (location.protocol === 'file:') {
      el.title.textContent = 'Open this folder with a local server';
      el.label.textContent = 'YouTube blocks file:// pages';
    }

    syncYtMusic();
    startPlayer();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
