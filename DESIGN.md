---
version: alpha
name: Relay
description: "Relay's console in the Vercel dashboard style: monochrome, Geist type, 6px controls, pill badges, framed tables. Colour carries meaning only."

colors:
  # Source of truth for exact values: apps/relay-v2/src/styles.css. These are the Geist-scale values it ships.
  background: "#ffffff"        # light page
  surface: "#fafafa"           # light cards and muted fills (#f2f2f2 for deeper fills)
  border: "#ebebeb"            # light hairline
  foreground: "#171717"        # light ink
  muted-foreground: "#666666"  # light secondary ink
  dark-background: "#0a0a0a"
  dark-surface: "#111111"      # dark cards and muted fills (#1a1a1a for deeper fills)
  dark-border: "#2e2e2e"
  dark-foreground: "#ededed"
  dark-muted-foreground: "#a1a1a1"
  primary: "foreground on background"   # black button in light, near-white in dark
  ring: "Geist blue-700"       # focus ring and links
  success: green
  warning: amber
  destructive: red

typography:
  sans: "Geist Sans"           # --font-sans and --font-heading
  mono: "Geist Mono"           # ids, keys, code, shortcuts (--font-mono)
  body: { size: 14px, weight: 400 }
  table: { size: 13px }
  caption: { size: 12px }
  badge: { size: 11px, weight: 500 }

rounded:
  control: "6px"               # --ui-radius-control: buttons, inputs, selects, cards, tables
  popup: "12px"                # --ui-radius-popup and --ui-radius-modal: menus, popovers, dialogs
  badge: "pill"                # --ui-radius-badge

rules:
  - "Monochrome. Primary is foreground on background. Colour carries meaning only: blue for links and focus, green for success, amber for warning, red for destructive."
  - "No decorative hue. Active nav is a grey surface tint with full-foreground text. Charts use greys plus blue."
  - "Every text and background pair clears 4.5:1. Borders on controls and icons clear 3:1. Text on primary clears 4.5:1 in both themes."
  - "Focus uses the blue ring token, never --primary, so focus stays visible on black buttons."
  - "Flat surfaces. No gradients or card shadows. Hierarchy is the surface tint plus 1px borders."
  - "Hover and press change colour at once. No transitions on clickable elements."
---

## Style

Relay uses the Vercel dashboard style. It replaced the Linear design language on 2026-11-26 by owner decision.

Foundry ships the shapes. The root element and `body` carry `admin-ui`, so the preset also styles portalled menus, popovers and dialogs. Relay sets only colour and font tokens in `apps/relay-v2/src/styles.css`. Do not add per-page colour or radius classes.

## Palette

`apps/relay-v2/src/styles.css` is the source of truth for exact values. The front matter above lists the Geist-scale values for both themes.

- Light is the page on `#ffffff` with `#fafafa` cards, `#ebebeb` borders, `#171717` ink and `#666666` muted ink.
- Dark is the page on `#0a0a0a` with `#111111` cards, `#2e2e2e` borders, `#ededed` ink and `#a1a1a1` muted ink.
- Every `bg-primary text-primary-foreground` pair flips with the theme. Check both themes after a change.

## Type

- Geist Sans for all UI text and headings, Geist Mono for ids, keys and code. Both are self-hosted.
- Body is 14px, table text 13px, captions 12px, badges 11px at weight 500.
- Headings use weight 600 with slight negative tracking.

## Shape

- Controls and cards are 6px. Popups and modals are 12px.
- Badges are pills, 20px tall, one tone fill with tone text and no border. Pass the tone through `--ui-badge-tone`.
- Tables sit in a bordered, rounded frame with a muted header row. The frame is inset to the page padding so it lines up with the toolbar. The empty state sits in the same frame.
- The page body is centred at a max width of about 1200px.

## Buttons

- Size is the Foundry default, 32px. No `size="sm"`. Icon buttons use `icon`, not `icon-sm`.
- Primary: one per view, placed last.
- Outline: secondary actions.
- Ghost: tertiary actions such as Cancel, Back and icon buttons.
- Destructive: only inside `confirm-dialog.tsx`.
- Labels are a verb plus a noun, such as "Create campaign" or "Add contact". Never a bare "Create" or "Add".

## Component behaviour

- **Sidebar** (`RelaySidebar`, `nav.ts`): at most 8 links in quiet groups. The active link is a grey tint with foreground text. It collapses to an icon rail and never holds settings or tabs.
- **Tabs** (`SectionTabs`): links in a `nav`, not a Radix tablist, so back and forward work. The active tab sets `aria-current="page"`.
- **Dialogs and forms**: creating something happens in a dialog over the list (`CreateDialog`), never in a side column. Fields are 32px. Focus ring is blue.
- **View header** (`ViewHeader`): one compact row with title and actions, plus at most one muted line. Never a hero.
- **Lists** (`ListingTable`, `ResourceRow`): search and filter chips above compact rows. The empty state names the next action. No row stagger on filter or search.
- **Feedback**: `loading.tsx` skeletons for waits, `LoadingButton` for in-place saving, toasts only for results that leave the screen.

## Components (reuse, never restyle ad hoc)

Build screens from these parts and the semantic tokens (`bg-card`, `text-muted-foreground`, `bg-primary`). A pattern used twice becomes a component in `apps/relay/components/ds/`.

| Role | Relay component | File |
|---|---|---|
| panel | `Panel` | components/ds/panel.tsx |
| table frame | `DataSurface` (a `Panel`) | components/ds/data-surface.tsx |
| list with search and filters | `ListingTable` over Foundry `DataTable` + `FilterPill` chips | components/ds/listing-controls.tsx |
| sortable grid | Foundry `DataTable` directly | `@foundry/design-system` |
| collection page | `OperatorSplit`, `CreateDialog` | components/ds/operator-split.tsx, create-dialog.tsx |
| status badge | `StatusBadge` (tone: ok, bad, neutral) | components/ds/status-badge.tsx |
| send status | `OutboxStatusBadge` | components/outbox-status-badge.tsx |
| icon square | `IconTile` | components/ds/icon-tile.tsx |
| section tabs | `SectionTabs` (from `nav.ts`) | components/ds/section-tabs.tsx |
| sidebar | `RelaySidebar` | components/relay-sidebar.tsx |
| async button | `LoadingButton` | components/interior/loading-button.tsx |
| view header | `ViewHeader` | components/ds/view-header.tsx |
| page frame, card, tabs | `PageShell`, `SectionCard`, `Tabs` | @foundry/design-system |
| primitives | `Button`, `Input`, `Select`, `Dialog`, `Badge`, `Skeleton` | @foundry/ui |

Styling lives in tokens and these components, never in one-off class strings on pages.

## Public pages

The public landing is not yet in this style. It will be redesigned in Vercel style.
