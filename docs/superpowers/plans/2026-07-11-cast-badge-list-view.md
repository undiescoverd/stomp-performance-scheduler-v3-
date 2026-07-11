# Cast Badge Color, List View & Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Cast screen, make avatar badges a single accent blue instead of per-member hues, add a badge/list view toggle, and add an alphabetical A–Z/Z–A sort that applies to both views.

**Architecture:** Pure CSS/JSX changes to existing presentational components (`CastCard`) plus one new sibling presentational component (`CastListRow`); a small generic, unit-tested sort utility in `format.ts`; two pieces of `useState` in `CompanyScreen` driving which component renders and in what order. No hook, API, or type changes.

**Tech Stack:** React 19 + TypeScript, TailwindCSS v4 (hand-authored CSS in `index.css`, not Tailwind utility classes, for this design system), lucide-react icons, Vitest for unit tests.

## Global Constraints

- Avatar background must be `var(--accent)` (the app's existing blue accent token), not a new color — spec requirement.
- Badge view (current card grid) stays the default `viewMode`; the toggle must not change default appearance for existing users.
- Sort/view choice is plain component state — do not add persistence (localStorage, URL params, etc.) per spec's non-goals.
- Follow existing file/CSS conventions: reuse `.btn`, `.btn-ghost`, `.btn-icon`, `.toolbar`, `.role-chip`, `.cast-stat` classes rather than inventing parallel ones; only add new CSS for genuinely new layout (`.cast-list*`, `.view-toggle`).
- No React component-rendering tests exist anywhere in this codebase today (only pure-logic `.test.ts` files under `components/domain/`) — do not introduce a new testing-library convention as part of this feature; verify UI changes by running the dev server, per the approved spec's Testing section.

---

### Task 1: Flat accent avatar color

**Files:**
- Modify: `frontend/components/domain/format.ts` (delete `avatarColor`, lines 78–84)
- Modify: `frontend/components/domain/company/CastCard.tsx`
- Modify: `frontend/index.css` (`.cast-avatar` rule, around line 820)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks (this task is self-contained cleanup + a CSS-only visual change).

- [ ] **Step 1: Confirm `avatarColor` has no other callers**

Run: `grep -rn "avatarColor" frontend --include="*.tsx" --include="*.ts"`
Expected output: only the definition in `format.ts` and the one usage in `CastCard.tsx` (both about to be removed). If any other file appears, stop and re-scope this task — do not delete a function still in use elsewhere.

- [ ] **Step 2: Delete `avatarColor` from `format.ts`**

Remove this block (currently lines 78–84):

```ts
/** Deterministic, in-palette avatar background for a performer name. White text
 *  sits on it legibly in both light and dark. */
export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `oklch(56% 0.16 ${h})`;
}
```

- [ ] **Step 3: Update `CastCard.tsx` to drop the per-member inline style**

Change the top of the file from:

```tsx
import { Pencil, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import type { CompanyMember } from "~backend/scheduler/company";
import { avatarColor } from "../format";
```

to:

```tsx
import { Pencil, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import type { CompanyMember } from "~backend/scheduler/company";
```

And change:

```tsx
        <div className="cast-avatar" style={{ background: avatarColor(member.name) }}>{initials}</div>
```

to:

```tsx
        <div className="cast-avatar">{initials}</div>
```

- [ ] **Step 4: Give `.cast-avatar` a flat accent background in CSS**

In `frontend/index.css`, change:

```css
.cast-avatar {
  width: 44px; height: 44px; border-radius: 12px;
  display: grid; place-items: center;
  font: 700 15px/1 var(--font-display); color: #fff;
  letter-spacing: -0.01em; flex-shrink: 0;
}
```

to:

```css
.cast-avatar {
  width: 44px; height: 44px; border-radius: 12px;
  display: grid; place-items: center;
  font: 700 15px/1 var(--font-display); color: var(--accent-fg);
  letter-spacing: -0.01em; flex-shrink: 0;
  background: var(--accent);
}
```

- [ ] **Step 5: Verify existing unit tests still pass**

Run: `cd frontend && bunx vitest run components/domain/format.test.ts`
Expected: all tests pass (this file has no test for the deleted `avatarColor`, so nothing should fail).

- [ ] **Step 6: Typecheck**

Run: `cd frontend && bunx tsc --noEmit`
Expected: no errors referencing `avatarColor` or `CastCard.tsx`.

- [ ] **Step 7: Commit**

```bash
git add frontend/components/domain/format.ts frontend/components/domain/company/CastCard.tsx frontend/index.css
git commit -m "fix(company): use flat accent color for cast avatars instead of per-member hues"
```

---

### Task 2: `sortByName` utility (TDD)

**Files:**
- Modify: `frontend/components/domain/format.ts` (add `sortByName`)
- Modify: `frontend/components/domain/format.test.ts` (add tests)

**Interfaces:**
- Produces: `sortByName<T extends { name: string }>(items: T[], dir?: "asc" | "desc"): T[]` — a new array, case-insensitive alphabetical order by `.name`, ascending by default. Task 4 imports this by name from `@/components/domain/format`.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/components/domain/format.test.ts`, alongside the existing imports and `describe` blocks:

```ts
import { isoDate, dateRange, shortDate, splitLocation, fmtTime, sortByName } from "./format";
```

(replacing the existing `import { isoDate, dateRange, shortDate, splitLocation, fmtTime } from "./format";` line)

```ts
describe("sortByName", () => {
  const items = [{ name: "Sean" }, { name: "adam" }, { name: "Cade" }];

  it("sorts ascending by default", () => {
    expect(sortByName(items).map((i) => i.name)).toEqual(["adam", "Cade", "Sean"]);
  });

  it("sorts descending when asked", () => {
    expect(sortByName(items, "desc").map((i) => i.name)).toEqual(["Sean", "Cade", "adam"]);
  });

  it("does not mutate the input array", () => {
    const original = [...items];
    sortByName(items, "desc");
    expect(items).toEqual(original);
  });

  it("returns an empty array unchanged", () => {
    expect(sortByName([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && bunx vitest run components/domain/format.test.ts`
Expected: FAIL — `sortByName` is not exported from `./format`.

- [ ] **Step 3: Implement `sortByName`**

Add to the end of `frontend/components/domain/format.ts`:

```ts
/** Sort any named list alphabetically by `name`, case-insensitively. Returns a
 *  new array; the input is left untouched. */
export function sortByName<T extends { name: string }>(items: T[], dir: "asc" | "desc" = "asc"): T[] {
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return dir === "desc" ? sorted.reverse() : sorted;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && bunx vitest run components/domain/format.test.ts`
Expected: PASS — all `sortByName` tests plus the pre-existing tests in this file green.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/domain/format.ts frontend/components/domain/format.test.ts
git commit -m "feat(company): add sortByName utility for alphabetical cast sorting"
```

---

### Task 3: `CastListRow` component + list layout CSS

**Files:**
- Create: `frontend/components/domain/company/CastListRow.tsx`
- Modify: `frontend/index.css` (add `.cast-avatar-sm`, `.cast-list`, `.cast-list-row`, `.cast-list-name`, `.cast-list-roles`, `.cast-list-stat`, and a narrow-screen fallback)

**Interfaces:**
- Consumes: `CompanyMember` from `~backend/scheduler/company` (same type `CastCard` already uses).
- Produces: `CastListRow` component with props `{ member: CompanyMember; onEdit: (m: CompanyMember) => void; onArchiveToggle: (m: CompanyMember) => void; onDelete: (m: CompanyMember) => void }` — identical prop shape to `CastCard`, so Task 4 can pass it the same handlers. Relies on the `.cast-avatar` class from Task 4 (background now set globally, so no per-row styling needed).

- [ ] **Step 1: Create `CastListRow.tsx`**

```tsx
import { Pencil, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import type { CompanyMember } from "~backend/scheduler/company";

interface CastListRowProps {
  member: CompanyMember;
  onEdit: (m: CompanyMember) => void;
  onArchiveToggle: (m: CompanyMember) => void;
  onDelete: (m: CompanyMember) => void;
}

export function CastListRow({ member, onEdit, onArchiveToggle, onDelete }: CastListRowProps) {
  const initials = member.name.slice(0, 2).toUpperCase();
  const archived = member.status === "archived";

  return (
    <div className="cast-list-row">
      <div className="cast-avatar cast-avatar-sm">{initials}</div>

      <div className="cast-list-name">
        <div className="cast-name">{member.name}</div>
        <div className={`cast-status${archived ? " archive" : ""}`}>{archived ? "Archived" : "Active"}</div>
      </div>

      <div className="role-chips cast-list-roles">
        {member.eligibleRoles.map((r) => (
          <span key={r} className="role-chip">
            {r}
          </span>
        ))}
      </div>

      <div className="cast-list-stat">
        <b>{member.eligibleRoles.length}</b> role{member.eligibleRoles.length === 1 ? "" : "s"}
      </div>
      <div className="cast-list-stat">
        <b>{member.gender === "female" ? "F" : "M"}</b> gender
      </div>

      <div className="row" style={{ gap: 6 }}>
        <button className="btn btn-ghost btn-sm btn-icon" title="Edit" onClick={() => onEdit(member)}>
          <Pencil />
        </button>
        <button
          className="btn btn-ghost btn-sm btn-icon"
          title={archived ? "Reactivate" : "Archive"}
          onClick={() => onArchiveToggle(member)}
        >
          {archived ? <ArchiveRestore /> : <Archive />}
        </button>
        <button className="btn btn-danger btn-sm btn-icon" title="Delete" onClick={() => onDelete(member)}>
          <Trash2 />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add list layout CSS**

In `frontend/index.css`, immediately after the existing `.cast-stats`/`.cast-stat` rules (around line 838, right before the `/* role eligibility matrix */` comment), add:

```css
.cast-avatar-sm { width: 36px; height: 36px; border-radius: 10px; font-size: 13px; }

.cast-list { display: flex; flex-direction: column; gap: 8px; }
.cast-list-row {
  display: grid;
  grid-template-columns: auto 1fr auto auto auto auto;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-1);
}
.cast-list-name { min-width: 0; }
.cast-list-roles { min-width: 0; }
.cast-list-stat { font: 500 12px/1 var(--font-body); color: var(--muted); white-space: nowrap; }
.cast-list-stat b { font: 600 14px/1 var(--font-display); color: var(--fg); margin-right: 4px; }
```

Then, in the existing `@media (max-width: 620px)` block (around line 1077), add a fallback so rows reflow instead of overflowing on narrow screens:

```css
@media (max-width: 620px) {
  .stats { grid-template-columns: 1fr 1fr; }
  .sched-grid, .cast-grid { grid-template-columns: 1fr; }
  .section-head { flex-direction: column; align-items: flex-start; }
  .cast-list-row { display: flex; flex-wrap: wrap; }
}
```

(only the new `.cast-list-row` line is added; the rest of the block is unchanged)

- [ ] **Step 3: Typecheck**

Run: `cd frontend && bunx tsc --noEmit`
Expected: no errors. `CastListRow` is not imported anywhere yet, so this only confirms the new file itself compiles cleanly.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/domain/company/CastListRow.tsx frontend/index.css
git commit -m "feat(company): add CastListRow component and list layout CSS"
```

---

### Task 4: Wire up view toggle and sort control in `CompanyScreen`

**Files:**
- Modify: `frontend/screens/CompanyScreen.tsx`
- Modify: `frontend/index.css` (add `.view-toggle`)

**Interfaces:**
- Consumes: `sortByName` from `@/components/domain/format` (Task 2); `CastListRow` from `@/components/domain/company/CastListRow` (Task 3); `CastCard` (already imported).
- Produces: nothing consumed by later tasks — this is the final integration task.

- [ ] **Step 1: Add new imports**

In `frontend/screens/CompanyScreen.tsx`, change:

```tsx
import { useState } from "react";
import { Plus, Users, Drama, Layers, Venus } from "lucide-react";
```

to:

```tsx
import { useState } from "react";
import { Plus, Users, Drama, Layers, Venus, LayoutGrid, List, ArrowDownAZ, ArrowDownZA } from "lucide-react";
```

And add, after the existing `CastCard` import:

```tsx
import { CastListRow } from "@/components/domain/company/CastListRow";
```

And add, after the `useCompany` import:

```tsx
import { sortByName } from "@/components/domain/format";
```

- [ ] **Step 2: Add view/sort state and derived sorted lists**

In the `CompanyScreen` function body, change:

```tsx
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CompanyMember | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanyMember | null>(null);
```

to:

```tsx
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CompanyMember | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanyMember | null>(null);
  const [viewMode, setViewMode] = useState<"badge" | "list">("badge");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
```

And change:

```tsx
  const multiRole = currentCompany.filter((m) => m.eligibleRoles.length > 1).length;
  const femaleCount = currentCompany.filter((m) => m.gender === "female").length;
```

to:

```tsx
  const multiRole = currentCompany.filter((m) => m.eligibleRoles.length > 1).length;
  const femaleCount = currentCompany.filter((m) => m.gender === "female").length;
  const sortedActive = sortByName(currentCompany, sortDir);
  const sortedArchive = sortByName(archive, sortDir);
```

- [ ] **Step 3: Add the toolbar and branch rendering**

Change the Cast section (from `<section className="mt-32">` through its closing `</section>`, currently lines 72–127) from:

```tsx
      <section className="mt-32">
        <div className="section-head">
          <h2 className="h1">Cast</h2>
          <div className="kicker">Edit eligibility, archive, or remove</div>
        </div>

        {isLoading ? (
          <div className="card empty">
            <p className="text-muted">Loading company…</p>
          </div>
        ) : error ? (
          <div className="card empty">
            <div className="h3">Couldn't load the company</div>
            <p className="text-muted">{error.message}</p>
          </div>
        ) : currentCompany.length === 0 ? (
          <div className="card empty">
            <div className="h2">No cast yet</div>
            <button className="btn btn-primary btn-sm" onClick={openAdd}>
              <Plus /> Add the first cast member
            </button>
          </div>
        ) : (
          <div className="cast-grid">
            {currentCompany.map((m) => (
              <CastCard
                key={m.id}
                member={m}
                onEdit={openEdit}
                onArchiveToggle={(mem) => setStatus.mutate({ id: mem.id, status: "archived" })}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}

        {archive.length > 0 ? (
          <>
            <div className="section-head mt-32">
              <h2 className="h2">Archived</h2>
              <div className="kicker">{archive.length} archived</div>
            </div>
            <div className="cast-grid">
              {archive.map((m) => (
                <CastCard
                  key={m.id}
                  member={m}
                  onEdit={openEdit}
                  onArchiveToggle={(mem) => setStatus.mutate({ id: mem.id, status: "active" })}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          </>
        ) : null}
      </section>
```

to:

```tsx
      <section className="mt-32">
        <div className="section-head">
          <div>
            <h2 className="h1">Cast</h2>
            <div className="kicker">Edit eligibility, archive, or remove</div>
          </div>
          <div className="toolbar">
            <button
              className="btn btn-ghost btn-sm"
              title={sortDir === "asc" ? "Sorted A to Z — click for Z to A" : "Sorted Z to A — click for A to Z"}
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            >
              {sortDir === "asc" ? <ArrowDownAZ /> : <ArrowDownZA />}
              Name
            </button>
            <div className="view-toggle">
              <button
                className={`btn btn-ghost btn-sm btn-icon${viewMode === "badge" ? " active" : ""}`}
                title="Badge view"
                onClick={() => setViewMode("badge")}
              >
                <LayoutGrid />
              </button>
              <button
                className={`btn btn-ghost btn-sm btn-icon${viewMode === "list" ? " active" : ""}`}
                title="List view"
                onClick={() => setViewMode("list")}
              >
                <List />
              </button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="card empty">
            <p className="text-muted">Loading company…</p>
          </div>
        ) : error ? (
          <div className="card empty">
            <div className="h3">Couldn't load the company</div>
            <p className="text-muted">{error.message}</p>
          </div>
        ) : currentCompany.length === 0 ? (
          <div className="card empty">
            <div className="h2">No cast yet</div>
            <button className="btn btn-primary btn-sm" onClick={openAdd}>
              <Plus /> Add the first cast member
            </button>
          </div>
        ) : viewMode === "list" ? (
          <div className="cast-list">
            {sortedActive.map((m) => (
              <CastListRow
                key={m.id}
                member={m}
                onEdit={openEdit}
                onArchiveToggle={(mem) => setStatus.mutate({ id: mem.id, status: "archived" })}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        ) : (
          <div className="cast-grid">
            {sortedActive.map((m) => (
              <CastCard
                key={m.id}
                member={m}
                onEdit={openEdit}
                onArchiveToggle={(mem) => setStatus.mutate({ id: mem.id, status: "archived" })}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}

        {archive.length > 0 ? (
          <>
            <div className="section-head mt-32">
              <h2 className="h2">Archived</h2>
              <div className="kicker">{archive.length} archived</div>
            </div>
            {viewMode === "list" ? (
              <div className="cast-list">
                {sortedArchive.map((m) => (
                  <CastListRow
                    key={m.id}
                    member={m}
                    onEdit={openEdit}
                    onArchiveToggle={(mem) => setStatus.mutate({ id: mem.id, status: "active" })}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
            ) : (
              <div className="cast-grid">
                {sortedArchive.map((m) => (
                  <CastCard
                    key={m.id}
                    member={m}
                    onEdit={openEdit}
                    onArchiveToggle={(mem) => setStatus.mutate({ id: mem.id, status: "active" })}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
            )}
          </>
        ) : null}
      </section>
```

- [ ] **Step 4: Add `.view-toggle` CSS**

In `frontend/index.css`, immediately after the `.toolbar`/`.toolbar .spacer` rules (around line 459), add:

```css
.view-toggle { display: flex; border: 1px solid var(--border-2); border-radius: 8px; overflow: hidden; }
.view-toggle .btn { border-radius: 0; border: none; border-left: 1px solid var(--border-2); }
.view-toggle .btn:first-child { border-left: none; }
.view-toggle .btn.active { background: var(--accent); color: var(--accent-fg); }
```

- [ ] **Step 5: Typecheck**

Run: `cd frontend && bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Run the full unit test suite**

Run: `cd frontend && bunx vitest run`
Expected: all existing tests still pass (this task touches no tested logic directly, but confirms nothing else broke).

- [ ] **Step 7: Manual verification in the browser**

Run: `cd frontend && bun run dev` (and, in a second terminal, `cd backend && encore run` if the company list needs live data — see the project's local-dev setup notes if the page shows no data).

Open the Cast page and confirm:
1. Every avatar badge (active and archived) is the same blue, not a rainbow of colors.
2. Clicking the list-icon button switches both the Active and Archived sections to the compact row layout; clicking the grid-icon button switches back to cards. The clicked button is visually highlighted (blue background) as the active one.
3. Clicking the sort button reorders both the Active and Archived sections alphabetically; clicking it again reverses the order. The icon changes between the two arrow states.
4. Edit / Archive-Reactivate / Delete buttons still work correctly from both the card and the list row.
5. Resize the browser to a narrow (mobile) width and confirm the list rows reflow instead of clipping content.

Expected: all five checks pass. If any fail, fix before proceeding — do not commit broken UI.

- [ ] **Step 8: Commit**

```bash
git add frontend/screens/CompanyScreen.tsx frontend/index.css
git commit -m "feat(company): add badge/list view toggle and alphabetical sort to Cast page"
```

---

## Self-Review Notes

- **Spec coverage:** flat accent avatar color → Task 1; badge/list view toggle → Tasks 3–4; alphabetical sort with A→Z/Z→A toggle → Tasks 2 & 4; both views/sections respect the sort and view choice → Task 4 Step 3 (both Active and Archived branches).
- **Type consistency:** `CastListRow` props (`member`, `onEdit`, `onArchiveToggle`, `onDelete`) match `CastCard`'s existing prop shape exactly, so Task 4 passes the same handler references to both without adapters. `sortByName`'s signature (`items: T[], dir?: "asc" | "desc"`) is used identically in Task 4 for both `currentCompany` and `archive`.
- **No placeholders:** every step above has literal code, exact file paths, and runnable commands with stated expected output.
