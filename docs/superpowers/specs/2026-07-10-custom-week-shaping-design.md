# Custom Week Shaping — Design

**Date:** 2026-07-10
**Status:** Approved, ready for implementation planning
**Branch:** `feat/custom-week-shaping` (off `fix/scheduler-remediation-v3.2`)

## Problem

The scheduler is built around one implicit week: travel Monday, singles midweek,
double Saturday, Sunday off. Real touring weeks are not like that. A scheduler
needs to express, for example:

> Monday travel, double Tuesday, Wednesday travel to another city, Thursday
> single, double Friday, double Saturday, Sunday off.

Today they cannot. The gap is not in the data model or the algorithm — it is
entirely in the editor.

## What already works (verified, not assumed)

`Show` in `backend/scheduler/types.ts` is already expressive enough:

```ts
export type DayStatus = "show" | "travel" | "dayoff";

export interface Show {
  id: string;
  date: string;
  time: string;
  callTime: string;
  status: DayStatus;
}
```

- A **double show day** is two `Show` rows sharing a `date`.
- A **travel day** and a **day off** are `status` values.
- A **removed day** is the absence of any `Show` row for that date.
- Per-day shape is persisted inside the `shows_data` JSONB blob. No relational
  per-day metadata exists, and none is needed.

The algorithm is shape-agnostic: it only ever filters on `status === "show"`.
Running `SchedulingAlgorithm.autoGenerate()` against the awkward week above,
five times, produced five successful generations with all eight roles filled on
all seven shows.

Per-day status controls (Show / Travel Day / Day Off / Remove Day) already exist
in the column header select at `GridHead.tsx:58`.

## What is missing

1. **Editing show and call times.** `handleShowChange(showId, field, value)` exists
   and is exported at `useScheduleEditor.ts:442`, and is called by nothing.
   `GridHead.tsx:49` renders times as read-only text.

2. **Adding a show to a chosen day.** `nextShow()` in `frontend/components/domain/week.ts`
   only restores slots present in the week as it was loaded, then appends past the
   final date. There is no way to say "make Tuesday a double."

3. **A stable seven-day frame.** Removing a day deletes its column, so the week
   visually collapses and the day cannot be restored by pointing at where it was.

4. **Non-destructive editing.** `handleShowStatusChange` (`useScheduleEditor.ts:431`)
   clears that day's assignments, guarded only by a `confirm()` dialog.

5. **Meaningful RED days on sparse weeks.** See below — this is a correctness bug,
   not a UI gap.

## The RED day defect

`assignRedDays()` (`algorithm.ts:965`) forks on whether *any* day-off column exists:

```ts
const companyDayOff = this.detectCompanyDayOff();
if (companyDayOff) {
  // mark all 12 performers RED on that date, then:
  return finalAssignments.map(a =>
    a.role === 'OFF' && !companyDayOffShowIds.includes(a.showId)
      ? { ...a, isRedDay: false }   // nobody is RED anywhere else
      : a
  );
}
// the v3.1 per-performer fairness path — unreachable on any week with a dark day
```

So a dark day does not merely *permit* itself to count as everyone's RED day; it
**always** does, and it cancels personal RED days on the way. On the awkward week,
all twelve RED days landed on Sunday — the day the company was already dark. The
v3.1 "everyone gets exactly one RED day" invariant passed **vacuously**: nobody
received a day off they did not already have.

Whether a dark day counts is a contractual question that only the scheduler knows.
It must therefore be an explicit, per-day choice.

Two further defects sit alongside it:

- `detectCompanyDayOff()` (`algorithm.ts:184`) returns only the **earliest** dark
  day. A week with two dark days silently ignores the second.
- When the fairness path cannot seat every performer on a sparse week, it should
  raise a warning rather than quietly succeed.

## Design

### 1. Data model — one optional field

```ts
export interface Show {
  id: string;
  date: string;
  time: string;
  callTime: string;
  status: DayStatus;
  isCompanyRedDay?: boolean;   // only meaningful when status === "dayoff"
}
```

Nothing else changes. Doubles stay "two rows, one date". `DayStatus` gains no
member — in particular **"removed" is not a status**; it remains the absence of
rows, and exists only as a view concept (§3).

### 2. Migration

A new migration backfills `isCompanyRedDay: true` onto every element of
`shows_data` whose `status` is `"dayoff"`, mirroring migration `2_add_show_status`.
Existing schedules therefore keep behaving exactly as they do today: their dark
day continues to be the company RED day.

New days off created in the editor default to `isCompanyRedDay` **unset**, because
the safe default is the one that makes the algorithm assign real personal RED days.

### 3. The seven-day frame

The grid always renders seven columns, Monday through Sunday, regardless of which
days carry shows. A date with no `Show` rows renders as a hatched placeholder
column labelled "No show", which can be clicked and restored.

This requires no schema change. `useScheduleEditor.ts:266-271` already derives the
week's Monday by snapping a show's date back to Monday, and that anchor survives any
single day's removal.

**Fix the anchor first.** That code reads `schedule.shows[0]`, which is only the
earliest show while `shows` happens to be sorted. Reshaping and time edits do not
guarantee it. Compute the Monday from `min(date)` instead, or the whole frame shifts
by a day.

**Guard:** at least one `Show` row must remain in a schedule, so the anchor can
never disappear. Removing the final day is rejected. `handleSave` already refuses to
save a schedule with zero shows, so this tightens an existing rule rather than
inventing one.

**Accepted behaviour change:** existing schedules will gain placeholder columns for
days they never had — a Monday column on the Tue–Sun default week, a Sunday column
on tour-generated Mon–Sat weeks. This is intended.

### 3a. The header, and weeks that span two cities

The header is redesigned for **every** week, not only split ones: the STOMP wordmark
is pinned hard left, and the city name becomes the largest thing on the sheet, spanning
the columns it covers. A single-city week gets one span across all seven days. This
mirrors the paper call sheets and replaces today's centered
`STOMP · London · Week 29` line, which buries the one fact a touring company reads
first: where they are.

The divider is the split-week *addition* to that layout, not the reason for it.

"Wednesday travel **to another city**" is half the requirement and the app cannot
express it: `Schedule.location` is a single string, and per-day location does not
exist (`TourWeek.locationCity` is per week).

`Show` gains an optional `location?: string`. The masthead groups consecutive columns
by resolved city and spans one cell per group, which produces the divider for free.

**The travel day belongs to the city being left.** Its popover captures the
destination and writes that city onto every day after it, up to and including the
next travel day — which in turn belongs to the city *it* leaves.

**Empty days fill backwards.** A date with no shows takes the city of the *next*
real day, not the previous one. A removed day is never a travel day, and the travel
day is what marks the boundary, so backward-filling keeps a removed day on the
correct side of the divider. Trailing empty dates fall back to the last known city.
Filling forwards is wrong and was caught in the prototype: removing the Thursday of a
Toulouse→Merignac week dragged Thursday into Toulouse.

`Schedule.location` becomes a summary of the segments, so a split week reads as
`Toulouse → Merignac` in the schedule list. The week number stays, shown under each
city, until it is deliberately dropped.

**The grid needs an explicit column model.** `ScheduleGrid` must declare a
`<colgroup>` with one `<col>` per show column and use `table-layout: fixed`. Under
auto layout a wide masthead cell hijacks a column's width and the city spans stop
aligning with the day columns beneath them.

### 4. The day editor

Clicking a day header opens a popover anchored to that column. It contains:

- **Status** — Show / Travel Day / Day Off / Remove Day (the existing select, moved).
- **Per show:** show time and call time inputs, plus Remove when the day has two shows.
- **"+ Add show to this day"** when the day has exactly one show.
- **"Travel to — [city]"** when the status is Travel Day, with a note naming the city
  the day stays with.
- **"Company RED day"** checkbox when the status is Day Off, explaining that ticking
  it means auto-generate will not place personal RED days elsewhere.
- **Restore this day** when the day is a placeholder.

The popover is positioned from `getBoundingClientRect`, not `offsetTop`/`offsetLeft`:
on a table cell those are relative to the table, not to the positioned ancestor, and
the popover ends up covering the day-header row so adjacent days cannot be clicked.

`GridHead.tsx` keeps responsibility for rendering the header; the popover is a new
`DayEditor.tsx` sibling so neither file grows unbounded.

### 5. Week-shaping functions (`frontend/components/domain/week.ts`)

Add, alongside the existing `nextShow` / `resetShowTimes` / `sortShows`:

- `addShowToDate(shows, date): Show[]` — appends a second show to a date holding
  exactly one. If the existing show is an evening, the new one is the matinee, and
  vice versa, taking times from `getDefaultShowTimes(date, occurrence)`.
- `weekFrame(shows, weekStartDate): string[]` — the seven ISO dates of the frame.

**Ordering guard.** After any time edit, shows on a date re-sort by time, and two
shows on one date may not share a time. `nextShow` restores removed slots by
matching on time; duplicate times make it restore the wrong one. A rejected edit
reverts the input rather than silently persisting.

### 6. Identity is not derived from time

`Assignment.showId` references `Show.id`. **`handleShowChange` must never mutate
`show.id`**, even when the show's time changes — re-keying would orphan every
assignment on that day. Ids are allocated once, at creation.

This is called out explicitly because it is the natural mistake: the id looks like
a derived value and is not one.

### 7. Algorithm changes (`backend/scheduler/algorithm.ts`)

- `detectCompanyDayOff()` filters on `status === "dayoff" && isCompanyRedDay === true`,
  and returns **all** matching dates rather than the earliest.
- An unflagged dark day is inert: the v3.1 fairness path runs and places twelve
  personal RED days across the show days.
- When the fairness path cannot give every performer a RED day, it emits a
  non-critical warning.
- The warning code must **not** join `CRITICAL_RULE_CODES`, so it cannot trip the
  auto-generate retry gate.

**Capacity is an upper bound, not a guarantee.** `showDates × (castSize − roleCount)`
— four performers off per show day, sixteen across the awkward week's four show days,
against a need of twelve — holds only for *single*-show days. On a double, a performer
must be off **both** shows to have a real day off, and seating four people off both
requires the same eight to work both shows, which fights the consecutive-show and
fatigue rules. Three of the awkward week's four show days are doubles. Treat the
formula as a ceiling when deciding whether to warn, and expect the true figure to be
lower.

**The unflagged path is unproven.** The five-run experiment that produced twelve RED
days on the dark day ran against *today's* code, where the `isCompanyRedDay` filter
does not exist — it demonstrates the bug, not the fix. Nobody has yet observed the
fairness path distribute twelve personal RED days across a sparse week, because it is
currently unreachable whenever a dark day exists. **The first task of M3 is to make
that path run on the awkward week and record what it actually does.** It may be
infeasible there, which is precisely why the warning exists. Do not plan M3 on the
assumption that it succeeds.

### 8. Non-destructive editing

An edit history in `useScheduleEditor` snapshots `{ shows, assignments }` before
every shaping action, capped at fifty entries. The `baselineShows` ref that already
makes Remove Day undoable widens into this history; `nextShow` keeps reading the
oldest snapshot as its baseline.

With real undo in place, the `confirm()` dialogs in `GridHead.tsx:22-36` are removed.
Destroying work behind a modal is worse than letting it be undone.

This is only safe because **saves are explicit**: `handleSave` (`useScheduleEditor.ts:294`)
is the sole caller of the create and update mutations, nothing autosaves, and
`autoGenerate` only sets local state. An in-memory history therefore always outlives
the destructive edit. If autosave is ever introduced, this decision must be revisited.

Auto-generate gains the ability to treat existing assignments as fixed and fill only
empty shows. This requires `SchedulingAlgorithm` to accept prior assignments as a
constraint — currently its constructor takes only `(shows, castMembers)` — and is
therefore the largest single piece of work here. It is milestone 4.

## Milestones

**M1 — Shape the week.** Seven-day frame (with the `min(date)` anchor fix), day-editor
popover, editable show and call times, `addShowToDate`, the ordering guard, the
id-stability rule, and the edit history that replaces the confirm dialogs. No backend
change.

**M2 — Split weeks.** `Show.location`, the segment-spanning masthead with the wordmark
pinned left, the `<colgroup>` column model, the travel-day destination field, and the
backward-fill rule. `Schedule.location` becomes a segment summary.

**M3 — Company RED days.** The `isCompanyRedDay` field, the migration, the
`detectCompanyDayOff` fix, multiple-dark-day support, and the capacity warning.

**M4 — Non-destructive generation.** Auto-generate fills only empty shows, preserving
cast on days it did not create.

M1 is independently shippable and unblocks the awkward week's *shape*. M2 completes the
requirement by letting that week span two cities. M3 makes RED days honest. M4 makes
reshaping a generated week pleasant rather than costly.

M2 and M3 both add a field to `Show`, so each needs an `encore gen client` regeneration
before the frontend typechecks.

## Testing

- `week.test.ts` gains cases for `addShowToDate` on evening-only and matinee-only
  days, the duplicate-time rejection, re-sorting after a time edit, `weekFrame`
  over a week with removed days, and the invariant that `Show.id` is stable across
  a time change.
- Segment tests over a Toulouse→Merignac week, asserting the boundary holds when
  each of these is removed in turn: a day in the first city, a day in the second, the
  leading day, the trailing day, and the travel day itself (which moves the boundary
  onto its own column). These five cases each caught or would have caught a real
  boundary bug in the prototype.
- `algorithm.test.ts` gains the awkward week in both configurations: with the dark
  day flagged, all twelve performers RED on that date; with it unflagged, twelve
  personal RED days distributed across show days and none on the dark day. Plus a
  week with two dark days, and a sparse week whose capacity is below twelve, which
  must warn rather than pass.
- A migration test asserting existing `dayoff` rows gain `isCompanyRedDay: true`.

## Out of scope

The standard week is hardcoded in three places that disagree: `tours.ts` generates
Monday–Saturday with Wednesday and Saturday matinees; `useScheduleEditor.ts` and
`week.ts` generate Tuesday–Sunday. Collapsing these into named, selectable week
templates is the correct cleanup and is deliberately deferred until real tours show
which shapes recur. Nothing in this design makes that harder.

`CreateTourWizard` continues to emit `isStandard: true` weeks. The `customShows`
path that `TourWeek` already supports stays unexposed; per-week shaping happens in
the editor, which is what this design delivers.

## Risks

- Existing schedules gain placeholder columns (§3). Visible, intended, worth a
  sentence in release notes.
- M3 changes RED day semantics for any *new* day off. The migration protects
  existing schedules; a scheduler creating a fresh day off will now get personal
  RED days unless they tick the box. This is the safer default but it is a change.
- M4 touches the algorithm's constructor and its assignment loop, which is the code
  the v3.1 fairness work stabilised. It is sequenced last for that reason.
- M4 has an unresolved question: pinned assignments can make "everyone gets exactly
  one RED day" **unsatisfiable**, because the v3.1 logic assumes it controls every
  placement. The fallback must be decided before implementation — warn and leave the
  RED day unplaced, or relax the pin. Do not discover this during the build.

## Verified, not assumed

Claims in this spec that were checked against running code rather than reasoned about:

- The algorithm generates the awkward week successfully, five runs from five, with all
  eight roles filled on all seven shows.
- All twelve RED days land on the dark day, confirming the `assignRedDays` fork —
  observed against current code, which demonstrates the bug and says nothing about
  whether the fixed path can seat everyone.
- Saves are explicit; nothing autosaves.
- Forward-filling the city of an empty day drags it across the divider; backward-filling
  does not.

Everything else here is design intent, including the capacity arithmetic in §7.
