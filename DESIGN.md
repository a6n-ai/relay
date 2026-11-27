---
version: alpha
name: Relay
description: "Relay's console in the Vercel dashboard style: monochrome, Geist type, 6px controls, pill badges, framed tables. Colour carries meaning only."

colors:
  # Source of truth for exact values: apps/relay/src/styles.css. These are the Geist-scale values it ships.
  background: "#ffffff"        # light page
  card: "#ffffff"              # light cards; muted, secondary and accent fills are #f2f2f2 (sidebar is #fafafa)
  border: "#ebebeb"            # light hairline
  foreground: "#171717"        # light ink
  muted-foreground: "#666666"  # light secondary ink
  dark-background: "#0a0a0a"
  dark-card: "#111111"         # dark cards and popovers; muted, secondary and accent fills are #1a1a1a
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
  table: { size: 14px }
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

Foundry ships the shapes. Only `<body>` carries `admin-ui` (`apps/relay/src/routes/__root.tsx`), so the preset also styles portalled menus, popovers and dialogs. Relay sets only colour and font tokens in `apps/relay/src/styles.css`. Do not add per-page colour or radius classes.

## Palette

`apps/relay/src/styles.css` is the source of truth for exact values. The front matter above lists the Geist-scale values for both themes.

- Light is the page on `#ffffff` with `#ffffff` cards, `#f2f2f2` muted fills, `#fafafa` sidebar, `#ebebeb` borders, `#171717` ink and `#666666` muted ink.
- Dark is the page on `#0a0a0a` with `#111111` cards, `#1a1a1a` muted fills, `#2e2e2e` borders, `#ededed` ink and `#a1a1a1` muted ink.
- Every `bg-primary text-primary-foreground` pair flips with the theme. Check both themes after a change.

## Type

- Geist Sans for all UI text and headings, Geist Mono for ids, keys and code. Both are self-hosted.
- Body is 14px, table text 14px, captions 12px, badges 11px at weight 500.
- Headings use weight 600 with slight negative tracking.

## Shape

- Controls and cards are 6px. Popups and modals are 12px. The framed content panel is 16px (`--ui-radius-panel` in `styles.css`).
- Badges are pills, 20px tall, one tone fill with tone text and no border. Pass the tone through `--ui-badge-tone`.
- Tables sit in a bordered, rounded frame with a muted header row. The frame is inset to the page padding so it lines up with the toolbar. Loading skeletons and the empty state render inside the same frame, so loading, empty and full do not jump.
- The page body is centred at a max width of 72rem (1152px) by a grid in `app-shell.tsx`. Form and settings pages fill the same 72rem through `FormPanel`, the one body wrapper, so page actions in the title row line up with the cards.
- Cards follow Vercel: a title row (20px title, description) with a hairline under it, the body, then a muted footer strip. `DangerCard` has the same normal border; only its footer button is red.
- Tables are 40px rows through `--ui-table-row-height`, so a row-menu button must not set a taller row. Under `sm`, columns marked `secondary` hide, so a phone never cuts a cell mid-word. The header (scope row and tabs) stays full width, and dialogs, sheets and popovers keep their own width.

## Buttons

- Size is the Foundry default, 36px. No `size="sm"`. Icon buttons use `icon`, not `icon-sm`.
- Primary: one per view, placed last. The global `Add New` menu in the scope row is the one exception to filled: it is outline, so the page's primary stays the single filled button.
- Outline: secondary actions.
- Ghost: tertiary actions such as Cancel, Back and icon buttons.
- Destructive: only in `confirm-dialog.tsx` and the footer button of `DangerCard`, which opens it.
- Labels are a verb plus a noun, such as "Create campaign" or "Add contact". Never a bare "Create" or "Add".

## Component behaviour

- **Sidebar** (`shell/app-shell.tsx`, `shell/nav.ts`): 256px, 36px items at 14px, at most 8 top-level links in quiet groups, no sub-items. The active link is a grey tint with foreground text. Order: workspace switcher, Find (F), nav, account. It collapses to an icon rail and never holds settings or tabs.
- **Framed panel**: the content is a bordered, rounded (16px) panel inset beside the sidebar on desktop (`variant="inset"`, rule in `styles.css`) and full-bleed on mobile.
- **Dialogs and pages**: a create with several sections is a full page (`CreatePage`, with `FormPanel` and one `SettingsCard` per section): app, domain, address, campaign, template, automation, list, import and workspace. Only an add with 3 fields or fewer, a secret shown once, a schedule and a confirm are dialogs (`CreateDialog`, `ConfirmDialog`), never a side column. Fields are 36px. Focus ring is blue. Every field is a `TextField` or `ChoiceField`: label, control, then the error and hint tucked under it; the error sits on the field and clears when it changes. A disabled primary says why (`disabledReason`). `ConfirmDialog` focuses Cancel first, its primary is Verb + noun, and a typed name is exact and case-sensitive.
- **Page header** (`PageHeader`): the `crumbs` prop renders as a back link, not a breadcrumb trail. A 56px scope row (app scope switcher on app-scoped pages, a back link on detail pages, otherwise the workspace name as plain text; `Add New` menu on the right, gated by role through `createItems`), then `SectionTabs` (grey fill on the active tab, 14px) where the section has them (Messages, Campaigns, Settings, app detail), then `PageTitle`: 32px semibold tight title, a one-line 16px muted description (`staticData.copy` on the route), actions on the right of the title row (`PageHeader actions`), never alone on a row of their own. A toolbar holds search, filters and the view toggle; on phones the search takes a full row and the filter and view toggle share the next. Every route renders it first. Add New items are routes (`shell/nav.ts`); only Invite member opens its dialog through `?new=1`.
- **Type scale**: body and table text 14px, card titles 20px semibold, controls 36px, table rows 40px; set in the `styles.css` token block, never per page.
- **Lists** (`ResourceTable` in a `Toolbar` page): the empty state is `EmptyState`: one 32px icon, a title, a line and the action, in that order, always. No row stagger on filter or search.
- **Feedback**: route `pendingComponent` with the skeleton that matches the page (`ListSkeleton`, `CardsSkeleton`, `FormSkeleton`, `DetailSkeleton`) for waits, toasts only for results that leave the screen.

## Components (reuse, never restyle ad hoc)

Build screens from these parts and the semantic tokens (`bg-card`, `text-muted-foreground`, `bg-primary`). A pattern used twice becomes a component in `apps/relay/src/components/`. Folders: `shell/` is the console frame (sidebar, header, switchers), `page/` the page parts, `form/` the fields, `lib/` hooks and client helpers, `landing/` the public site. UI files import only `shared/`, `components/` and `console/*.fns.ts` (`test/ui-boundary.test.ts`).

| Role | Component | File (under `apps/relay/src/components/`) |
|---|---|---|
| page header, title, tabs | `PageHeader`, `PageTitle`, `SectionTabs` | shell/page-header.tsx, shell/page-title.tsx, shell/section-tabs.tsx |
| add new menu, scope switcher | `AddNewMenu`, `ScopeSwitcher` | shell/add-new.tsx, shell/scope-switcher.tsx |
| toolbar | `Toolbar` | page/toolbar.tsx |
| table with frame | `ResourceTable` (Foundry `Table`, inset by `TableInset`) | page/resource-table.tsx, page/table-inset.tsx |
| loading | `ListSkeleton`, `CardsSkeleton`, `FormSkeleton`, `DetailSkeleton` | page/page-skeleton.tsx |
| empty | `EmptyState` (passed as `empty` to `ResourceTable`) | page/empty-state.tsx |
| page body wrapper (the only one) | `FormPanel` | form/form-parts.tsx |
| create page (back link, title, one card per section, primary last) | `CreatePage` | page/create-page.tsx |
| create page when no app exists | `NoAppState` | page/no-app-state.tsx |
| read-only value with a hint | `FixedField` | form/fixed-field.tsx |
| automation create and edit | `AutomationForm` | campaigns/automation-form.tsx |
| row actions | `RowMenu` | page/row-menu.tsx |
| settings card (title row, hint left, action right, grey footer strip) | `SettingsCard` | page/settings-card.tsx |
| settings card with its own Save (form, hint, blocked reason, unsaved prompt) | `SettingsForm` | page/settings-card.tsx |
| danger zone (consequence once, typed-name confirm) | `DangerCard` | page/danger-card.tsx |
| text field (label, hint, error, prefix/suffix) | `TextField` | form/text-field.tsx |
| choice field, empty pick with a create link | `ChoiceField`, `EmptyChoice` | form/choice-field.tsx, form/empty-choice.tsx |
| form buttons (`disabledReason` explains a disabled primary) | `FormActions` | form/form-parts.tsx |
| create flow | `CreateDialog` | page/create-dialog.tsx |
| destructive confirm | `ConfirmDialog` | page/confirm-dialog.tsx |
| status, meter, stat | `StatusBadge`, `MeterBar`, `StatTile` | page/status-badge.tsx, page/meter-bar.tsx, page/stat-tile.tsx |
| denied page (no workspace, suspended, no permission) | `PageDenied`, `ScopedDenied` (an app-scoped page's loader data) | page/page-denied.tsx, page/scoped-page.tsx |
| submit handler: pending, error copy, success toast, then close or navigate and refresh | `useSubmit().run(action, fallback, { success, after, invalidate })` | lib/use-submit.ts |
| loader-less fetch with a live flag | `useLoad` | lib/use-load.ts |
| row action and confirm-dialog action (toast, refresh) | `runAction`, `confirmAction` | lib/run-action.ts |
| scoped page loader over the shell's apps, app name and default app | `scopedLoad`, `appName`, `startApp` | lib/scoped-load.ts, shared/scope.ts |
| primitives | `Button`, `Input`, `Select`, `Dialog`, `Badge`, `Skeleton` | @foundry/ui |

Styling lives in tokens and these components, never in one-off class strings on pages.

## Public pages

The public landing is not yet in this style. It will be redesigned in Vercel style.
