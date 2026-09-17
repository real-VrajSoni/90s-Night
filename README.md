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

## 3. About the sound starting by itself

Chrome, Safari and Firefox all block audio that starts without the visitor
touching the page. There is no way around this — it's a browser rule, not a
setting.

So the site does the most that's allowed: it starts playing **muted** the instant
it loads, immediately asks the browser to unmute, and if the browser refuses, a
small **Tap for sound** pill appears on the player. The visitor's first tap
anywhere on the page turns the sound on and the pill disappears. Most people
never notice the difference.

---

## 4. About the listener count

There is no server behind this site, so the counter runs on each visitor's own
device: it starts somewhere in the range you set and drifts while they listen.
Two people on the site at once will see different numbers. It's atmosphere, not
data.

To hide it: `live.enabled = false`.

To make it real: stand up any endpoint that returns `{ "count": 42 }` and put its
URL in `live.endpoint`. The site will poll it every 15 seconds and show that
number instead.

---

## 5. How the TV works

The CRT screen was measured out of the background footage at pixel level. The
video is sized to cover the window on a fixed grid, and the YouTube embed is
pinned to that exact rectangle — 7.6% / 57.9% across, 12.15% / 16.4% wide and
tall, rotated 1.4° to match the perspective — so it stays welded to the screen at
any window size.

On phones and in portrait, the shop is cropped too tightly for the CRT to be
visible, so the TV steps out of the footage and becomes a drawn CRT near the top
of the page instead. Same player, same video, no reload.

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
| Scrub | Click the progress line, or focus it and use ← / → |

A song that's been deleted or blocked in your country is skipped automatically
rather than stalling the night.

---

## 7. Files

```
index.html
assets/
  css/style.css
  js/config.js        ← your playlists and links
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

Made by Vraj Soni.
