# WhatsApp in Relay — research brief

Date: 2026-09-09 (updated 2026-09-11)  
Status: Phase 1+2 landed — Meta Graph client, drain provider, `/api/webhooks/whatsapp`. Embedded Signup / multi-WABA / conversation persist still open.

## Optimized prompt (use this going forward)

**Goal:** Design WhatsApp Business Platform support in Relay so each Relay **app** (tenant) can connect one or more Meta **Business Portfolios / WABAs** and one or more **business phone numbers**, then send and receive through Relay’s existing outbox + Mailbox model.

**Must support**

1. **Onboarding** — Meta **Embedded Signup** (Facebook Login for Business) from the operator console; persist `business_id`, `waba_id`, `phone_number_id`, display number, and tokens. Support **multiple WABAs** and **multiple phone numbers** per Relay app (and across apps).
2. **Developer app** — One Relay Meta app (Cloud API) that customers authorize; subscribe webhooks once; route by `phone_number_id` / `waba_id`.
3. **Outbound**
   - **Session / service messages** (free-form text/media/interactive) only inside Meta’s **24h customer service window**.
   - **Template messages** (marketing / utility / authentication) when outside the window or for proactive sends; sync Meta template status; store Relay `provider_template_id` / name+language.
4. **Inbound + status** — Webhooks for messages, delivery/read statuses, and **business / account updates** (`account_update`, number quality, template status, partner events).
5. **Product fit** — Reuse `notification_outbox`, drain worker, Mailbox threads, app tags, and `POST /v1/messages`. Operator chrome stays non-technical (never “WABA”, “Graph”, “webhook” in UI labels).
6. **UI** — Conversation surface that *feels* like WhatsApp (thread list + chat pane + composer that knows window vs template), but in **Relay Lyra** (Geist, purple accent, sharp rects, hairline gutters)—not a WhatsApp clone or Meta blue.

**Out of scope for v1:** WhatsApp Web / Baileys / unofficial clients; On-Premises API (sunset); becoming a full BSP marketplace; Coexistence edge cases beyond documenting them.

**Decide / recommend:** Cloud API + Business Management API both required; Foundry vs Relay package split (mirror `@foundry/email`); thin Graph client vs community SDK; token model; multi-number schema.

---

## Naming (do not confuse)

| Term | Meaning for Relay |
| --- | --- |
| **WhatsApp Business Platform** | Meta’s product family |
| **Cloud API** | Send/receive messages, media, calls — `POST /{phone_number_id}/messages`, webhooks | **Required** |
| **Business Management API** | Manage WABA assets — phone numbers, message templates, `subscribed_apps`, analytics | **Required** |
| **“Business API” (colloquial / on-prem)** | Old self-hosted stack; **deprecated Oct 2025** — out of scope |
| **Marketing Messages API** | Optional later optimization path; not v1 |

Official overview: [About the platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform), [Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/), [Business Management API](https://developers.facebook.com/docs/whatsapp/business-management-api/).

Relay needs **both** Cloud API and Business Management API. Same Graph host, different jobs — like SMTP send vs DNS/domain management for email.

---

## What Relay already has

| Piece | Today |
| --- | --- |
| Channel enum | `whatsapp` in engine schema, campaigns, OpenAPI |
| Package | `@relay/whatsapp` — window helpers, Twilio provider, **Meta Graph client (Cloud + BM)**, `MetaCloudWhatsAppProvider`, webhook signature/challenge helpers |
| Email precedent | `@relay/email` (SMTP/SES send) + `@foundry/email` (shared send types); Mailbox stays in Relay |
| Roadmap | Twilio when env set ([PLATFORM-ROADMAP.md](../PLATFORM-ROADMAP.md)) |

Gap: no Meta Cloud / Business Management client, no Embedded Signup, no multi-WABA inventory, no Meta webhooks, no WhatsApp-shaped Mailbox UI.

---

## Platform facts (primary sources)

### Cloud API (messaging)

- Send: `POST https://graph.facebook.com/{version}/{PHONE_NUMBER_ID}/messages` + Bearer token.  
  Docs: [Messages](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages), [Send guide](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages/).
- **Service messages** (text/media/interactive) only inside the **24h customer service window**.  
  Docs: [Conversation types](https://developers.facebook.com/docs/whatsapp/conversation-types/).
- **Template messages** for outside-window / campaigns (marketing / utility / authentication).  
  Docs: [Templates overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview), [Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing).

### Business Management API (assets)

- WABA-scoped: `GET/POST/DELETE /{WABA_ID}/phone_numbers`, `/message_templates`, `/subscribed_apps`, assigned users.  
  Docs: [Business Management API](https://developers.facebook.com/docs/whatsapp/business-management-api/).
- Used after Embedded Signup to list numbers, sync template approval status, subscribe the Relay Meta app to the customer WABA.

### Multi-business / multi-number

- Hierarchy: **Business Portfolio** → **WABA** → **phone number(s)** (`phone_number_id` on every send).
- **Embedded Signup** returns `phone_number_id`, `waba_id`, `business_id` (and `waba_ids[]` for multi-WABA). Prefer **v4** (v2 deprecated Oct 15, 2026).  
  Docs: [Embedded Signup](https://developers.facebook.com/docs/whatsapp/embedded-signup/implementation/).
- Permissions commonly: `whatsapp_business_messaging` (Cloud) + `whatsapp_business_management` / `business_management` (BM API). Confirm App Review checklist at build time.

### Webhooks / account updates

One Relay callback: verify challenge + POST. Topics include messages, message status, **`account_update`**, template status. Route by `phone_number_id` / `waba_id`.

### Client strategy (not an “SDK product”)

| Option | Role |
| --- | --- |
| **Official Meta Node SDK** | Archived — do not use ([WhatsApp-Nodejs-SDK](https://github.com/WhatsApp/WhatsApp-Nodejs-SDK)) |
| **Thin Graph `fetch` client** | Preferred: Cloud + BM methods, typed payloads, same pattern as email providers |
| Community TS wrappers | Optional later; not required for v1 |
| **Twilio WhatsApp** | Optional adapter only |
| **Baileys / whatsapp-web.js** | Out of scope |

Meta samples are raw Graph HTTP: [fbsamples/whatsapp-api-examples](https://github.com/fbsamples/whatsapp-api-examples).

---

## Package split (mirror email)

Same rule as email ([AGENTS.md](../AGENTS.md)): **Foundry = transport/client only; Relay = product**.

```text
@foundry/whatsapp  (new — like @foundry/email)
  • Graph client: Cloud API send + media helpers
  • Business Management API: phones, templates, subscribed_apps
  • Webhook signature verify + payload parse helpers
  • 24h window helpers (pure functions)
  ✗ No mailbox, no outbox, no tenant IDs, no Embedded Signup UI

@relay/whatsapp  (keep / thin adapters)
  • MetaCloudWhatsAppProvider + TwilioWhatsAppProvider (ChannelProvider)
  • Relay-facing wrappers over @foundry/whatsapp

apps/relay
  • Embedded Signup, token storage, multi-tenant routing
  • notification_outbox drain, Mailbox / chat UI, Templates sync jobs
```

### Council (2026-09-10): Foundry-now vs Relay-only

**Architect:** Prefer Foundry **client** shaped like `@foundry/email`, but only if the interface stays send+BM Graph with zero Relay types.

**Skeptic:** Keep Meta in `@relay/whatsapp` until a second product needs send — “eventually Foundry” is speculative; BM+Signup is product-shaped.

**Pragmatist:** Ship Meta in Relay first; extract Foundry when a second consumer appears — freeze API too early and you pay cross-repo tax.

**Critic:** Premature Foundry expands token/ban blast radius across every consumer; BM + Embedded Signup is an identity control plane, not SMTP.

### Verdict

- **Consensus:** Do **not** put Mailbox, Signup, or tenant routing in Foundry. On-prem “Business API” is dead.
- **Strongest dissent:** Skeptic/Pragmatist/Critic say **delay** `@foundry/whatsapp` until second consumer.
- **Premise check:** User asked for Foundry-like-email — valid **if** Foundry is a deep Graph module (Cloud + BM only), not a dump of Relay product.
- **Recommendation:** **Design for Foundry now, place when ready.** Implement the thin Cloud+BM client with a Foundry-clean interface. Prefer creating `@foundry/whatsapp` in Foundry once the spike proves the surface (or grow under `@relay/whatsapp` with the same exports so a move is a rename). Never merge conversations into Foundry.

---

## Recommended architecture for Relay

```text
Operator UI (Lyra WhatsApp channel)
    │ Embedded Signup + number picker
    ▼
Postgres: whatsapp_waba / whatsapp_phone / template cache
    │
    ├─ Outbound: POST /v1/messages | campaign | Mailbox compose
    │     → notification_outbox (channel=whatsapp, phone_number_id, template?)
    │     → drain → MetaCloud provider | Twilio provider
    │           └─ @foundry/whatsapp Cloud API
    │
    ├─ Asset sync: templates / numbers / quality
    │     └─ @foundry/whatsapp Business Management API
    │
    └─ Inbound: POST /api/webhooks/whatsapp
          → Foundry verify+parse → Relay route by phone_number_id
          → conversation thread + last_inbound_at
          → statuses / account_update → rows + Status updates
```

### Schema sketch (direction)

- `whatsapp_waba` — `tenant_id`, `waba_id`, `business_id`, token refs, status  
- `whatsapp_phone` — `waba_row_id`, `phone_number_id`, E.164 display, quality, is_default  
- `whatsapp_template_cache` — name, language, category, status, components hash  
- Outbox: add `phoneNumberId` (or resolve default per tenant)

### Window logic

Persist `last_inbound_at` per `(tenant, phone_number_id, wa_user_id)`. Composer: `requiresTemplate()` → template picker; else free-form.

### UI (Relay fashion, WhatsApp-shaped)

- Thread list + chat pane + window-aware composer; “Connect WhatsApp” for signup.  
- Lyra: Geist, purple accent, sharp rects — **not** WhatsApp green / Meta blue.

---

## Phased plan (suggested)

| Phase | Outcome |
| --- | --- |
| **0 — Spike** | Meta app + Embedded Signup; one WABA + number; `hello_world` via Cloud API; list templates via BM API |
| **1 — Client + provider** | ✅ Thin Graph client (Cloud + BM); `MetaCloudWhatsAppProvider`; drain via `createWhatsAppProviderFromEnv`; Twilio fallback |
| **2 — Webhooks** | ✅ `GET/POST /api/webhooks/whatsapp` (signature + challenge); status → outbox / campaign counts / `message.failed`; inbound + account_update logged until conversation storage |
| **3 — Multi-asset** | Multi WABA/number per app; default sender |
| **4 — Templates** | BM sync into Templates UI; campaigns use approved only |
| **5 — Console UX** | Lyra chat UI |
| **F — Foundry extract** | Move client to `@foundry/whatsapp` when second consumer exists **or** immediately after spike if interface is already Foundry-clean |

---

## Risks / constraints

- App Review + Business Verification before production volume.  
- Number cannot be used as normal WhatsApp consumer app once on Cloud API (migration/coexistence rules—confirm current Meta policy at build time).  
- Template approval latency and quality rating affect deliverability.  
- Token storage must be encrypted / redacted in audit (same bar as SMTP passwords).  
- Embedded Signup version migration (v2 → v4 by Oct 2026).  
- Pricing and free-window rules change; keep pricing out of operator copy until product needs it.

---

## Sources

- [About the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform)  
- [Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/) / [Messages](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages)  
- [Business Management API](https://developers.facebook.com/docs/whatsapp/business-management-api/)  
- [Templates overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview)  
- [Conversation types / CSW](https://developers.facebook.com/docs/whatsapp/conversation-types/)  
- [Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)  
- [Embedded Signup](https://developers.facebook.com/docs/whatsapp/embedded-signup/implementation/)  
- [Meta WhatsApp API examples](https://github.com/fbsamples/whatsapp-api-examples)  
- Archived Node SDK: [WhatsApp-Nodejs-SDK](https://github.com/WhatsApp/WhatsApp-Nodejs-SDK)  
- Relay: `packages/whatsapp/*`, `packages/email/*`, `docs/PLATFORM-ROADMAP.md`
