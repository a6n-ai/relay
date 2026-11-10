# Landing hero — stageshow rehearsal notes

## Gold copied
- Layout / depth: stageshow `dark-hero` (surface steps on dark, one lit status change).
- Interaction: product study `linear` (console chrome), story is Relay-specific (send fans into four channels).

## What changed for Relay
- Window is the Relay operator console: sidebar from `NAV_GROUPS`, Sends list with channel glyphs from `RELAY_CHANNELS`.
- Script: a send arrives, expands into four channel rows (Email / Text / WhatsApp / In the app), each flips Queued → Delivered; poster = all four delivered.
- Compact redesign at 358 wide (sidebar dropped, crumbs kept).
- Tokens mapped through `console-look.css` onto Relay CSS variables.

## Three-column Hairline figures
- `sorter` — one inlet, four chutes (one send → every channel). look: frame ok.
- `nameplates` — rack of domain plaques (apps / domains). look: frame ok.
- `gauge` — delivery dial; needle + raised tick. look: frame ok; answer ink ~28% at 240px (thin needle + one post vs large dial — accepted for this metaphor).
- Sources in `components/marketing/figures/*.js`; embedded via `HairlineFigure` → `/figures/hairline-*.html?embed=1`.

## Not checked
- stageshow `film.mjs --gate` on the live Next page (dev server + gate still pending).
- hallmark `sloplint --render` sweep.
- Full light-theme interaction tour of the three Hairline iframes in the composed landing.
