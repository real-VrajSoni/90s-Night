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
    nudge:    $('#soundNudge')
  };

  var state = {
    view:      'home',   // 'home' or a singer key
    deckKey:   'home',
    queue:     [],
    index:     0,
    playing:   false,
    unlocked:  false,
    ready:     false,
    sheetOpen: false,
    devOpen:   false,
    errors:    0,
    bdFront:   el.bdA
  };

  var player = null;

  /* ======================================================================
     SMALL HELPERS
     ====================================================================== */

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
    return window.matchMedia('(max-width: 899px), (orientation: portrait)').matches;
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
    });
  }

  /* ======================================================================
     PLAYLIST RESOLUTION
     ====================================================================== */

  function deckConf(key) { return SITE.decks[key] || SITE.decks.home; }

  function resolveDeck(key) {
    var d = deckConf(key);
    if (d._items) return Promise.resolve(d._items);

    var items = [];
    if (d.tracks && d.tracks.length) {
      items = d.tracks.map(function (t) {
        if (typeof t === 'string') return { id: videoId(t), title: '' };
        return { id: videoId(t.id || t.url || ''), title: t.title || '' };
      }).filter(function (t) { return t.id; });
      d._items = items;
      grabTitles(items);
      return Promise.resolve(items);
    }

    var list = listId(d.playlist);
    if (!list) { d._items = []; return Promise.resolve([]); }

    return listFromPlayer(list).then(function (ids) {
      d._items = ids.map(function (id) { return { id: id, title: '' }; });
      grabTitles(d._items);
      return d._items;
    });
  }

  /* Ask the YouTube player itself what is inside a playlist — no API key. */
  function listFromPlayer(list) {
    return new Promise(function (resolve) {
      if (!player || !player.cuePlaylist) return resolve([]);
      try { player.cuePlaylist({ list: list, listType: 'playlist' }); }
      catch (e) { return resolve([]); }

      var tries = 0;
      var iv = setInterval(function () {
        var p = null;
        try { p = player.getPlaylist(); } catch (e) {}
        if (p && p.length) { clearInterval(iv); resolve(p.slice()); }
        else if (++tries > 70) { clearInterval(iv); resolve([]); }
      }, 150);
    });
  }

  /* Titles, straight from YouTube's public oEmbed endpoint. */
  function grabTitles(items) {
    var pending = items.filter(function (t) { return !t.title; }).slice(0, 80);
    (function step(i) {
      if (i >= pending.length) return;
      var t = pending[i];
      fetch('https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=' + t.id)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (j && j.title) {
            t.title = j.title;
            if (state.sheetOpen) renderSheet();
            if (state.queue[state.index] === t) paintNowPlaying();
          }
          return sleep(70).then(function () { step(i + 1); });
        })
        .catch(function () { /* blocked — titles will fill in as songs play */ });
    })(0);
  }

  /* ======================================================================
     PLAYBACK
     ====================================================================== */

  function loadDeck(key, autoplay) {
    state.deckKey = key;
    el.label.textContent = deckConf(key).label || '';
    el.title.textContent = 'Loading the playlist…';
    setSeek(0, 0);
    syncYtMusic();

    return resolveDeck(key).then(function (items) {
      if (state.deckKey !== key) return;               /* user moved on already */

      if (!items.length) { showEmptyDeck(key); return; }

      state.queue = items.slice();
      if (SITE.shuffle) shuffle(state.queue);
      state.index = 0;
      state.errors = 0;
      playIndex(0, autoplay !== false);
      if (state.sheetOpen) renderSheet();
    });
  }

  function showEmptyDeck(key) {
    state.queue = [];
    el.title.textContent = 'Add this playlist in config.js';
    el.discArt.removeAttribute('src');
    el.body.classList.remove('is-playing');
    if (state.sheetOpen) renderSheet();
  }

  function playIndex(i, autoplay) {
    if (!state.queue.length || !player || !player.loadVideoById) return;
    state.index = (i % state.queue.length + state.queue.length) % state.queue.length;
    var t = state.queue[state.index];
    try {
      if (autoplay === false) player.cueVideoById(t.id);
      else player.loadVideoById(t.id);
    } catch (e) {}
    paintNowPlaying();
    if (state.sheetOpen) renderSheet();
  }

  function next() { if (state.queue.length) playIndex(state.index + 1, true); }
  function prev() {
    if (!state.queue.length) return;
    var t = 0;
    try { t = player.getCurrentTime() || 0; } catch (e) {}
    if (t > 4) { try { player.seekTo(0, true); } catch (e) {} return; }
    playIndex(state.index - 1, true);
  }

  function togglePlay() {
    if (!player) return;
    unlockSound();
    var s = -1;
    try { s = player.getPlayerState(); } catch (e) {}
    if (s === 1) { try { player.pauseVideo(); } catch (e) {} }
    else {
      if (!state.queue.length) { loadDeck(state.deckKey, true); return; }
      try { player.playVideo(); } catch (e) {}
    }
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
    el.tCur.textContent = time(cur);
    el.tDur.textContent = time(dur);
  }

  /* ======================================================================
     VIEWS
     ====================================================================== */

  function goHome() {
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
    if (isSmall()) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openSinger(key) {
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
      p.innerHTML = 'No songs loaded yet. Open <code>assets/js/config.js</code> and paste ' +
                    'your YouTube playlist link for this section.';
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
        '<span class="row__t">' + (t.title || 'Track ' + (i + 1)) + '</span>';
      b.addEventListener('click', function () {
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

  function unlockSound() {
    if (state.unlocked || !player) return;
    try {
      player.unMute();
      player.setVolume(SITE.startVolume || 85);
      if (player.isMuted && player.isMuted()) return;   /* still blocked */
      state.unlocked = true;
      el.nudge.hidden = true;
      player.playVideo();
    } catch (e) {}
  }

  function watchForGesture() {
    ['pointerdown', 'touchstart', 'keydown', 'wheel'].forEach(function (ev) {
      window.addEventListener(ev, unlockSound, { passive: true });
    });
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
            if (j && typeof j.count === 'number') el.liveN.textContent = j.count;
          })
          .catch(function () {});
      };
      pull();
      setInterval(pull, 15000);
      return;
    }

    var lo = cfg.min || 12, hi = cfg.max || 60;
    var n = parseInt(sessionStorage.getItem('rw-live'), 10);
    if (!n || n < lo || n > hi) {
      var hour = new Date().getHours();
      var busy = 0.45 + 0.55 * Math.max(0, Math.sin((hour - 6) / 24 * Math.PI * 2) * 0.5 + 0.5);
      n = Math.round(lo + (hi - lo) * busy * (0.75 + Math.random() * 0.35));
      n = clamp(n, lo, hi);
    }
    el.liveN.textContent = n;

    (function drift() {
      setTimeout(function () {
        var step = Math.round((Math.random() * 5 - 2.2));
        n = clamp(n + step, lo, hi);
        el.liveN.textContent = n;
        sessionStorage.setItem('rw-live', n);
        drift();
      }, 4200 + Math.random() * 5200);
    })();
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

  window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player('ytPlayer', {
      width: '640',
      height: '360',
      playerVars: {
        autoplay: 1, controls: 0, mute: 1, playsinline: 1,
        rel: 0, modestbranding: 1, iv_load_policy: 3,
        disablekb: 1, fs: 0, origin: location.origin
      },
      events: {
        onReady: onReady,
        onStateChange: onStateChange,
        onError: onError
      }
    });
  };

  function onReady() {
    state.ready = true;
    try { player.setVolume(SITE.startVolume || 85); } catch (e) {}
    el.tv.classList.add('is-ready');
    layout();
    loadDeck('home', true).then(function () {
      /* try to bring the sound up straight away; if the browser says no,
         the nudge appears and the first tap does it */
      setTimeout(function () {
        unlockSound();
        if (!state.unlocked) el.nudge.hidden = false;
      }, 900);
    });
  }

  function onStateChange(e) {
    if (e.data === YT.PlayerState.PLAYING) {
      state.playing = true;
      state.errors = 0;
      el.body.classList.add('is-playing');
      try {
        var d = player.getVideoData();
        var t = state.queue[state.index];
        if (d && d.title && t && !t.title) { t.title = d.title; paintNowPlaying(); if (state.sheetOpen) renderSheet(); }
        if (!player.isMuted()) { state.unlocked = true; el.nudge.hidden = true; }
      } catch (err) {}
    } else if (e.data === YT.PlayerState.PAUSED) {
      state.playing = false;
      el.body.classList.remove('is-playing');
    } else if (e.data === YT.PlayerState.ENDED) {
      state.playing = false;
      el.body.classList.remove('is-playing');
      next();
    }
  }

  /* a blocked or deleted video should never stall the night */
  function onError() {
    if (!state.queue.length) return;
    if (++state.errors > Math.min(6, state.queue.length)) return;
    setTimeout(next, 900);
  }

  function tick() {
    if (player && player.getDuration) {
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
    el.nudge.addEventListener('click', unlockSound);

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
      if (el.sheet.contains(e.target) || el.listBtn.contains(e.target)) return;
      closeSheet();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeSheet(); closeDev(); }
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      /* Space on the name opens the card instead of pausing the music */
      if (e.target === el.creditNm || (el.devCard && el.devCard.contains(e.target))) return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      if (e.key === 'ArrowRight' && e.altKey) next();
      if (e.key === 'ArrowLeft'  && e.altKey) prev();
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
      if (!document.hidden && el.video.paused) el.video.play().catch(function () {});
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
    layout();
    startLive();
    preloadBackdrops();
    tick();

    el.video.play().catch(function () {});

    if (location.protocol === 'file:') {
      el.title.textContent = 'Open this folder with a local server';
      el.label.textContent = 'YouTube blocks file:// pages';
    }

    var s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
