# Template-Building Mode — Design

**Date:** 2026-07-15
**Status:** Proposed (follow-up to the Week Templates feature, PR #7)
**Author:** Ian + Claude

## Problem

Building a template today means shaping a week in the schedule editor and choosing
**Save as template**. Two things make that unintuitive, especially from the
Templates library's **"New from blank week"** entry:

1. **The blank week is an empty grid.** It seeds `shows: []`, so the editor renders
   the role rows (Sarge, Potato, …) with **no day columns at all**. It reads as
   broken, and the only way to get a column is the **Add Show** button — which isn't
   discoverable, and which on a genuinely empty week anchors the new column to
   *today* rather than the Monday the user picked (`nextShow` has no existing day to
   anchor to).
2. **The casting layer is noise when you're only shaping days.** A template stores
   *shape only* — per day: status (show / travel / day off), show + call times,
   whether it's a double, and the company-RED-day flag. Cast is never templated
   (`showsToSlots` deliberately drops every performer and the venue). Yet the editor
   still shows Auto Generate / Clear All, the Roles Filled / RED-day Coverage /
   Conflicts stat cards, the per-performer **Roster & Validation** table with "X does
   not have a RED day" warnings, and the RED-day legend — none of which mean anything
   before there's a cast.

## Goals

- Every day of the week is a visible, editable column from the moment you start
  building — no hunting for "Add Show".
- When the intent is *shape only*, hide the casting affordances so the editor reads
  as a week builder, not a half-finished schedule.
- Keep templates strictly shape-only. (Confirmed scope: no cast is ever stored in a
  template; this design does not change that.)

## Non-goals

- No change to how templates are stored, applied, or to the `templates` API.
- No change to the normal New Schedule flow's casting editor — that keeps every
  casting affordance.

## Design

### Change 1 — seed a full Mon–Sun week instead of an empty one

Replace the "blank = 0 shows" starting point with a **full 7-day week**: Monday
through Sunday, one evening show each, default times from `getDefaultShowTimes`,
anchored to the chosen week-start Monday. The user then reshapes:

- flip a day's status (Monday → Travel, a dark day → Day Off) via the existing
  per-column status dropdown,
- adjust show/call times,
- turn a day into a double via **Add Show** (now a *secondary* "add a matinee"
  action, not the only way to get any column),
- optionally nominate the company RED day,
- **Save as template**.

This makes the grid immediately look like a week and sidesteps the
"Add Show anchors to today" bug entirely (the week now has anchored columns).

**Built-in choice rename.** The `BLANK_TEMPLATE_ID` built-in (currently `slots: []`)
becomes a **"Full week (Mon–Sun)"** choice that resolves to 7 single-show slots. An
empty week has no real use, so we replace Blank rather than keep both. This updates
the label in the New Schedule modal and the tour wizard automatically, since they
share `BUILTIN_TEMPLATE_CHOICES`.

- New helper in `components/domain/week.ts`, e.g. `FULL_WEEK_TEMPLATE_SLOTS`
  (offsets 0–6, each `status: "show"` with the weekday default single-show time).
- Rename the constant/label `Blank week` → `Full week (Mon–Sun)`.

### Change 2 — shape-only ("template-building") editor mode

Introduce an explicit **shape-only** mode the editor enters when the intent is
building a template, not casting a schedule. It cannot be inferred from "no cast"
(a fresh normal schedule is also uncast and *should* show Auto Generate), so it is
passed explicitly.

**Trigger.** The Templates library entry — renamed from **"New from blank week"** to
**"Build a week"** — opens the editor in shape-only mode via router state
(`seed.templateMode: true` alongside the existing seed). Natural extension (phase 2):
clicking a template row in the library opens *that template's* slots in shape-only
mode so its shape can be edited directly, instead of round-tripping through a scratch
schedule.

**In shape-only mode, hide the casting layer:**

- Grid: the role rows and cast dropdowns — leaving only the DATE / STATUS / SHOW /
  CALL header rows (the pure shape).
- Toolbar: **Auto Generate**, **Clear All**.
- Stat cards: **Roles Filled**, **RED-day Coverage**, **Conflicts** (keep **Shows
  This Week** — that's shape).
- The **Roster & Validation** panel and the **RED-day legend** banner.

**Keep the shape layer:** per-column status / time editing, **Add Show**, **Undo**,
**Reset Times**, company-RED-day nomination, and the week/date-range readout.

**Primary action.** In shape-only mode the header's primary button is **Save as
template** (create or Update `<name>`); the schedule-oriented **Save Changes** /
**Export PDF** are hidden (it isn't a schedule).

## Files likely touched

- `frontend/components/domain/week.ts` — add `FULL_WEEK_TEMPLATE_SLOTS`; repoint the
  built-in choice (rename `Blank week` → `Full week (Mon–Sun)`).
- `frontend/screens/TemplatesScreen.tsx` — "New from blank week" → "Build a week";
  seed the full week + `templateMode`; (phase 2) open a template row in shape-only
  mode for direct shape editing.
- `frontend/hooks/useScheduleEditor.ts` — read `templateMode` from the seed; expose
  it; seed a full week when building.
- `frontend/screens/ScheduleEditorScreen.tsx` — when `templateMode`, hide the
  casting stat cards / roster / legend / Auto Generate / Clear All / Save Changes /
  Export, and make **Save as template** primary.
- `frontend/components/domain/schedule-grid/ScheduleGrid.tsx` (+ body) — a
  `shapeOnly` prop that omits the role/cast rows, rendering the header shape rows
  only.
- `frontend/components/domain/NewScheduleModal.tsx` — picks up the renamed built-in
  label automatically.

## Open decisions to confirm before building

1. **Blank → Full:** replace the "Blank week" built-in with a full 7-show week
   (recommended), or keep an empty option too?
2. **Seeded shape:** 7 single evening shows (recommended — remove/convert down), or
   seed the Standard shape (Mon travel, Sat/Sun doubles) as the starting canvas?
3. **Phase 2 now or later:** does clicking a template row open it directly in
   shape-only mode for editing (nice, but more than the immediate fix)?
4. **Shape-only saving:** confirm shape-only mode offers *only* Save as template (no
   "save as a real schedule"), as proposed.

## Risks / notes

- The editor is shared between casting and shape-only use; the mode must be a clean
  conditional, not a fork, to avoid drift.
- Hiding the role rows is presentation-only — `shows`/assignments state is untouched,
  so `showsToSlots` capture is unaffected.
- Low risk overall: the editor already supports every shaping action; this is
  "seed 7 columns instead of 0" + a presentation mode.
