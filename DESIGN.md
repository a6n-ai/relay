---
version: alpha
name: Relay
description: "Relay's console and public pages, built on Linear's design language (owner decision, 2026-11-10): a near-black canvas with a charcoal surface ladder, hairline borders, light gray ink and one lavender accent, plus a matching light theme. Radix primitives via @foundry/ui; Relay's own name and mark."

colors:
  primary: "#5e6ad2"          # lavender: primary buttons, active nav, focus, links, charts
  on-primary: "#ffffff"        # 4.7:1 on primary
  primary-hover: "#5561c9"     # darker, not Linear's #828fff (white text on it is 3.1:1)
  primary-focus: "#5e69d1"     # focus ring
  lavender-light: "#828fff"    # dark-theme icon tint, chart-2
  lavender-pale: "#a5adff"     # dark chart-3
  ink: "#f7f8f8"
  ink-subtle: "#8a8f98"        # 5.8:1 on surface-1
  canvas: "#010102"
  surface-1: "#0f1011"         # cards, panels, sidebar
  surface-2: "#141516"         # popovers, menus, dialogs
  surface-3: "#18191a"         # muted fills, secondary buttons
  lavender-surface: "#1b1d33"  # hover/selection tint, active nav
  hairline: "#23252a"
  hairline-strong: "#34343a"   # inputs
  success: "#4cb782"
  danger: "#ff6369"            # text-safe on dark tints
  light-canvas: "#fbfbfc"
  light-surface: "#ffffff"
  light-ink: "#0f1011"
  light-ink-subtle: "#63676e"
  light-lavender-surface: "#eeeffa"
  light-lavender-ink: "#2f3793"
  light-hairline: "#e6e6ea"
  light-danger: "#ce2c31"

typography:
  family: "Inter, -apple-system, SF Pro, Geist, system-ui"   # Linear's faces are proprietary; Inter is the stated substitute
  mono: "Geist Mono"
  h1: { weight: 600, letterSpacing: "-0.022em" }
  h2-h3: { weight: 600, letterSpacing: "-0.012em" }
  body: { size: 14px, weight: 400 }
  caption: { size: 12px }

rounded:
  base: "--radius: 0.5rem"     # buttons/inputs 8px (rounded-lg), cards ~12px (rounded-xl), pills rounded-full

rules:
  - "Flat canvas. No dots, gradients, glass or drop shadows on cards; hierarchy is the surface ladder plus 1px hairlines."
  - "Lavender carries interaction and data: primary actions, active nav (tint + lavender text/icon), hover/selection tint, focus ring, links, charts. Not decorative fills of whole sections."
  - "Dark is the default theme; light mirrors it with the light-* tokens."
  - "Every text/background pair clears 4.5:1."
---

## Components (reuse, never restyle ad hoc)

Every DESIGN.md surface maps to one Relay component. Build screens from these and the semantic tokens (`bg-card`, `text-muted-foreground`, `bg-primary`); a new pattern becomes a component in `apps/relay/components/ds/` before a second page uses it.

| DESIGN.md role | Relay component | File |
|---|---|---|
| surface-1 panel | `Panel` | components/ds/panel.tsx |
| table frame | `DataSurface` (a `Panel`) | components/ds/data-surface.tsx |
| list with search + filters | `FilteredResourceList`, `ResourceBoard`, `ResourceRow` | components/ds/listing-controls.tsx, resource-list.tsx |
| create / browse page | `OperatorSplit` | components/ds/operator-split.tsx |
| status-badge (signed deltas get an arrow) | `StatusBadge` (tone: ok, bad, neutral) | components/ds/status-badge.tsx |
| send status | `OutboxStatusBadge` | components/outbox-status-badge.tsx |
| icon square | `IconTile` | components/ds/icon-tile.tsx |
| section tabs | `SectionTabs` (from `nav.ts`) | components/ds/section-tabs.tsx |
| sidebar | `RelaySidebar` (8 links, `nav.ts`) | components/relay-sidebar.tsx |
| async button | `LoadingButton` | components/interior/loading-button.tsx |
| view header (16px icon, 18px title, one muted line, actions) | `ViewHeader` | components/ds/view-header.tsx |
| page frame, card, tabs | `PageShell`, `SectionCard`, `Tabs` | @foundry/design-system |
| primitives | `Button`, `Input`, `Select`, `Dialog`, `Badge`, `Skeleton`… | @foundry/ui (Radix) |

Buttons are `@foundry/ui` `Button`; `app/globals.css` maps its variants to DESIGN.md: `default` = button-primary (lavender), `outline`/`secondary` = button-secondary (surface-1 + hairline), `ghost` = button-tertiary; 8px corners, 14px/500 labels, 14px side padding.

Styling lives in tokens (`app/globals.css` `:root` and `.dark`) and these components, never in one-off class strings on pages.
