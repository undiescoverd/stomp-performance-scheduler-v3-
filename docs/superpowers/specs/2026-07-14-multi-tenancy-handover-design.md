# Productions, membership, and handover

**Date:** 2026-07-14
**Status:** Approved (design); not yet implemented

## Problem

The app is about to run several unrelated STOMP productions — a Europe cast, and one or two US casts — whose rosters have nothing to do with each other. It cannot do that today.

`company_members` (the cast roster) is a **single global table with no owner column**. Every account reads and writes the same rows. Two productions would silently overwrite each other's cast. This is a live data-integrity bug, not a cosmetic one.

`schedules` and `tours` have the opposite problem: they are scoped to `user_id`, i.e. to a *person*. But the person changes. The Rehearsal Director who builds the schedule hands over to a successor, and the successor must inherit the production's cast and schedules rather than starting from an empty app. Data tied to a person cannot survive that handover.

Both problems have the same root cause: **the app has no concept of a production.** Cast and schedules belong to a production, which outlives any individual director.

## Solution

Introduce a **production** as a first-class entity. Cast, schedules, and tours belong to a production. People are attached to productions by **membership**. Handover is: invite the incoming director by email, overlap, then remove the outgoing one. The data never moves.

Rejected alternatives:

- **Single-owner production with a transfer button.** Simpler (no membership table), but all-or-nothing: no overlap period for shadowing, and if the outgoing director has already left, nobody can transfer.
- **One shared login per production.** Zero engineering, but means shared passwords, no per-person revocation, and no audit of who changed what.

## Data model

Four changes. Migration number **12** (11 is the highest existing).

### New: `productions`

```sql
CREATE TABLE productions (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,              -- "STOMP Europe"
  created_by  TEXT REFERENCES users(id),  -- nullable: see legacy backfill
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

`created_by` is the **owner guardrail**: the creator cannot be removed from their own production by someone they invited. It is nullable only so the legacy backfill can run on a database with no users.

### New: `production_members`

```sql
CREATE TABLE production_members (
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (production_id, user_id)
);
```

Flat membership — every member can invite and remove, except that no one may remove `productions.created_by`. No Owner/Editor role split: with one or two trusted directors it buys nothing and costs a permissions UI. Revisit if a third party (e.g. a producer) ever needs write access.

### New: `production_invites`

```sql
CREATE TABLE production_invites (
  id            TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  token_hash    TEXT NOT NULL,       -- sha256 of the raw token; raw token only ever in the email
  invited_by    TEXT NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  accepted_at   TIMESTAMPTZ
);
```

Mirrors `password_reset_tokens` deliberately: hash-at-rest, single use, expiring. Invites last **7 days** (a reset link's 1 hour is far too short for a handover). Reuses `auth/email.ts::sendEmail`, which is already live on Resend in production.

### Changed: scope the owned tables to a production

```sql
ALTER TABLE company_members ADD COLUMN production_id TEXT REFERENCES productions(id) ON DELETE CASCADE;
ALTER TABLE schedules       ADD COLUMN production_id TEXT REFERENCES productions(id) ON DELETE CASCADE;
ALTER TABLE tours           ADD COLUMN production_id TEXT REFERENCES productions(id) ON DELETE CASCADE;
```

Added nullable, backfilled, then set `NOT NULL`.

`schedules.user_id` and `tours.user_id` are **kept** (as "who created this row"), but they stop being the access-control boundary. Every read/write authorizes on `production_id` instead. Dropping the columns is a separate cleanup, out of scope.

**`tour_overview` view must be rewritten.** Migration 5 defines it joining `schedules` to `tours` on `user_id`:
`LEFT JOIN schedules s ON t.id = s.tour_id AND t.user_id = s.user_id`. Left as-is, a tour created by a departed director would stop matching its own schedules after handover. The join and the exposed column both move to `production_id`. This is the single easiest thing to miss in this change.

## Backfill of existing data

The 12 rows currently in `company_members` are seeded defaults, but they are "very close" to the real Europe roster and are worth keeping and editing rather than retyping.

Migration 12, after creating the tables:

1. Insert one production, **"STOMP Europe"**, `created_by` = the oldest row in `users` (or `NULL` if the table is empty).
2. `UPDATE company_members SET production_id = <it>` — all 12 defaults land there.
3. `UPDATE schedules SET production_id = <it>` and the same for `tours`.
4. Insert a `production_members` row for **every existing user**, so nobody is locked out of data they can currently see.
5. `SET NOT NULL` on the three new columns.

Consequence to accept knowingly: in a database with several unrelated users holding their own schedules, this folds them all into one production. That is correct for **production** (0 schedules; the only accounts are the throwaway test users I created plus the owner's Google account) and acceptable for local/staging dev data. It would be wrong on a database with real, unrelated users — none exists.

## Removing the seed

`ensureSeeded()` in `scheduler/company.ts` writes the 12 defaults on first use, guarded by the `company_seed_marker` singleton. **It is deleted.** New productions start with an empty cast — a US cast shares no performers with Europe, so seeding STOMP defaults would just be 12 wrong names to delete first. The existing 12 survive only via the backfill above.

`company_seed_marker` is left in place (harmless, and dropping it buys nothing).

## Choosing the active production

Endpoints need to know *which* production the caller means.

The client sends the selected production as a header, `X-Production-Id`, typed in Encore as `Header<"X-Production-Id">`. The backend resolves it in a shared helper:

```
requireProduction(userId, productionId) ->
  membership row exists? -> return productionId
  otherwise             -> throw APIError.permissionDenied
```

Every cast/schedule/tour endpoint calls it and scopes its SQL by the result. **A missing or non-member production id is a hard failure, never a silent fallback to "the first production"** — a fallback here would hand one production's cast to another production's director, which is precisely the bug being fixed.

The frontend persists the selection in `localStorage` and sends it on every request via the generated client. If a user belongs to exactly one production, the switcher is hidden.

Rejected: putting `productionId` in each request body — it would have to be threaded through every call site and is easy to forget on a new endpoint.

## User flows

**Fresh sign-up.** Register (or Continue with Google) → no memberships → forced setup screen: *"Name your production"* → creates the production, adds the creator as its first member → dashboard with 0 schedules and 0 cast.

**Existing owner (migration).** Logs in, is already a member of "STOMP Europe" via the backfill, sees the 12 cast and existing schedules exactly as before, plus a production name in the sidebar. Nothing to retype.

**Second production.** Create "STOMP US-1" → starts empty → add that cast. Europe's roster is invisible to it and vice versa.

**Handover.** `Production → People` → invite `newdirector@…` by email → they sign up or log in, accept, and the production appears for them with cast and schedules intact → both directors work in parallel during the shadowing period → remove the outgoing director. Access revoked; nothing lost.

**Multiple memberships.** A production switcher appears in the sidebar. Hidden for single-membership users.

**Bosses.** No accounts. They get the existing PDF export. This is why no read-only role is being built.

## API surface

New endpoints live in **`backend/scheduler/productions.ts`**, with the shared `requireProduction` helper in **`backend/scheduler/production_access.ts`** so every scoped endpoint imports one authorization path rather than hand-rolling a membership check. (A separate Encore service was considered and rejected: productions share `scheduleDB` with cast/schedules/tours, and a service boundary would buy nothing but cross-service calls.)

- `POST /productions` — create; caller becomes creator + first member.
- `GET /productions` — the caller's memberships (drives the switcher).
- `GET /productions/:id/members` — the People screen.
- `POST /productions/:id/invites` — send an invite email.
- `POST /productions/invites/accept` — redeem a token; adds membership. Requires auth, so an invited stranger registers first, then accepts.
- `DELETE /productions/:id/members/:userId` — remove, rejecting removal of `created_by`.

Changed: every endpoint in `company.ts`, `create.ts`, `list.ts`, `get.ts`, `update.ts`, `delete.ts`, `tours.ts`, and the auto-generate/validate paths that read cast — all scope by `production_id` via `requireProduction`.

## Error handling

- Non-member passing another production's id → `permissionDenied` (403). Never a fallback.
- Missing `X-Production-Id` on a production-scoped endpoint → `invalidArgument` (400).
- Invite token unknown, expired, or already accepted → single generic "invite is no longer valid". No leaking whether a production exists.
- Accepting an invite while already a member → succeed idempotently (a double-clicked email link must not error).
- Invite email addressed to an existing account → they simply gain a second membership; their own production is untouched.
- Removing the last member of a production → allowed, but warn in the UI; the production still exists and can be re-invited into. (Cheaper than a "you must keep one member" rule, and reversible.)
- `sendEmail` never throws (existing contract), so a Resend outage must not fail invite creation — the invite row is still written and can be resent.

## Testing

Backend (`encore test` — required; bare `bun run test` fails on `ENCORE_RUNTIME_LIB`):

- **Isolation is the headline test.** Two productions, each with cast + schedules; assert that a member of A reading cast/schedules/tours sees exactly A's rows and none of B's — for every scoped endpoint, not just one.
- `requireProduction` rejects a non-member (403) and a missing header (400).
- Invite lifecycle: create → accept → membership exists; expired token rejected; reused token rejected; double-accept is idempotent.
- `created_by` cannot be removed by an invited member; can remove others.
- Migration 12: on a database holding the 12 legacy cast + schedules + a user, assert all three land in "STOMP Europe" with the user a member, and `NOT NULL` holds.
- New production starts with **zero** cast (seed removal regression test).

Frontend: setup screen appears only with no memberships; switcher hidden at exactly one membership.

## Rollout

Migration is additive-then-constrain, so it applies cleanly to the live database. Deploy to staging first, verify the Europe backfill and cast isolation with two accounts, then promote to production (`git branch -f production main && git push encore production`).

Note: `encore run` does not hot-reload new migrations into a running session — restart it and verify with `encore db shell scheduler --env=local` → `SELECT * FROM schema_migrations` rather than trusting the "migrations done" banner.

## Out of scope (deliberately)

- Read-only/producer roles — export covers the bosses.
- Dropping `user_id` from `schedules`/`tours`.
- Per-production branding, billing, or cross-production reporting.
