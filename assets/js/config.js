/* ============================================================================
   R'S WORLD — Hits of the 90s   ·   EDIT ONLY THIS FILE
   ----------------------------------------------------------------------------
   Everything you need to change lives here. Nothing else needs touching.
   ========================================================================== */

const SITE = {
	/* --------------------------------------------------------------------------
     1. YOUR LINKS
     ------------------------------------------------------------------------ */
	instagramUrl:
		"https://www.instagram.com/90s_night_with_r?igsh=MXBub3N6MTI3YWlncg==", // <-- your Instagram
	creditName: "Vraj Soni",

	/* --------------------------------------------------------------------------
     1b. DEVELOPER CARD  —  opens when someone clicks the name in the corner
     ------------------------------------------------------------------------
     Paste your own profile links below. Leave any one of them as "" and that
     button simply won't show up. Nothing here touches the music.
     ------------------------------------------------------------------------ */
	developer: {
		name: "Vraj Soni", // shown big on the card
		role: "Front-end & product", // one short line under the name
		instagram: "https://www.instagram.com/PASTE_YOUR_HANDLE", // <-- your Instagram
		x: "https://x.com/PASTE_YOUR_HANDLE", // <-- your X / Twitter
		linkedin: "https://www.linkedin.com/in/PASTE_YOUR_HANDLE", // <-- your LinkedIn
	},

	/* --------------------------------------------------------------------------
     2. YOUR PLAYLISTS
     ------------------------------------------------------------------------
     For each entry you can paste EITHER:

       (a) a YouTube playlist — the whole link or just the list ID:
           playlist: 'https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxxxx'
           playlist: 'PLxxxxxxxxxxxxxxxx'

       (b) a hand-picked list of songs — links or plain video IDs:
           tracks: [
             'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
             { id: 'dQw4w9WgXcQ', title: 'Song name (optional)' },
           ]

     If you fill both, `tracks` wins.
     Song titles load by themselves — you never have to type them.

     `ytMusicUrl` is optional. Leave it empty and the YT Music button will
     open this same playlist on music.youtube.com automatically.
     ------------------------------------------------------------------------ */

	decks: {
		/* plays the moment anyone walks in, and every time they press Home */
		home: {
			label: "90s Night Mixtape",
			playlist:
				"https://music.youtube.com/playlist?list=RDCLAK5uy_kNNx8o3LyD3XF_wKmbZZRMsdiYpo5GjrM&playnext=1&si=HY94kJgLane42mov",
			tracks: [],
			ytMusicUrl: "",
		},

		"kumar-sanu": {
			name: "Kumar Sanu",
			label: "Kumar Sanu · Essentials",
			playlist:
				"https://music.youtube.com/playlist?list=OLAK5uy_mBQqIjeNhsCkyprv_cWhBC_C9DXTIgpwo&si=8DSqSD6eGPiqfGbA",
			tracks: [],
			ytMusicUrl: "",
		},

		"udit-narayan": {
			name: "Udit Narayan",
			label: "Udit Narayan · Essentials",
			playlist:
				"https://music.youtube.com/playlist?list=OLAK5uy_kLpy8m1mSlrnpT7OcENKGa1kYJXNpu4rQ&si=ae0QEjJxirOiK8A8",
			tracks: [],
			ytMusicUrl: "",
		},

		abhijeet: {
			name: "Abhijeet",
			label: "Abhijeet · Essentials",
			playlist:
				"https://music.youtube.com/playlist?list=OLAK5uy_mia8TTVxShg2KJRaa8dB8g2ahomS_0agA&si=e49W1EVpy-1SmKjc",
			tracks: [],
			ytMusicUrl: "",
		},

		"sonu-nigam": {
			name: "Sonu Nigam",
			label: "Sonu Nigam · Essentials",
			playlist:
				"https://music.youtube.com/playlist?list=OLAK5uy_kfnpPNuuqbZqIeHQy4cJaj2BgqxAiQ7dg&si=j3hiG-L1qRbIPhQK",
			tracks: [],
			ytMusicUrl: "",
		},
	},

	/* --------------------------------------------------------------------------
     3. THE FOUR CARDS  —  shown left to right in this order
     ------------------------------------------------------------------------ */
	singers: [
		{
			key: "kumar-sanu",
			name: "Kumar Sanu",
			tag: "The velvet voice",
			accent: "#FFB43C",
		},
		{
			key: "udit-narayan",
			name: "Udit Narayan",
			tag: "The evergreen",
			accent: "#A87AFF",
		},
		{
			key: "abhijeet",
			name: "Abhijeet",
			tag: "The romantic",
			accent: "#3CDCB4",
		},
		{
			key: "sonu-nigam",
			name: "Sonu Nigam",
			tag: "The showstopper",
			accent: "#FF4696",
		},
	],

	/* --------------------------------------------------------------------------
     4. LISTENER COUNTER
     ------------------------------------------------------------------------
     There is no server behind this site, so the counter runs on the visitor's
     own device: it starts inside the range below and drifts while they listen.
     Set `live.enabled = false` to hide it, or point `live.endpoint` at your own
     API returning { "count": 42 } to show a real number instead.
     ------------------------------------------------------------------------ */
	live: {
		enabled: true,
		min: 14,
		max: 68,
		endpoint: "",
	},

	/* --------------------------------------------------------------------------
     5. BEHAVIOUR
     ------------------------------------------------------------------------ */
	shuffle: true, // reshuffle every time a playlist is opened
	startVolume: 85,
};
