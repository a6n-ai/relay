# Rehearsal: landing scenes (hero, campaigns, lists, webhooks, inbound)

Gold: hero-demo (hero: corner bleed, browser window, terminal satellite, plate), table-edit (campaigns: pinned window, bottom bleed, plate), upload (lists: file carried into a drop target by `drag`), payout-flow (webhooks: cursorless, overlapping arrivals, a payoff that holds), messages/loading (inbound: a row arriving in a list). The folders were used as structure and craft references; every scene was rewritten for Relay's console, none is a renamed copy.
Look: Relay tokens (`src/styles.css`) mapped onto the kit in `relay.css`; Geist; 6px controls, 12px cards and windows; primary button is foreground on background; accent only for Queued/Scheduled badges. Light and dark follow `.dark` on `<html>` (CSS and the `theme` prop). Fidelity standard, real console rows at hero scale.
Truth: labels, statuses and strings come from `routes/_app/messages*.tsx`, `lists_.$listId.tsx`, `campaign-report.tsx`, `schedule-dialog.tsx`, webhook deliveries (`HTTP 503`, retry delay, `Pending` until sent), `components/shell/nav.ts`, `status-badge.tsx`.

## Beats
- hero (720x340, compact 358x330): curl typed in a terminal, 202 response; row lands in Messages > Sent as Queued; badge moves to Sent; cursor opens the row; timeline Queued, Sent, Delivery. Poster: row selected, Sent, timeline to Delivery, terminal answered (wide), no terminal (compact). Loop about 15 s.
- campaigns (520x340, compact 358x340): Schedule... opens the dialog, Send now, page shows Scheduled, then Started with recipients rolling to 1,284, Waiting and Sent counting. Poster: sending, 1,284 recipients. Loop about 14 s.
- lists (520x380, compact 358x340): contacts.csv is dragged onto Import contacts, Import contacts runs, result "Added 3, Already on list 0, Suppressed 1, Invalid 0, Duplicates 0", rows appear, Done. Poster: result with the three new rows behind. Loop about 15 s.
- webhooks (520x340, compact 358x340): a delivery lands Pending, 1 attempt, 503, HTTP 503; a "1 minute later" annotation; same row becomes Sent, 2 attempts, 200, no error. No cursor. Poster: final state with the annotation. Loop about 12 s.
- inbound (520x340, compact 358x340): a letter arrives at the top of Messages > Received; an annotation says mailbox.received is posted to the webhook. Poster: both. Loop about 12 s.

Captured: wide and 390 for every scene (10 frames, 1.5 s), posters at both widths (`--reduced`), hero in dark in the real page; reduced motion in the real page (poster only, story never loaded).
Gate: `rehearsal passed` for all five at the shown width and at 390 (final run). Coverage reports were `inconclusive` (sampling gaps over 25 ms on a loaded laptop); `jumps.mjs` on the hero ran clean. `--states` not run.
Film: fixed every line the gate printed (framing gutters and slivers, tight control, touching, half-pixel glyph, uneven padding, loop seam cursor, lands on a transform, settle snap from stretched grid rows). Candidates left, all in kit parts: `jump`/`settle snap` on `Count` digit strips and `Swap`/`States` crossfades; `near-empty frames` where a stack of crossfaded panes is mostly hidden by design.
Assumptions: the campaign page shows its report (recipients, waiting, sent) right after Send now; the "1 minute later" and "posted to your webhook" chips are annotations, not console UI; the timeline is shown as a card, the real console opens it as the message page.
Unresolved: see the task report (no per-address reason on import, console not a card).
Not checked: touch devices, Safari and Firefox, a real 60 fps frame log, `--states`, a fresh-eye subagent review (none dispatched).
