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
week's Monday by snapping the earliest show's date back to Monday, and that anchor
survives any single day's removal.

**Guard:** at least one `Show` row must remain in a schedule, so the anchor can
never disappear. Removing the final day is rejected.

**Accepted behaviour change:** existing schedules will gain placeholder columns for
days they never had — a Monday column on the Tue–Sun default week, a Sunday column
on tour-generated Mon–Sat weeks. This is intended.

### 4. The day editor

Clicking a day header opens a popover anchored to that column. It contains:

- **Status** — Show / Travel Day / Day Off / Remove Day (the existing select, moved).
- **Per show:** show time and call time inputs, plus Remove when the day has two shows.
- **"+ Add show to this day"** when the day has exactly one show.
- **"Company RED day"** checkbox when the status is Day Off, explaining that ticking
  it means auto-generate will not place personal RED days elsewhere.
- **Restore this day** when the day is a placeholder.

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
  non-critical warning. Capacity is `showDates × (castSize − roleCount)` — twelve
  performers against eight roles seats four per show day — so the awkward week's
  four show days give capacity sixteen against a need of twelve.
- The warning code must **not** join `CRITICAL_RULE_CODES`, so it cannot trip the
  auto-generate retry gate.

### 8. Non-destructive editing

An edit history in `useScheduleEditor` snapshots `{ shows, assignments }` before
every shaping action, capped at fifty entries. The `baselineShows` ref that already
makes Remove Day undoable widens into this history; `nextShow` keeps reading the
oldest snapshot as its baseline.

With real undo in place, the `confirm()` dialogs in `GridHead.tsx:22-36` are removed.
Destroying work behind a modal is worse than letting it be undone.

Auto-generate gains the ability to treat existing assignments as fixed and fill only
empty shows. This requires `SchedulingAlgorithm` to accept prior assignments as a
constraint — currently its constructor takes only `(shows, castMembers)` — and is
therefore the largest single piece of work here. It is milestone 3.

## Milestones

**M1 — Shape the week.** Seven-day frame, day-editor popover, editable show and call
times, `addShowToDate`, the ordering guard, the id-stability rule, and the edit
history that replaces the confirm dialogs. No backend change.

**M2 — Company RED days.** The `isCompanyRedDay` field, the migration, the
`detectCompanyDayOff` fix, multiple-dark-day support, and the capacity warning.

**M3 — Non-destructive generation.** Auto-generate fills only empty shows, preserving
cast on days it did not create.

M1 is independently shippable and unblocks the awkward week. M2 makes RED days
honest. M3 makes reshaping a generated week pleasant rather than costly.

## Testing

- `week.test.ts` gains cases for `addShowToDate` on evening-only and matinee-only
  days, the duplicate-time rejection, re-sorting after a time edit, `weekFrame`
  over a week with removed days, and the invariant that `Show.id` is stable across
  a time change.
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
- M2 changes RED day semantics for any *new* day off. The migration protects
  existing schedules; a scheduler creating a fresh day off will now get personal
  RED days unless they tick the box. This is the safer default but it is a change.
- M3 touches the algorithm's constructor and its assignment loop, which is the code
  the v3.1 fairness work stabilised. It is sequenced last for that reason.
