# R's World — Hits of the 90s

A single-page 90s Bollywood listening room. The shop loops in the background, the
CRT on the counter plays the video of whatever is playing, and four singer cards
switch the whole room over to that voice.

No admin portal, no backend, no build step. Static files only.

---

## 1. Add your playlists (the only file you must edit)

Open **`assets/js/config.js`**. Everything you need is in there and nothing else
needs touching.

```js
home: {
  label:    "90's night special",
  playlist: 'https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxxxx',
}
```

For each of the five sections (`home` plus the four singers) you can paste
**either**:

**A playlist** — the whole link or just the ID:

```js
playlist: 'https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxxxx'
playlist: 'PLxxxxxxxxxxxxxxxx'
```

**Or a hand-picked list of songs** — links or bare video IDs:

```js
tracks: [
  'https://www.youtube.com/watch?v=xxxxxxxxxxx',
  'https://youtu.be/xxxxxxxxxxx',
  { id: 'xxxxxxxxxxx', title: 'Tujhe Dekha To' }   // title optional
]
```

If you fill both, `tracks` wins.

**You never have to type song names.** Titles arrive on their own from YouTube,
and any that don't fill in immediately appear the moment that song starts playing.

While a section still says `PASTE_..._HERE`, the player shows a short note
pointing back at this file instead of failing silently.

Also in `config.js`:

| Setting | What it does |
|---|---|
| `instagramUrl` | Where the Instagram button goes |
| `creditName` | The name in the top-right credit |
| `ytMusicUrl` | Optional per-playlist override. Leave empty and the YT Music button opens that same playlist on music.youtube.com |
| `singers` | Card order, display name, the small tag line, and the accent colour each singer paints the UI with |
| `live` | Listener counter — see §4 |
| `shuffle` | Reshuffle every time a playlist opens (on by default) |

---

## 2. Run it

**YouTube embeds do not work from `file://`.** Double-clicking `index.html` will
load the page but never the music. Use any local server:

```bash
cd 90s-night
python3 -m http.server 8000
# then open http://localhost:8000
```

The page tells you if you've opened it the wrong way.

**To publish**, drag the whole folder into Netlify Drop, or push it to GitHub and
point Vercel or GitHub Pages at it. There's nothing to build.

---

## 3. Automatic playback

Browsers can block audio that starts without the visitor touching the page.
Whether sound is allowed automatically depends on the browser and the visitor's
existing permissions.

So the site does the most that's allowed: it starts playing **muted** the instant
it loads, immediately asks the browser to unmute, and if the browser refuses, a
small **Tap for sound** pill appears on the player. Tapping it or choosing a
voice starts the sound. Opening credits or changing a setting never resumes
music that the visitor deliberately paused.

While playback is silent, the main button says **Play with sound** and enables
audio instead of pausing. An explicit sound tap restores the last audible volume
if the slider was saved at zero. Automatic playback respects a saved zero volume.

Some in-app previews leave the YouTube iframe blank even when the site loads.
If the connection message appears there, open the same local URL in Chrome or
Safari. The site cannot make an unavailable embedded browser connection work.

---

## 4. Shop status

The original status pill remains in the corner. Without a listener endpoint it
says **shop is open** rather than inventing listener numbers. If `live.endpoint`
is configured to return `{ "count": 42 }`, the player can display that real count.
Set `live.enabled = false` to hide the pill.

---

## 5. How the TV works

The CRT screen was measured out of the background footage at pixel level. The
video is sized to cover the window on a fixed grid, and the YouTube embed is
pinned to that exact rectangle — 7.6% / 57.9% across, 12.15% / 16.4% wide and
tall, rotated 1.4° to match the perspective — so it stays welded to the screen at
any window size.

On phones and in portrait, the shop is fitted across the top as a landscape band.
The video stays inside its original CRT screen. The stage and TV share the same
3D scene wrapper, so their alignment is preserved as the room moves.

The video only plays on the home page. Pick a singer and it stops and hides while
the audio keeps going; press **Home** and it switches back on, with the shuffled
mixtape restarting.

To adjust the TV placement, change `TV_RECT` at the top of `assets/js/app.js`.

---

## 6. Controls

| Action | Control |
|---|---|
| Play / pause | Centre button, or **Space** |
| Previous / next | Side buttons, or **Alt + ← / →**. Previous restarts the song if you're more than 4 seconds in |
| Open the playlist | List button on the right of the player. Click any song to jump to it |
| Close the playlist | Click outside it, the ✕, or **Esc** |
| Shuffle / repeat one | Compact controls below the player |
| Surprise voice | **Surprise me** |
| Volume | Slider below the player; saved in this browser |
| Sleep timer | Cycle **Sleep** through off, 15, 30, and 60 minutes |
| Interactive animation | **3D on/off** in the top-left corner |
| Scrub | Tap or drag the progress line, or focus it and use ← / → |

A song that's been deleted, blocked in your country, or restricted from playing
on other websites is skipped automatically. The player tries the full playlist
once before stopping, and remembers a successfully played song for each playlist
in this browser so the next visit can start with it. A saved song is only used
while it still belongs to your playlist.

Automatic queues exclude videos that failed the recent embed checks in
`assets/js/playback-availability.js`. Those bundled checks expire after seven
days. New failures are remembered in this browser for one day (five minutes for
unclassified errors), so Next and Shuffle do not keep retrying the same blocked
song. Original playlist metadata remains intact. Availability can vary by region
and change over time.

Shuffle rearranges the upcoming songs without restarting the current song or
resetting its progress. Surprise me excludes artists whose tracks are all known
to be unavailable. Late events from an earlier song cannot skip a newer selection.

A valid YouTube playlist link does not guarantee that every song allows embedded
playback. Errors 101/150 indicate a video owner has disabled embedding. If no song
can play here, the **YT Music** button opens your original playlist. Player or
browser identification errors stop with a specific message instead of skipping
every song. Your playlist links are never replaced.

The four configured singer playlists open on YouTube but currently return empty
lists through its iframe API. `assets/js/playlist-snapshots.js` contains their
actual public song IDs and titles, read on 2026-09-23: Kumar Sanu (141), Udit Narayan
(46), Abhijeet (16 available), and Sonu Nigam (2). These exact-ID snapshots let the
site load each song directly. They do not contain audio or substitute playlists.
New playlist URLs use the live API, and explicit `tracks` always take priority.
If an existing singer playlist changes, refresh its snapshot or supply `tracks`.

Both videos in the current Sonu Nigam playlist returned embedding error 150 during
verification; the player explains this and keeps the original YT Music link.

---

## 7. Files

```
index.html
assets/
  css/style.css        ← original visual theme
  css/enhancements.css ← compact extra controls
  css/effects.css      ← 3D cassette and room animations
  js/effects.js        ← pointer, touch, and motion preferences
  js/config.js        ← your playlists and links
  js/playlist-snapshots.js ← song metadata from the four original singer playlists
  js/playback-availability.js ← temporary results of actual iframe playback checks
  js/app.js           ← behaviour
  img/                ← singer cards + backgrounds + video poster
  video/shop-loop.mp4 ← the shop, ping-ponged so the loop has no seam
```

The four background photos have been graded, feathered and scrimmed so the
player, heading and cards stay readable on top of them. The card portraits are
cropped to each face. Source photos are the ones you supplied — they're press and
stage shots, so if this goes anywhere public or commercial you'd want your own or
properly licensed images.

---

## 8. 3D interactions

The original fullscreen cassette shop, four voices, singer backdrops, glass
player, and CRT are preserved. Hover a cassette for a physical tilt and moving
reflection. Selecting a voice animates the case and adds a brief glow of particles.
The room has subtle cursor-driven depth and atmospheric dust.

The **3D on/off** button controls these effects and remembers your preference.
Reduced-motion preferences are respected. Decorative animations pause when the
tab is hidden; music controls continue to work. No animation library is needed.

The extra music controls stay in one compact strip beneath the original player
on desktop. Phones use larger touch targets, a full-width volume slider and a
scrollable playlist sheet anchored to the bottom of the screen. The room fits
portrait and landscape screens, including safe space around phone notches.
Sleep timers apply to the current page session and can be delayed if the device
or browser sleeps.

## 9. Browser checks

Tests use Playwright as an optional development dependency. Start the local server,
then run:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node tests/room.cjs
```

`TEST_URL` overrides the default `http://127.0.0.1:8000`. `BROWSER_EXECUTABLE` can
point to an existing Chromium browser. The tests use a YouTube boundary double
for deterministic player checks; actual YouTube availability depends on the
configured playlists, embedding permissions, and network/region.

---

Made by Vraj Soni.
