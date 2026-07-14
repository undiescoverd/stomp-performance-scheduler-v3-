# Derived RED Days

**Date:** 2026-07-14
**Status:** ✅ **Implemented and shipped** (2026-07-14) — merged to `main` in `6948ff0`,
live in staging and production. Implemented as designed, with two deviations worth
knowing:

- **Branch A rebuilds its `OFF` rows from the complement** (as the fairness path does)
  rather than mapping over the input ones. `convertToAssignments()` is not guaranteed to
  emit a complete set of `OFF` rows, so a `map()` would silently drop a performer's
  dormant flag — the reversibility promise failing in the one place meant to protect it.
  A `stageDates` guard stops a dormant flag being re-emitted onto the *other* show of a
  two-show day.
- **Nine existing tests asserted the old stored-row behaviour** (`activeShows * 12 + 12`,
  counting the company RED `OFF` rows Branch A used to push). They now assert the rule
  instead. The acceptance suite got its own independent `effectiveRedDates()` helper
  rather than being pointed at the validator, preserving its recompute-don't-trust stance.

The persistence round-trip named below as load-bearing was verified end-to-end against a
real database: 12 dormant flags survived `PUT /schedules/:id`, and every restored pill
came back on exactly the date the DB stored.

## Problem

Adding a company RED day after an auto-generation leaves the schedule wrong, and
there is no cheap way to fix it.

Today a performer's RED day is *stored*: it is an `OFF` assignment carrying
`isRedDay: true` (`Assignment.isRedDay`). A company RED day is a separate flag on
the *day*: `Show.isCompanyRedDay`, valid only when `status === "dayoff"`.

The algorithm already knows the correct relationship between the two. Branch A of
`assignRedDays` (`backend/scheduler/algorithm.ts:1091`) says: if a company RED day
exists, that day is everyone's RED day, and every individual RED is cleared. But
that branch **only runs inside `autoGenerate()`**. Nothing re-evaluates it when the
flag is toggled in the editor.

So the user's flow — auto-generate, then add a company RED day — leaves twelve stale
individual RED days sitting in the grid. The only lever available is a full
regenerate, which risks moving casting the user has already accepted.

## The rule

One rule, applied everywhere the schedule is read. A performer's **effective RED
date** is:

1. **The company RED date**, if any show has `status === "dayoff"` and
   `isCompanyRedDay === true`. Stored `isRedDay` flags are ignored entirely.
2. **Otherwise**, the date of that performer's `OFF` assignment carrying
   `isRedDay: true` — today's behaviour, unchanged.

This is the rule Branch A already implements. The change is moving it from "runs
once, during generation" to "always true, everywhere the schedule is read".

## Consequences

Because the answer is derived rather than stored, adding a company RED day mutates
nothing:

- **No casting moves.** Roles are untouched. The schedule the user accepted survives.
- **Individual REDs go dormant, not deleted.** They stay in `assignments_data`, simply
  ignored while a company RED day exists.
- **Removing the Day Off restores them.** Reversibility falls out for free, with no
  snapshot, no undo stack, and no dependency on the session surviving a save/reload.
- **Previously-RED performers become plain OFF** on their old date — still off, but now
  callable for cover. This is the intended reading of "the company RED day is
  everyone's RED day".

## Implementation surface

### Backend

**`validateSchedule` RED block (`algorithm.ts:1753`).** Build `performerRedDays` from
the derivation rather than from the `isRedDay` flags: call the existing
`detectCompanyRedDate()`, and if it returns a date, give every cast member exactly
that one date. The three downstream rules (`RED_DAY_MULTIPLE`, `RED_DAY_MISSING`,
`RED_DAY_NOT_FULL_DAY`) then produce correct results without being modified.

**`assignRedDays` Branch A (`algorithm.ts:1091`).** Branch A currently clears every
other `isRedDay` flag and pushes company RED `OFF` rows. Under the derived rule both
are wrong:

- The clearing destroys the dormant flags this design promises to restore. Concretely:
  auto-generate → add a Day Off → hit Auto Generate again (which gap-fills via
  `existingAssignments`, it does not wipe) → the dormant individual REDs are gone
  permanently, and removing the Day Off leaves twelve performers with no RED day.
- The company RED `OFF` rows are redundant once the rule is derived.

Branch A should therefore preserve seeded individual RED flags (from `lockedRedDates`)
as dormant, write no company RED rows, and confine itself to skipping the forced-RED
work — the "vacate a role and refill it so this performer gets a day off" pass, which
is the part that moves casting.

**Dormant means inert, including during generation.** `seedAssignments` currently pins
manual RED days into `lockedRedDates`, which *constrains role placement* — the generator
will not cast a performer on their RED date. While a company RED day is active, that
constraint is arbitrary: it would keep CARY artificially off on a Tuesday for a reason
that no longer applies, needlessly narrowing the casting pool. So when a company RED date
exists, dormant flags do **not** feed `lockedRedDates`.

The invariant that keeps this safe: *a dormant flag must always be restorable.* Which
means if generation does cast a performer on their dormant RED date, that dormant flag is
dropped — the same self-healing rule `handleAssignmentChange` already applies in the
editor. Without this, removing the Day Off later would restore a RED day the performer is
cast into, tripping `RED_DAY_NOT_FULL_DAY`.

Verify the exact shape of Branch A's inputs against the code during implementation;
the above is the intent, not a literal diff.

### Frontend

- **`schedule-grid/logic.ts`** — `isRedDayFor` gets the same derivation; add a
  `companyRedDate(shows)` helper.
- **`ScheduleGrid.tsx`** (OFF row, ~L158) — OFF chips become non-interactive while a
  company RED day exists, with a tooltip naming the covering date: *"Company RED day on
  Fri 24/07 covers the whole company this week."*
- **`useScheduleEditor.handleToggleRedDay`** (L411) — matching guard, so the state
  layer cannot be driven into an inconsistent place even if the button is bypassed.
- **PDF export** — routed through the same derivation, so the printed schedule agrees
  with the screen.

### Readers to confirm before implementing

Every place that answers "is this a RED day?" must go through the derivation, or it will
disagree with the grid the moment a company RED day is active. Confirmed readers are
listed above. Two more must be checked during planning, and folded in if they read stored
`isRedDay` flags rather than the `validate` response:

- The **summary stat cards** above the grid (RED-day counts).
- The **tours service**, if it validates or counts RED days across bulk-created weeks.

`ViolationBanner` is already safe — it renders the structured `items` from `validate`.

### Known wart

The backend validator and the frontend grid do not share a module, so the rule is
written twice. It is small and stable enough that duplication beats building a shared
package for it — but two copies of a rule is how rules drift, and this is the first
place to look if the grid and the validator ever disagree about RED days.

## Edge cases

| Case | Behaviour |
|---|---|
| Several days off, one flagged | `detectCompanyRedDate()` already filters on the flag, and takes the earliest if two are somehow flagged. Derivation inherits this. |
| `RED_DAY_NOT_FULL_DAY` on the company RED day | Cannot fire — a `dayoff` day carries no roles. |
| `RED_DAY_MULTIPLE` under a company RED day | Cannot fire — the derived answer is a single date. |
| Dormant flag goes stale (performer cast on their dormant RED date while the company RED day is active) | Already prevented: `handleAssignmentChange` (L390) clears a performer's RED when they are cast on that date. Self-healing; keep this behaviour. |
| Generate from blank *with* a company RED day, then remove the Day Off | No dormant flags exist to restore, so all twelve performers have no RED day and are warned. This is honest — there is no prior state to return to — and a regenerate is the correct move. |

## Testing

- **Backend** (`algorithm.test.ts`): `validateSchedule` over a schedule holding a company
  RED day *and* stale individual REDs asserts zero RED errors and zero `RED_DAY_MISSING`
  warnings. The same schedule with the flag cleared asserts the individual REDs count
  again.
- **Backend**: `autoGenerate` seeded with `existingAssignments` that carry individual REDs,
  run with a company RED day set, asserts those flags survive (the Branch A regression
  above).
- **Backend, persistence round-trip**: write a schedule holding dormant `isRedDay` flags
  through `PUT /schedules/:id`, read it back, assert the flags are still there. This is the
  load-bearing test — see below.
- **Frontend**: unit test on the derivation in `logic.ts`.
- **Manual**: auto-generate → add the Day Off → assert no casting moved and the red pills
  went grey → **save and reload the page** → remove the Day Off → assert the red pills came
  back unchanged.

The save-and-reload step is not incidental. The whole reason this design beats
reconcile-on-mutation is that reversibility does not depend on the session surviving —
and an in-session toggle test would pass just as happily under the rejected approach. What
must actually hold is that dormant flags survive the round-trip through `update.ts` and
back out of `assignments_data`. If any save or load path normalizes assignments, that is
where this design fails, and only a round-trip test will catch it.

## Rejected alternatives

**Reconcile on mutation.** Ticking the box rewrites the assignments the way Branch A
would: clear every individual `isRedDay`, push company RED rows. The persisted data
then matches what auto-generate produces, which is tidy. Rejected because it is
destructive — untick the box and everyone has zero RED days — and its reversibility
would rest on the Undo stack, which does not survive a save and reload.

**A backend "recompute RED days" endpoint.** Expose `assignRedDays` over a saved
schedule. This is the only option that could also re-optimise the roles that
auto-generate shuffled in order to force people days off. Rejected because the user
explicitly does not want existing casting to move, which is the only thing this buys
over the derived rule.
