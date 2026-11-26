# Rehearsal: landing scenes (hero, webhooks)
Gold: hero-demo (hero), payout-flow (webhooks). Look: Relay tokens mapped in `relay.css`.
- hero (720x340, compact 358x330): curl, 202, row lands Queued then Sent, timeline Queued, Sent, Delivery. Compact drops the Subject column so addresses stay whole.
- webhooks (520x340, compact 358x340): mailbox.received delivery fails HTTP 503, "1 minute later", ends Sent with 2 attempts and 200. Compact shows the URL without scheme and a third older row.
Gate: `rehearsal passed` on the real page for both scenes at 1440 and 390 (hero wide leaves a `settle snap` candidate in the Collapse kit part). Not checked: touch devices, Safari, Firefox, `--states`, a fresh-eye review.
