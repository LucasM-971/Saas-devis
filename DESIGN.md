---
name: Devis AI
description: Dashboard for building-trade companies that turns a chat into a priced quote.
colors:
  brand-orange: "#ea580c"
  brand-orange-deep: "#c2410c"
  brand-orange-press: "#9a3412"
  brand-orange-focus: "#f97316"
  brand-orange-wash: "#fff7ed"
  brand-orange-ring: "#ffedd5"
  canvas: "#fafaf8"
  surface: "#ffffff"
  ink: "#0f172a"
  ink-soft: "#334155"
  ink-muted: "#64748b"
  ink-faint: "#94a3b8"
  line: "#e2e8f0"
  line-strong: "#cbd5e1"
  tint: "#f1f5f9"
  danger: "#e11d48"
typography:
  headline:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.4
  stat:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 500
    lineHeight: 1.25
    fontFeature: "tnum"
  title:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
rounded:
  md: "0.375rem"
  lg: "0.5rem"
  card: "0.75rem"
  full: "9999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.25rem"
  xl: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.brand-orange}"
    textColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "0 1rem"
    height: "2.5rem"
  button-primary-hover:
    backgroundColor: "{colors.brand-orange-deep}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.lg}"
    padding: "0 1rem"
    height: "2.5rem"
  button-ghost:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.lg}"
    padding: "0 1rem"
    height: "2.5rem"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    height: "2.5rem"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "1.25rem"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 0.75rem"
    height: "2.5rem"
  badge:
    rounded: "{rounded.full}"
    padding: "0.125rem 0.625rem"
    typography: "{typography.label}"
  nav-item-active:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
---

# Design System: Devis AI

## Overview

**Creative North Star: "The Site Office"**

The Devis AI dashboard is a well-kept site office: tidy, practical, with nothing on the walls that serves no purpose. An artisan comes here to check figures, approve a quote and send it. The interface stays out of the way so the work can be read at a glance.

The palette is cool and neutral (an off-white canvas, white cards, slate greys) with one signal: a building-trade orange reserved for the main action and the active marker. Depth is almost flat: thin borders draw the structure and shadows are barely there. Density is that of a daily office tool, calm and precise, never flashy.

The interface scales with the screen (root of 16 → 18 → 20px), so everything is in rem and grows proportionally on large screens.

**Key Characteristics:**
- A single accent colour, orange (#ea580c), and a rare one.
- Borders before shadows; flat surfaces at rest.
- Inter throughout, medium weights, tabular figures for amounts.
- Status pills with a pale wash and dark text, never solid fills.
- Short, reduced-motion-aware transitions with an "expo out" easing.

## Colors

Neutral slate on a warm off-white, punctuated by one building-trade orange.

### Primary
- **Site Orange** (#ea580c): main button, active marker in the sidebar, "View all" links, focus ring (#f97316). Hover is #c2410c, press is #9a3412.
- **Orange Wash** (#fff7ed): background of the "brand" badge and light highlights; #ffedd5 for the input focus ring.

### Neutral
- **Off-white Canvas** (#fafaf8): app background, behind the cards.
- **Paper White** (#ffffff): cards, sidebar, inputs, top bar.
- **Slate Ink** (#0f172a): titles, amounts, active text.
- **Soft Slate** (#334155): secondary button text.
- **Muted Slate** (#64748b): subtitles, metric labels, inactive navigation.
- **Faint Slate** (#94a3b8): hints, placeholders, version footer.
- **Border Line** (#e2e8f0): borders on cards, inputs and separators; #cbd5e1 on hover for clickable tiles.
- **Slate Tint** (#f1f5f9): active and hover navigation items, ghost button hover.

### Statuses (semantic badges)
Pale wash (50) + dark text (700) per tone: slate (draft), amber (pending), blue (ready to validate), brand orange (sent), emerald (accepted), rose (rejected / error). Danger: #e11d48.

### Named Rules
**The Single Signal Rule.** Orange marks the main action and where you are. One solid orange button per view at most; never as a large background.

## Typography

**Body font:** Inter Variable (with ui-sans-serif, system-ui)

**Character:** a single typeface used with restraint; hierarchy comes from size and grey tone more than weight. Medium (500) dominates; semibold (600) is reserved for card titles.

### Hierarchy
- **Headline** (500, 1.125rem → 1.25rem from sm): page title (`PageHeader`).
- **Stat** (500, 1.25rem → 1.5rem, tabular figures): metric tile values and amounts.
- **Title** (600, 1rem): card titles (`CardHeader`).
- **Body** (400–500, 0.875rem): default text, navigation, tables, buttons.
- **Label** (500, 0.75rem): badges, metric labels on mobile, hints.

Larger sizes (text-3xl to 5xl) exist only on the public landing page.

### Named Rules
**The Aligned Figures Rule.** Every amount or count uses `tabular-nums` and aligns right in tables, with breakable thousands spaces.

## Layout

App shell: fixed sidebar (15rem, collapsible to 4rem on desktop, a drawer of up to 85vw on mobile), a top bar 3.5–4rem tall, then content on the canvas. Metrics sit in a 4-column grid on desktop that stacks on mobile. The rhythm runs in steps of 0.25rem: 1.25rem padding in cards (1rem on mobile), 1.25–1.5rem between page header and content, 0.25rem between nav items. On mobile, the page header action goes full width.

## Elevation & Depth

Nearly flat. Structure comes from 1px borders (#e2e8f0) and the contrast between canvas and white cards; shadow is only a hint.

### Shadow Vocabulary
- **Card** (`0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)`): every card and tile at rest.
- **Pop** (`0 4px 6px -1px rgb(15 23 42 / 0.08), 0 2px 4px -2px rgb(15 23 42 / 0.06)`): menus, dropdowns and modals only.

### Named Rules
**The Border First Rule.** A level separates with a border before a shadow. A clickable tile reacts by darkening its border (#cbd5e1), not by lifting.

## Shapes

Gently rounded corners: 0.5rem on controls (buttons, inputs, nav items), 0.75rem on cards, full pills for badges and the avatar, 0.375rem on tooltips. The active marker is a 3px rounded orange bar on the left edge of the nav item.

## Components

### Buttons
- **Shape:** gently rounded (0.5rem); heights of 2rem (sm), 2.5rem (md) and 2.75rem (lg).
- **Primary:** orange #ea580c, white text, medium weight, `shadow-sm`; hover #c2410c, press #9a3412.
- **Secondary:** white, 1px #e2e8f0 border, #334155 text; hover #f8fafc.
- **Ghost:** no background, #475569 text; hover #f1f5f9.
- **Danger:** rose #e11d48, reserved for destructive actions.
- **Disabled:** 50% opacity, not clickable.

### Badges / Statuses
- **Style:** full pill, 0.75rem medium text, 50 background and 700 text for the tone, no border.

### Cards / Containers
- **Corners:** 0.75rem. **Background:** white. **Border:** 1px #e2e8f0. **Shadow:** Card. **Padding:** 1.25rem (1rem on mobile).

### Inputs / Fields
- **Style:** height 2.5rem, white, 1px #e2e8f0 border, 0.5rem corners, placeholder #94a3b8.
- **Focus:** border #f97316 + 2px #ffedd5 ring. **Error:** border #fb7185, ring #ffe4e6.

### Navigation
- **Sidebar:** 0.875rem medium items, #475569 at rest; hover and active get a #f1f5f9 background with #0f172a text; the active item gets the left orange bar. Collapsed: icons only, with a dark tooltip (#0f172a) on hover.

### Metric tile (signature)
Small grey label → large medium value in tabular figures → faint hint. When it is a link, a chevron appears on hover and the border darkens.

## Do's and Don'ts

### Do:
- **Do** reserve #ea580c for the main action, the active marker and key links.
- **Do** separate surfaces with 1px #e2e8f0 borders and keep the Card shadow almost invisible.
- **Do** use `tabular-nums` and right alignment for every amount.
- **Do** express statuses as pale-wash badges with dark text.
- **Do** respect `prefers-reduced-motion` (already wired into `.animate-enter`, `.reveal`, `.page-transition`, `.hover-lift`).
- **Do** keep the 2px orange focus ring offset by 2px on every interactive element.

### Don't:
- **Don't** use orange as a large background or as body text.
- **Don't** stack heavy shadows or lift app cards on hover.
- **Don't** introduce a second font or a second accent colour.
- **Don't** use bold (700) in the app; 500 and 600 are enough.
