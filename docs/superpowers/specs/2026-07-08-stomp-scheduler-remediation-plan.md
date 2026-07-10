# STOMP Scheduler — Reconciled Remediation Execution Plan (v3 → v3.2)

**Date:** 2026-07-08
**Spec source of truth:** the user's "STOMP Scheduler — Remediation Plan (v3 → v3.2)" doc plus its §0 canonical rules, and the "Master Logic Specification". This document does **not** restate those rules; it is the *execution layer* — order, test gates, and the corrections found by verifying the plan against the actual code.

Where this document and the remediation doc disagree on a **line number / file / command**, this document wins (it was verified against the code on 2026-07-08). Where they disagree on a **business rule**, the remediation doc's §0 wins.

---

## 0. Ground rules for execution

- Work phases **in order**. A phase is not "done" until its verify step is green.
- **Test command (corrected):** backend has no `test` script. Run from repo root:
  - Backend: `./node_modules/.bin/vitest run backend/scheduler/...`
  - Frontend: `cd frontend && bun run test -- --run` (or `../node_modules/.bin/vitest run` from frontend)
  - Full: `./node_modules/.bin/vitest run`
- **Baseline (confirmed 2026-07-08):** `backend/scheduler/algorithm.test.ts` = 11/11 passing.
- Do not "improve" business rules beyond §0. Do not touch out-of-scope items (auth scoping, determinism/seeding, unrelated UI).
- One commit per phase, using the remediation doc's suggested commit sequence.
- Each phase: run the relevant suite before moving on; never leave a phase red.

---

## 1. Corrections applied to the original plan (verified against code)

These are baked into the phase steps below. Listed here once so nothing is lost.

1. **ScheduleEditor.tsx L117 does not exist.** The file is 113 lines with no consecutive-show logic. The `>= 6` threshold to fix is **ScheduleAnalytics.tsx L70**, which also counts by show-list array order (not by date) and must be rewritten to group by date per §0 rule 2. → Phase 1.3.
2. **`areShowsConsecutive` has 4 callers, not 2:** `getConsecutiveShowCount` (L410), `canAssignPerformerToShow` (L500), `findConsecutiveSequences` (L1267, reached via `analyzeConsecutiveShows` → `findConsecutiveSequences`). The helper swap is necessary but **not sufficient** — run correctness lives in the accumulation loops. → Phase 1.1.
3. **Test command** is `./node_modules/.bin/vitest run backend/scheduler/...` from repo root, NOT `npx vitest run backend/scheduler`. → all verify steps.
4. **Phase 6.4 regen is a safety no-op, not a gate.** `frontend/client.ts` resolves response types via `typeof <endpoint>` (Encore v1.50.0 generator), so widening `AutoGenerateResponse` in `auto_generate.ts` flows through automatically and clears the `useScheduleEditor.ts:116` error. Run `encore gen client --target leap` anyway, but do not block the phase on it (it needs the app to compile / may need a running backend).
5. **`hasCriticalErrors` has a live hole today:** `error.includes("not eligible")` never matches the actual emitted strings (`"not in eligible roles"`, `"role requires female performer"`). The Phase 5 structured `RuleCode` mapping must *close* this (explicit `ROLE_INELIGIBLE` / `GENDER_VIOLATION` codes), not port the broken substring. → Phase 5.
6. Line numbers in the original plan are low by ~1–8 throughout; the anchors (function names, exact snippets) are correct. Trust the function name over the number.

Additional confirmed facts:
- `isBackToBackDoubleDay(date)` already exists and is used in forced-RED scoring — the back-to-back-doubles rule is partially implemented already.
- `isOverride` does **not** exist on `Assignment` (Phase 4 adds it). No migration needed — `assignments_data` is a JSON string column (`JSON.stringify`/`JSON.parse` in create/update/get/toggle_red_day).
- `create.ts` always writes an empty assignments array; assignments are only persisted via `update.ts`. Neither validates on save — overrides already persist.
- The `"warning"` severity branch in `validate_comprehensive.ts` (~L135-144) is dead code (the analyzer only emits `"critical"`/`"ok"`).

---

## 2. Cross-cutting correctness discipline (applies to Phases 1, 3, 7)

The §0 consecutive-run definition has two properties the pairwise helper alone does **not** enforce. Every run-counting loop and every test must honor both:

- **A gap day resets the run to 0.** Tue + (Wed no shows) + Thu → run does NOT chain across Wed. This is the exact regression the old `<= 2` bug caused.
- **Same-day matinee + evening counts as 2 toward the run**, not 1. Sat mat + Sat eve + Sun mat = run of **3**.
- **Dates only, never datetimes.** Anchor every `YYYY-MM-DD` at `T12:00:00Z` and compare with `getUTCDay()` / `Math.round(diff/86400000)`.

Tests must assert on the **computed run count**, independently recomputed in the test — not merely the pairwise boolean and not by trusting the validator (pull Phase 7.2's "recompute independently" discipline forward into Phase 1).

---

## 3. Phase-by-phase execution

### PHASE 1 — Consecutive-shows definition + "6 is legal" (commit 1)
**Files:** `algorithm.ts`, `validate_comprehensive.ts`, `ScheduleAnalytics.tsx`, `algorithm.test.ts`
1. Create `backend/scheduler/date_rules.ts` exporting `areDatesConsecutive(date1, date2): boolean` (noon-UTC anchor, `Math.round`, return `dayDiff === 0 || dayDiff === 1`).
2. Rewrite `areShowsConsecutive` (~L1310) to delegate to the date helper (drop `T${show.time}`, drop `<= 2`).
3. **Audit all 4 callers' accumulation loops** (L410, L500, L1267) + the standalone in `validate_comprehensive.ts` (~L347) — confirm gap-day reset and mat+eve=2. Route `validate_comprehensive.ts` through the shared helper so the definition can't drift.
4. 6-is-legal off-by-one: `validate_comprehensive.ts` L372 & L392 `>= 6` → `> 6`; re-check the L123-147 severity branches; `ScheduleAnalytics.tsx` L70 `>= 6` → `> 6` **and rewrite its counter to group by date** (reset on any zero-show date).
5. Tests: rename the stale `algorithm.test.ts:40` ("...more than 3...") to "...more than 6..."; add helper unit tests (Tue+Wed=true, Sat mat+eve=true dayDiff 0, Tue+Thu-with-Wed-off=false, Sun eve+Tue=false); add run-count tests (Sat mat+eve+Sun mat → 3); add the integration test (Tue,Wed,Thu-off,Fri,Sat mat,Sat eve,Sun mat → zero consecutive errors).
6. **Verify:** `./node_modules/.bin/vitest run backend/scheduler` + the ScheduleAnalytics test — all green.

### PHASE 2 — Delete Fri–Sun weekend cap (commit 2)
**Files:** `algorithm.ts`, `algorithm.test.ts`, `validate_comprehensive.ts`, frontend copy
1. Delete `wouldViolateWeekendRule` (~L562-603); delete CHECK 3 in `getEligiblePerformers` (~L835-838); renumber remaining checks' comments.
2. Delete the "Weekend Rule Validation" block in `validateSchedule` (~L1435-1461).
3. Remove `error.includes("shows over a weekend") || error.includes("exceeds maximum of 4")` from `hasCriticalErrors` (~L696).
4. `grep -rn "weekend" backend frontend --include=*.ts --include=*.tsx`; remove dead references (validate_comprehensive weekend category if any; frontend tooltips). **Keep `isWeekend()`** (RED-day preference; its TZ fix is Phase 6.2).
5. Tests: **replace** the "Weekend 4-Show Rule Prevention" describe block (~L112-170) with back-to-back-doubles tests (Sat mat/eve+Sun mat/eve → excluded+error; Wed/Thu doubles → same; Fri mat/eve + Sat mat + Sun mat/eve, no adjacent double days → **valid**). Do not delete coverage.
6. **Verify:** full backend suite green; loop `autoGenerate` 20× on a standard week — assert no back-to-back-doubles output.

### PHASE 3 — RED-day assignment must refill + re-validate (commit 3)
**Files:** `algorithm.ts`
1. Restructure `autoGenerate` success path (~L699-716): `validate → assignRedDays → RE-VALIDATE final → success only if clean, else continue to next attempt`. Same re-validation on the partial path (~L718-737), surfacing post-RED errors in the returned `errors`.
2. Forced-RED branch (~L1052-1094): when splicing performer P off show S, **refill each vacated (show, role)** with an eligible, constraint-clean, lowest-show-count candidate (reuse `selectBestPerformer`); exclude those whose decided RED day is S's date and unplaced `performersWithoutRedDays`. If no candidate → try next-best date; if no date works → leave P untouched, record warning, let the re-validation/attempt loop handle it. Delete the dead guard `if (performerRedDays[performer]) continue;` (~L1062).
3. RED-day preference → **single-show days first**: scoring `score += (2 - showsOnDate.length) * 10`, weekday tiebreak `+3`, keep back-to-back-double avoidance `+5`; mirror ordering in the natural-day-off comparator (fewer shows, then weekday).
4. Tests: high-demand cast (no natural day off for someone), `autoGenerate` 30× → every success has 8 unique filled stage roles per show, exactly 1 RED day/performer, each RED day a full day off. Unit-test the refill path.
5. **Verify:** full suite green; the 30× loop is the acceptance gate (zero under-filled shows).

### PHASE 4 — Manual injury override (commit 4)
**Files:** `types.ts`, `algorithm.ts` (validateSchedule), `update.ts`/`create.ts`/`get.ts` (round-trip check), `ScheduleEditor`/`ScheduleGrid`, `pdfExport.ts`
1. Add `isOverride?: boolean` to `Assignment`. Confirm JSON round-trip tolerates it (it will — no migration).
2. `validateSchedule`: for a **back-to-back-doubles** or **weekly >6** violation, if any of P's stage assignments on the involved dates has `isOverride === true`, emit a **warning** not an error. Overrides must **never** soften casting (8-on-stage, eligibility, gender, duplicates), >6-consecutive, or RED-day errors.
3. Generator always emits `isOverride: false`/absent (unchanged).
4. Frontend: confirm affordance ("Mark as injury/sickness override?") sets the flag on the offending assignments; distinct marker (⚑); include note in PDF export.
5. Tests: override on Sat/Sun doubles → valid, 1 warning, 0 errors; same without flag → error; override on ineligible role → still error.
6. **Verify:** full suite green.

### PHASE 5 — Structured rule codes replace string matching (commit 5)
**Files:** `algorithm.ts`
1. Add `RuleCode` union + `ValidationItem { code, severity, message, performer?, showId? }`. Build `items` internally in `validateSchedule`; keep `ConstraintResult` (`isValid`, `errors`, `warnings`) as a **derived view**; expose `items` alongside.
2. `hasCriticalErrors` → code check (delete the `includes(...)` chain). **Close the eligibility/gender hole** — `ROLE_INELIGIBLE` and `GENDER_VIOLATION` must be explicit error-severity codes so they now count as critical (they don't today).
3. Tests: generator retries on a seeded `BACK_TO_BACK_DOUBLES` even after rewording the message string.
4. **Verify:** full suite green.

### PHASE 6 — Data-model & consistency hardening (commit 6)
**Files:** `types.ts`, `algorithm.ts`, `cast_members.ts`, `company.ts`, `auto_generate.ts`, client regen
1. Add `gender: "male" | "female"` to `CastMember`; set in `CAST_MEMBERS` (MOLLY/JASMINE/SERENA female). Replace both hardcoded `["MOLLY","JASMINE","SERENA"]` (L653, L1376) with `castMember.gender === "female"`. Ensure `cast_members.ts`/`company.ts` carry `gender`; backfill if the company source lacks it. `grep -rn "MOLLY" backend frontend` — no stray gender lists.
2. TZ: `isWeekend` (~L1118) → `new Date(date + "T12:00:00Z").getUTCDay()`; `formatDateForValidation` (~L1514) same anchor; sweep both files for bare `new Date(YYYY-MM-DD)` feeding day-of-week/diff logic → route through `date_rules.ts`. Test with `TZ=America/New_York`: `isWeekend("2026-07-11")` (Sat) === true.
3. Surface the silent OFF-selection fallback: `assignRolesForShow` fallback to `selectOffMembersOld` → increment a counter, append a warning to the `autoGenerate` response when used.
4. Widen `AutoGenerateResponse` in `auto_generate.ts` to include `generationId?: string` (pass it through). Run `encore gen client --target leap` from `backend/` **last** — but the TS error clears from the type change regardless; don't gate on the regen.
5. **Verify:** full suite green; TZ test green; `useScheduleEditor.ts` typechecks.

### PHASE 7 — Full-system acceptance gate (commit 7)
1. `./node_modules/.bin/vitest run` — entire suite green.
2. Add a **50× soak test** (standard 8-show week) asserting all §0 invariants, **recomputing consecutive runs independently** (don't trust the validator).
3. Non-standard split-week test (travel Mon, dayoff Tue, show Wed, travel Thu, Fri single, Sat/Sun doubles): everyone's RED = Tue; no back-to-back; Fri+Sat mat+Sat eve legal; Sat double+Sun double blocked.
4. Two `dayoff` days → only earliest is company RED; no `RED_DAY_MULTIPLE`.
5. E2E: `frontend/e2e/schedule-workflow.e2e.test.ts` — update any weekend-message / `>=6` assertions (note: current e2e does not actually assert these, so likely minimal).
6. Manual smoke: UI generate → no analytics warning on a legal 6-run; override flow round-trips save/load/PDF.

---

## 4. Risks & open decisions

- **encore gen client (6.4):** may require a compiling app / running backend in this environment. Mitigation: the type-widening alone fixes the known TS error; regen is best-effort.
- **Frontend override UI (4.4):** the only genuinely new UI surface. Everything else is logic. If UI work should be deferred, Phases 1–3 + 5–6 (all backend) deliver the core correctness fixes independently.
- **Company/gender source (6.1):** `cast_members.ts` pulls from an in-memory `company.ts`, not a DB table. Backfilling `gender` there is trivial; confirm no separate DB-seeded company path exists.

## 5. Out of scope (do not touch)
Auth scoping / `user_id='system'` orphans; generation determinism/seeding; any UI beyond the override affordance and corrected warnings.
