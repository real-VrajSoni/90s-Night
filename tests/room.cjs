/* Run: NODE_PATH=<playwright node_modules> node tests/room.cjs
   TEST_URL and BROWSER_EXECUTABLE may override the local server and Chromium.
   YouTube is replaced at its public API boundary; no external network is used. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseURL = process.env.TEST_URL || 'http://127.0.0.1:8000';
const config = fs.readFileSync(path.join(__dirname, '../assets/js/config.js'), 'utf8');
const maliciousTitle = '<img src=x onerror="window.titleExecuted=true"> A lovely old song';
const deckIds = {
  home: ['HOME0000001', 'HOME0000002', 'HOME0000003'],
  'kumar-sanu': ['KUMA0000001', 'KUMA0000002'],
  'udit-narayan': ['UDIT0000001', 'UDIT0000002'],
  abhijeet: ['ABHI0000001', 'ABHI0000002'],
  'sonu-nigam': ['SONU0000001', 'SONU0000002'],
};

// This double models only the documented API methods the site consumes.
// State events remain asynchronous, as they are for the actual iframe.
function installBoundary(options) {
  const test = window.__ytTest = {
    loads: [], cues: [], calls: [], current: '', muted: true, volume: 0,
    state: -1, time: 0, list: '', ready: null,
  };
  window.__installYTMock = function () {
    const states = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
    window.YT = {
      PlayerState: states,
      Player: function (targetId, settings) {
        test.settings = settings.playerVars;
        const events = settings.events;
        const frame = document.createElement('iframe');
        frame.title = 'YouTube test player';
        document.getElementById(targetId).replaceChildren(frame);
        const emit = function (state) {
          test.state = state;
          events.onStateChange({ data: state, target: api });
        };
        const api = {
          getIframe: () => frame,
          setVolume: value => { test.volume = value; test.calls.push('setVolume'); },
          getVolume: () => test.volume,
          mute: () => { test.muted = true; },
          unMute: () => {
            test.calls.push('unMute');
            if (options.pauseOnAutoUnmuteOnce && !test.calls.includes('autoUnmuteBlocked')) {
              test.muted = false;
              test.calls.push('autoUnmuteBlocked');
              // Some browsers pause an automatically unmuted iframe without
              // sending onAutoplayBlocked, even though isMuted is now false.
              setTimeout(() => emit(states.PAUSED), 0);
            } else if (options.delayedUnmute) {
              setTimeout(() => { test.muted = !!options.blockSound; }, 20);
            } else test.muted = !!options.blockSound;
          },
          isMuted: () => test.muted,
          getPlayerState: () => test.state,
          getDuration: () => 180,
          getCurrentTime: () => test.time,
          getVideoData: () => ({ video_id: test.reported || test.current, title: options.title }),
          getVideoUrl: () => 'https://www.youtube.com/watch?v=' + test.current + '&list=' + test.list,
          getPlaylist: () => (options.playlists[test.list] || []).slice(),
          getPlaylistId: () => test.list,
          cuePlaylist: value => {
            test.list = value.list;
            test.cues.push(value.list);
            setTimeout(() => emit(states.CUED), 0);
          },
          loadVideoById: value => {
            test.current = typeof value === 'string' ? value : value.videoId;
            test.loads.push(test.current);
            test.time = 0;
            const code = options.errorCodes[test.current] || (options.failTracks ? 150 : 0);
            setTimeout(() => code
              ? events.onError({ data: code, target: api }) : emit(states.PLAYING), 0);
          },
          cueVideoById: value => {
            test.current = typeof value === 'string' ? value : value.videoId;
            setTimeout(() => emit(states.CUED), 0);
          },
          playVideo: () => { test.calls.push('playVideo'); setTimeout(() => emit(states.PLAYING), 0); },
          pauseVideo: () => { test.calls.push('pauseVideo'); setTimeout(() => emit(states.PAUSED), 0); },
          stopVideo: () => { test.calls.push('stopVideo'); test.state = states.UNSTARTED; },
          seekTo: value => { test.time = value; test.calls.push('seekTo'); },
          setShuffle: () => {},
          setLoop: () => {},
        };
        test.emit = emit;
        test.error = (code = 150) => events.onError({ data: code, target: api });
        test.ready = () => events.onReady({ target: api });
        if (!options.manualReady) setTimeout(test.ready, 0);
        return api;
      },
    };
  };
}

async function openPage(browser, options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1440, height: 1000 },
    reducedMotion: options.reducedMotion || 'no-preference',
    hasTouch: !!options.touch,
    isMobile: !!options.touch,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const playlists = {};
  const fixtureDecks = Object.fromEntries(Object.entries({ ...deckIds, ...options.fixtureDeckIds }).map(([key, ids], index) => {
    const playlist = 'PLROOMTEST000' + index;
    playlists[playlist] = ids;
    return [key, {
      playlist: options.playlistMode ? playlist : '',
      tracks: options.playlistMode ? [] : ids.map(id => ({ id, title: maliciousTitle })),
    }];
  }));
  let fixtureConfig = config + '\nObject.entries(' + JSON.stringify(fixtureDecks) + ').forEach(([key, value]) => Object.assign(SITE.decks[key], value));\nSITE.shuffle = false;';
  if (options.snapshotList) fixtureConfig += '\nSITE.decks.home = {playlist:' + JSON.stringify(options.snapshotList) + ', tracks: []};';
  await page.addInitScript(installBoundary, {
    title: maliciousTitle, playlists, manualReady: !!options.manualReady,
    failTracks: !!options.failTracks, blockSound: !!options.blockSound,
    pauseOnAutoUnmuteOnce: !!options.pauseOnAutoUnmuteOnce,
    delayedUnmute: !!options.delayedUnmute,
    errorCodes: options.errorCodes || {},
  });
  if (options.savedVolume !== undefined) {
    await page.addInitScript(value => localStorage.setItem('rw-volume', String(value)), options.savedVolume);
  }
  if (options.savedPlayable) {
    await page.addInitScript(values => {
      for (const [key, id] of Object.entries(values)) localStorage.setItem('rw-playable-' + key, id);
    }, options.savedPlayable);
  }
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/assets/js/config.js')) {
      return route.fulfill({ contentType: 'text/javascript', body: fixtureConfig });
    }
    if (url.hostname === 'www.youtube.com' && url.pathname === '/iframe_api') {
      if (options.offline) return route.abort('internetdisconnected');
      return route.fulfill({ contentType: 'text/javascript', body: 'window.__installYTMock(); setTimeout(function () { window.onYouTubeIframeAPIReady(); }, 0);' });
    }
    if (url.hostname === 'www.youtube.com' && url.pathname === '/oembed') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ title: maliciousTitle }) });
    }
    if (url.origin === new URL(baseURL).origin) return route.continue();
    if (route.request().resourceType() === 'image') {
      return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><path fill="#654" d="M0 0h4v4H0z"/></svg>' });
    }
    return route.abort('blockedbyclient');
  });
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  return {
    page, errors,
    close: async () => { await context.close(); assert.deepEqual(errors, [], 'No uncaught page errors'); },
  };
}

async function playing(page) {
  await page.waitForFunction(() => window.__ytTest.loads.length > 0 && window.__ytTest.state === 1);
}

async function checkLayout(page) {
  const result = await page.evaluate(() => {
    const selectors = ['.topbar', '#deck', '#rack', '.pick', '#motionBtn'];
    return {
      width: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      outside: selectors.filter(selector => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return rect.left < -1 || rect.right > innerWidth + 1;
      }),
    };
  });
  assert.ok(result.documentWidth <= result.width + 1, 'Page does not scroll horizontally: ' + JSON.stringify(result));
  assert.deepEqual(result.outside, [], 'Primary controls fit the viewport');
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
  });
  let passed = 0;
  async function test(name, callback) {
    await callback();
    console.log('PASS ' + name);
    passed++;
  }
  try {
    await test('original room, automatic boot playback, controls and safe playlist titles', async () => {
      const session = await openPage(browser);
      const { page } = session;
      await playing(page);
      assert.equal(await page.locator('.stage video').count(), 1);
      assert.equal(await page.locator('.tv').count(), 1);
      assert.equal(await page.locator('.rack .card').count(), 4);
      assert.equal(await page.locator('.deck').count(), 1);
      assert.equal(await page.evaluate(() => __ytTest.loads[0]), deckIds.home[0], 'Music loads before a user click');
      assert.equal(await page.evaluate(() => __ytTest.settings.autoplay), 1);
      await page.waitForFunction(() => document.querySelector('#playBtn').getAttribute('aria-label') === 'Pause');
      await page.locator('#playBtn').click();
      await page.waitForFunction(() => document.querySelector('#playBtn').getAttribute('aria-label') === 'Play');
      await page.locator('#playBtn').press('Space');
      await playing(page);
      await page.locator('#listBtn').focus();
      const pauseCalls = await page.evaluate(() => __ytTest.calls.filter(x => x === 'pauseVideo').length);
      await page.keyboard.press('Space');
      await page.locator('#sheet').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#listBtn').getAttribute('aria-expanded'), 'true');
      assert.equal(await page.evaluate(() => __ytTest.calls.filter(x => x === 'pauseVideo').length), pauseCalls, 'Space activates the focused control without pausing');
      assert.equal(await page.locator('#sheetList .row').count(), deckIds.home.length);
      assert.equal(await page.locator('#sheetList .row__t').first().textContent(), maliciousTitle);
      assert.equal(await page.locator('#sheetList .row__t img').count(), 0, 'Remote title is rendered as text');
      assert.equal(await page.evaluate(() => !!window.titleExecuted), false);
      await page.keyboard.press('Escape');
      await page.locator('#sheet').waitFor({ state: 'hidden' });
      await page.locator('#volume').evaluate(input => {
        input.value = '37';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      assert.equal(await page.evaluate(() => __ytTest.volume), 37);
      assert.equal(await page.evaluate(() => localStorage.getItem('rw-volume')), '37');
      await page.locator('#shuffleBtn').click();
      assert.equal(await page.locator('#shuffleBtn').getAttribute('aria-pressed'), 'true');
      await page.locator('#shuffleBtn').click();
      assert.equal(await page.locator('#shuffleBtn').getAttribute('aria-pressed'), 'false');
      await page.locator('#repeatBtn').click();
      assert.equal(await page.locator('#repeatBtn').getAttribute('aria-pressed'), 'true');
      const repeatId = await page.evaluate(() => __ytTest.current);
      const countBeforeRepeat = await page.evaluate(() => __ytTest.loads.length);
      await page.evaluate(() => __ytTest.emit(YT.PlayerState.ENDED));
      await page.waitForFunction(count => __ytTest.loads.length > count, countBeforeRepeat);
      assert.equal(await page.evaluate(() => __ytTest.current), repeatId, 'Repeat restarts the same song');
      for (const expected of ['15', '30', '60']) {
        await page.locator('#sleepBtn').click();
        assert.match(await page.locator('#sleepLabel').textContent(), new RegExp(expected));
      }
      await page.locator('#sleepBtn').click();
      assert.equal(await page.locator('#sleepLabel').textContent(), 'Sleep');
      assert.match(await page.locator('#sleepBtn').getAttribute('aria-label'), /off|set sleep timer/i);
      await page.locator('#surpriseBtn').click();
      await page.waitForFunction(() => document.querySelector('.card.is-live'));
      assert.equal(await page.locator('body.is-singer').count(), 1);
      await page.locator('#homeBtn').click();
      await page.waitForFunction(() => __ytTest.current.startsWith('HOME'));
      assert.equal(await page.locator('body.is-home').count(), 1);
      await session.close();
    });

    await test('a singer selected before YouTube is ready remains selected', async () => {
      const session = await openPage(browser, { manualReady: true });
      const { page } = session;
      await page.waitForFunction(() => typeof __ytTest.ready === 'function');
      await page.locator('.card[data-key="kumar-sanu"]').click();
      await page.locator('.card[data-key="udit-narayan"]').click();
      await page.locator('.card[data-key="sonu-nigam"]').click();
      assert.equal(await page.evaluate(() => __ytTest.loads.length), 0);
      await page.evaluate(() => __ytTest.ready());
      await playing(page);
      assert.ok(await page.evaluate(() => __ytTest.loads.every(id => id.startsWith('SONU'))), 'Only the latest selection is loaded');
      assert.equal(await page.evaluate(() => __ytTest.muted), false, 'The early artist click also requests sound');
      assert.match(await page.locator('#deckLabel').textContent(), /Sonu/);
      await session.close();
    });

    await test('playlist API resolution and saved volume', async () => {
      const session = await openPage(browser, { playlistMode: true, savedVolume: 23 });
      const { page } = session;
      await playing(page);
      assert.equal(await page.evaluate(() => __ytTest.current), deckIds.home[0]);
      assert.equal(await page.evaluate(() => __ytTest.volume), 23);
      await page.locator('.card[data-key="kumar-sanu"]').click();
      await page.locator('.card[data-key="udit-narayan"]').click();
      await page.waitForFunction(() => __ytTest.current.startsWith('UDIT'));
      assert.match(await page.locator('#deckLabel').textContent(), /Udit/);
      await session.close();
    });

    await test('blocked sound offers the one-tap sound control', async () => {
      const session = await openPage(browser, { blockSound: true });
      await playing(session.page);
      await session.page.locator('#soundNudge').waitFor({ state: 'visible' });
      assert.equal(await session.page.evaluate(() => __ytTest.muted), true);
      await session.close();
    });

    await test('a browser pause after automatic unmute restores muted playback until a sound tap', async () => {
      const session = await openPage(browser, {
        pauseOnAutoUnmuteOnce: true, delayedUnmute: true, reducedMotion: 'reduce',
      });
      const { page } = session;
      await page.waitForFunction(() => __ytTest.calls.includes('autoUnmuteBlocked') &&
        __ytTest.state === YT.PlayerState.PLAYING && __ytTest.muted);
      assert.equal(await page.locator('#playBtn').getAttribute('aria-label'), 'Play with sound', 'Muted playback offers sound activation instead of pause');
      await page.locator('#soundNudge').waitFor({ state: 'visible' });
      await page.locator('#soundNudge').click();
      await page.waitForFunction(() => __ytTest.state === YT.PlayerState.PLAYING && !__ytTest.muted);
      await page.locator('#soundNudge').waitFor({ state: 'hidden' });
      assert.deepEqual(await page.evaluate(() => __ytTest.loads), [deckIds.home[0]], 'Recovery preserves the selected song');
      await session.close();
    });

    await test('the main button enables sound during muted playback instead of pausing', async () => {
      const session = await openPage(browser, { delayedUnmute: true, reducedMotion: 'reduce' });
      const { page } = session;
      await playing(page);
      await page.evaluate(() => { __ytTest.muted = true; __ytTest.emit(YT.PlayerState.PLAYING); });
      assert.equal(await page.locator('#playBtn').getAttribute('aria-label'), 'Play with sound');
      const pauses = await page.evaluate(() => __ytTest.calls.filter(x => x === 'pauseVideo').length);
      await page.locator('#playBtn').click();
      await page.waitForFunction(() => !__ytTest.muted && document.querySelector('#playBtn').getAttribute('aria-label') === 'Pause');
      assert.equal(await page.evaluate(() => __ytTest.calls.filter(x => x === 'pauseVideo').length), pauses);
      await page.locator('#playBtn').click();
      await page.waitForFunction(() => __ytTest.state === YT.PlayerState.PAUSED);
      await session.close();
    });

    await test('explicit sound activation restores zero volume without changing the selected song', async () => {
      const session = await openPage(browser, { savedVolume: 0, reducedMotion: 'reduce' });
      const { page } = session;
      await playing(page);
      assert.equal(await page.evaluate(() => __ytTest.volume), 0, 'Automatic playback respects saved zero volume');
      const song = await page.evaluate(() => __ytTest.current);
      await page.locator('#soundNudge').click();
      await page.waitForFunction(() => __ytTest.volume > 0 && !__ytTest.muted);
      assert.equal(await page.evaluate(() => __ytTest.current), song);
      assert.equal(await page.locator('#volume').inputValue(), '85');
      await page.locator('#volume').fill('37');
      await page.locator('#volume').fill('0');
      await page.locator('#playBtn').click();
      await page.waitForFunction(() => __ytTest.volume === 37);
      assert.equal(await page.locator('#volume').inputValue(), '37', 'Last audible volume is restored');
      await session.close();
    });

    await test('original singer URLs resolve to their own recovered song lists', async () => {
      const snapshots = Function(fs.readFileSync(path.join(__dirname, '../assets/js/playlist-snapshots.js'), 'utf8') + '; return PLAYLIST_SNAPSHOTS;')();
      const catalog = Function(fs.readFileSync(path.join(__dirname, '../assets/js/playback-availability.js'), 'utf8') + '; return PLAYBACK_AVAILABILITY;')();
      for (const [list, snapshot] of Object.entries(snapshots)) {
        assert.equal(new URL(snapshot.source).searchParams.get('list'), list);
        assert.equal(new Set(snapshot.tracks.map(t => t.id)).size, snapshot.tracks.length);
        const session = await openPage(browser, { snapshotList: snapshot.source });
        const fresh = Date.parse(catalog.checkedAt) + 7 * 86400000 > Date.now();
        const available = snapshot.tracks.filter(t => !fresh || !catalog.blocked[t.id]);
        if (!available.length) {
          await session.page.waitForFunction(() => /blocks embedded playback/.test(document.querySelector('#playerStatus').textContent));
          assert.deepEqual(await session.page.evaluate(() => __ytTest.loads), []);
          await session.close();
          continue;
        }
        await playing(session.page);
        assert.equal(await session.page.evaluate(() => __ytTest.current), available[0].id);
        assert.deepEqual(await session.page.evaluate(() => __ytTest.cues), [], 'The broken playlist endpoint is not needed for a recovered original list');
        await session.page.locator('#listBtn').click();
        assert.equal(await session.page.locator('#sheetList .row').count(), available.length);
        await session.close();
      }
    });

    await test('a playlist continues beyond six blocked songs to a playable track', async () => {
      const ids = Array.from({ length: 9 }, (_, index) => 'LONG' + String(index + 1).padStart(7, '0'));
      const session = await openPage(browser, {
        playlistMode: true,
        fixtureDeckIds: { home: ids },
        errorCodes: Object.fromEntries(ids.slice(0, 7).map((id, index) => [id, index % 2 ? 101 : 150])),
      });
      const { page } = session;
      await playing(page);
      assert.deepEqual(await page.evaluate(() => __ytTest.loads), ids.slice(0, 8), 'The seventh failure does not abandon the playlist');
      assert.equal(await page.evaluate(() => __ytTest.current), ids[7]);
      assert.equal(await page.evaluate(() => localStorage.getItem('rw-playable-home')), ids[7], 'A successful song is remembered for the next visit');
      await session.close();
    });

    await test('shuffle preserves the song and progress, and never reintroduces a failed track', async () => {
      const session = await openPage(browser, { errorCodes: { [deckIds.home[0]]: 150 } });
      const { page } = session;
      await playing(page);
      assert.equal(await page.evaluate(() => __ytTest.current), deckIds.home[1]);
      const loads = await page.evaluate(() => __ytTest.loads.length);
      await page.evaluate(() => { __ytTest.time = 42; });
      for (let i = 0; i < 8; i++) await page.locator('#shuffleBtn').click();
      assert.equal(await page.evaluate(() => __ytTest.loads.length), loads, 'Shuffle never reloads the current song');
      assert.equal(await page.evaluate(() => __ytTest.time), 42, 'Shuffle preserves progress');
      for (let i = 0; i < 5; i++) { await page.locator('#nextBtn').click(); await playing(page); }
      assert.equal(await page.evaluate(id => __ytTest.loads.filter(x => x === id).length, deckIds.home[0]), 1);
      await page.reload();
      await playing(page);
      assert.equal(await page.evaluate(id => __ytTest.loads.includes(id), deckIds.home[0]), false, 'Failures survive a reload');
      await session.close();
    });

    await test('a late error for a previous song cannot skip the current selection', async () => {
      const session = await openPage(browser);
      const { page } = session;
      await playing(page);
      await page.locator('#nextBtn').click();
      await playing(page);
      const current = await page.evaluate(() => __ytTest.current);
      const loads = await page.evaluate(() => __ytTest.loads.length);
      await page.evaluate(old => { __ytTest.reported = old; __ytTest.error(150); delete __ytTest.reported; }, deckIds.home[0]);
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => __ytTest.current), current);
      assert.equal(await page.evaluate(() => __ytTest.loads.length), loads);
      assert.equal(await page.locator('#playerStatus').textContent(), '');
      await session.close();
    });

    await test('surprise avoids an artist whose entire playlist failed', async () => {
      const session = await openPage(browser, { errorCodes: Object.fromEntries(deckIds['sonu-nigam'].map(id => [id, 150])) });
      const { page } = session;
      await playing(page);
      await page.locator('.card[data-key="sonu-nigam"]').click();
      await page.waitForFunction(() => /blocks embedded playback/.test(document.querySelector('#playerStatus').textContent));
      await page.locator('#homeBtn').click();
      await playing(page);
      for (let i = 0; i < 8; i++) {
        await page.locator('#surpriseBtn').click();
        await playing(page);
        assert.equal(await page.locator('.card[data-key="sonu-nigam"]').getAttribute('aria-pressed'), 'false');
      }
      await session.close();
    });

    await test('an entirely unavailable playlist stops after trying each song once', async () => {
      const ids = Array.from({ length: 9 }, (_, index) => 'FAIL' + String(index + 1).padStart(7, '0'));
      const session = await openPage(browser, {
        playlistMode: true,
        fixtureDeckIds: { home: ids },
        failTracks: true,
      });
      const { page } = session;
      await page.waitForFunction(() => /blocks embedded playback for every song/i.test(document.querySelector('#playerStatus').textContent), undefined, { timeout: 15000 });
      const attempts = await page.evaluate(() => __ytTest.loads.length);
      assert.deepEqual(await page.evaluate(() => __ytTest.loads), ids, 'Every song is attempted exactly once');
      await page.waitForTimeout(1300);
      assert.equal(await page.evaluate(() => __ytTest.loads.length), attempts, 'No endless retry loop');
      assert.equal(await page.evaluate(() => localStorage.getItem('rw-playable-home')), null, 'Unavailable songs are never remembered as playable');
      assert.equal(await page.locator('#playBtn').getAttribute('aria-label'), 'Play');
      await session.close();
    });

    await test('YouTube client identity errors stop immediately with a useful explanation', async () => {
      const session = await openPage(browser, { errorCodes: { [deckIds.home[0]]: 153 } });
      const { page } = session;
      await page.waitForFunction(() => /could not verify this browser.*153/i.test(document.querySelector('#playerStatus').textContent));
      await page.waitForTimeout(1300);
      assert.deepEqual(await page.evaluate(() => __ytTest.loads), [deckIds.home[0]], 'A player configuration error does not skip through songs');
      assert.equal(await page.locator('#playBtn').getAttribute('aria-label'), 'Play');
      assert.equal(await page.evaluate(() => localStorage.getItem('rw-playable-home')), null);
      await session.close();
    });

    await test('saved playable songs are restored only when still present in the current playlist', async () => {
      const session = await openPage(browser, {
        playlistMode: true,
        savedPlayable: { home: deckIds.home[2], 'kumar-sanu': deckIds['kumar-sanu'][1] },
      });
      const { page } = session;
      await playing(page);
      assert.equal(await page.evaluate(() => __ytTest.loads[0]), deckIds.home[2], 'The last playable home song is tried first');
      await page.locator('.card[data-key="kumar-sanu"]').click();
      await page.waitForFunction(() => __ytTest.current.startsWith('KUMA'));
      assert.equal(await page.evaluate(() => __ytTest.current), deckIds['kumar-sanu'][1], 'Each singer restores its own known playable song');
      await session.close();

      const stale = await openPage(browser, {
        playlistMode: true,
        savedPlayable: { home: 'GONE0000001' },
      });
      await playing(stale.page);
      assert.equal(await stale.page.evaluate(() => __ytTest.loads[0]), deckIds.home[0], 'A removed song is ignored');
      assert.equal(await stale.page.evaluate(() => __ytTest.loads.includes('GONE0000001')), false);
      assert.equal(await stale.page.evaluate(() => localStorage.getItem('rw-playable-home')), deckIds.home[0], 'A stale saved song is replaced after successful playback');
      await stale.close();
    });

    await test('offline iframe API reports recovery without breaking the room', async () => {
      const session = await openPage(browser, { offline: true });
      const { page } = session;
      await page.waitForFunction(() => /could not connect|offline|unavailable|retry|try again|network/i.test(document.querySelector('#playerStatus').textContent), undefined, { timeout: 20000 });
      assert.equal(await page.locator('.rack .card').count(), 4);
      await page.locator('.card[data-key="abhijeet"]').click();
      assert.match(await page.locator('#deckLabel').textContent(), /Abhijeet/);
      await page.locator('#playBtn').click();
      await session.close();
    });

    await test('six viewport sizes keep the room and controls within the screen', async () => {
      const session = await openPage(browser);
      const { page } = session;
      await playing(page);
      for (const width of [320, 390, 768, 1024, 1440, 1920]) {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 1080 });
        await page.waitForTimeout(120);
        await checkLayout(page);
        for (const selector of ['#playBtn', '#motionBtn', '#surpriseBtn', '#volume']) {
          assert.ok(await page.locator(selector).isVisible(), selector + ' is visible at ' + width);
        }
      }
      await session.close();
    });

    await test('phone touch controls, scrubbing and playlist work after scrolling and rotation', async () => {
      const songs = Array.from({ length: 40 }, (_, n) => 'MOB' + String(n).padStart(8, '0'));
      const session = await openPage(browser, {
        viewport: { width: 390, height: 844 }, touch: true,
        fixtureDeckIds: { home: songs }, reducedMotion: 'reduce',
      });
      const { page } = session;
      await playing(page);
      for (const viewport of [
        { width: 320, height: 568 }, { width: 360, height: 740 },
        { width: 390, height: 844 }, { width: 430, height: 932 },
        { width: 844, height: 390 }, { width: 932, height: 430 },
      ]) {
        await page.setViewportSize(viewport);
        await page.waitForTimeout(120);
        await checkLayout(page);
        for (const selector of ['#homeBtn', '#motionBtn', '#prevBtn', '#playBtn', '#nextBtn', '#listBtn', '#shuffleBtn', '#repeatBtn', '#surpriseBtn', '#sleepBtn', '#volume', '#seek']) {
          const rect = await page.locator(selector).boundingBox();
          assert.ok(rect.width >= 44 && rect.height >= 44, selector + ' has a thumb-sized target at ' + viewport.width);
        }
        assert.ok(await page.evaluate(() => {
          const left = document.querySelector('.topbar__left').getBoundingClientRect();
          const right = document.querySelector('.topbar__right').getBoundingClientRect();
          return left.right <= right.left;
        }), 'Header groups do not overlap');
        await page.locator('#listBtn').tap();
        await page.waitForFunction(() => document.querySelector('#sheet').classList.contains('is-open'));
        const sheet = await page.locator('#sheet').boundingBox();
        assert.ok(sheet.y >= 0 && sheet.y + sheet.height <= viewport.height, 'Playlist fits on screen: ' + JSON.stringify({ viewport, sheet }));
        const last = page.locator('#sheetList .row').last();
        await last.scrollIntoViewIfNeeded();
        await last.tap();
        await page.waitForFunction(id => __ytTest.current === id, songs.at(-1));
        await page.locator('#sheetClose').tap();
        await page.waitForFunction(() => document.querySelector('#sheet').hidden);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('#seek').scrollIntoViewIfNeeded();
      const seek = await page.locator('#seek').boundingBox();
      const cdp = await page.context().newCDPSession(page);
      const point = fraction => ({ x: seek.x + seek.width * fraction, y: seek.y + seek.height / 2 });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(.2)] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(.8)] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.ok(Math.abs(await page.evaluate(() => __ytTest.time) - 144) < 3, 'Touch drag seeks to the release point');
      await page.locator('#nextBtn').tap();
      await page.waitForFunction(id => __ytTest.current === id, songs[0]);
      await page.locator('#shuffleBtn').tap();
      assert.equal(await page.evaluate(() => __ytTest.current), songs[0], 'Touch shuffle preserves the playing song');
      await page.locator('.card[data-key="udit-narayan"]').tap();
      await page.waitForFunction(() => __ytTest.current.startsWith('UDIT'));
      await session.close();
    });

    await test('3D interactions can be switched off and respect reduced motion', async () => {
      const session = await openPage(browser);
      const { page } = session;
      await playing(page);
      assert.equal(await page.locator('#motionBtn').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.card > .cassette-lift > .cassette-tilt > .cassette-flight').count(), 4);
      assert.equal(await page.locator('.cassette-face').count(), 20);
      assert.ok(await page.locator('.room-atmosphere .room-mote').count() > 0);
      const card = page.locator('.card').first();
      await card.scrollIntoViewIfNeeded();
      const rect = await card.boundingBox();
      await page.mouse.move(rect.x + rect.width * .82, rect.y + rect.width * .25);
      await page.waitForFunction(() => {
        const tilt = document.querySelector('.cassette-tilt');
        return Math.abs(parseFloat(tilt.style.getPropertyValue('--case-ry'))) > 1 &&
          Math.abs(parseFloat(document.querySelector('#sceneDepth').style.getPropertyValue('--room-x'))) > .1;
      });
      assert.match(await page.locator('.cassette-tilt').first().evaluate(element => getComputedStyle(element).transform), /matrix3d/, 'Pointer changes the actual 3D transform');
      await card.click();
      await page.waitForFunction(() => document.querySelector('.card.is-turning'));
      assert.ok(await page.locator('.tape-particles .tape-particle').count() > 0, 'Selection adds a temporary particle burst');
      await checkLayout(page);
      await page.locator('#motionBtn').click();
      assert.equal(await page.locator('#motionBtn').getAttribute('aria-pressed'), 'false');
      assert.equal(await page.locator('#motionBtn svg').count(), 1, 'Toggle retains its icon');
      assert.equal(await page.locator('#shopVideo').evaluate(video => video.paused), true);
      assert.equal(await page.locator('.card.is-turning').count(), 0, 'Motion toggle cancels active turns');
      await page.mouse.move(1200, 250);
      await page.waitForTimeout(100);
      assert.equal(await page.locator('#sceneDepth').evaluate(element => element.style.getPropertyValue('--room-x')), '');
      assert.equal(await page.locator('.cassette-tilt').first().evaluate(element => element.style.getPropertyValue('--case-ry')), '');
      assert.equal(await page.locator('.tape-particles').count(), 0);
      await checkLayout(page);
      await page.locator('#motionBtn').click();
      assert.equal(await page.locator('#motionBtn').getAttribute('aria-pressed'), 'true');
      await session.close();
      const reduced = await openPage(browser, { reducedMotion: 'reduce' });
      await playing(reduced.page);
      assert.equal(await reduced.page.locator('#motionBtn').getAttribute('aria-pressed'), 'false');
      await reduced.close();
    });
    console.log('\n' + passed + ' room regression groups passed. YouTube playback and availability are simulated at the API boundary.');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
