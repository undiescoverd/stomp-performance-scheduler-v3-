# Cast page: single-color badges + badge/list view + alphabetical sort

## Problem

On the Company/Cast screen (`frontend/screens/CompanyScreen.tsx`), each cast card's
avatar badge (`.cast-avatar` in `CastCard.tsx`) is colored via `avatarColor(name)`
(`frontend/components/domain/format.ts`), a hash-of-name → distinct-hue `oklch(...)`.
Across 12+ performers this produces a visually noisy rainbow of avatar colors.

There is also only one way to view the cast list — a 3-column card grid
(`.cast-grid` of `CastCard`s) — and no sorting; members render in whatever order
the API/hook returns them.

## Goals

1. Avatar badges render in one consistent color: the app's existing accent blue
   (`var(--accent)`, the same token used for primary buttons and active nav state).
2. Users can switch between the current card layout ("badge view") and a new
   compact "list view", both showing the same underlying data.
3. Both views can be sorted alphabetically by name, toggling A→Z / Z→A.

## Non-goals

- Persisting view mode / sort choice across sessions (plain component state is
  sufficient; can be added later if requested).
- Any change to card/list *content* beyond layout — same fields, same actions.
- Sorting by any field other than name.

## Design

### 1. Flat accent avatar color

- Delete `avatarColor()` from `frontend/components/domain/format.ts` (its only
  caller is `CastCard`).
- `CastCard.tsx`: replace `style={{ background: avatarColor(member.name) }}` on
  `.cast-avatar` with a plain CSS rule `background: var(--accent)` in
  `index.css` (drop the inline style entirely).

### 2. View toggle

- New toggle control (two icon buttons, `btn-ghost`/icon-button styling
  consistent with existing action buttons) placed in the Cast section header
  in `CompanyScreen.tsx`, alongside the "Edit eligibility, archive, or remove"
  kicker.
- `CompanyScreen` holds `viewMode: "badge" | "list"` via `useState`, default
  `"badge"` (preserves current appearance for existing users).
- Rendering branches: `viewMode === "badge"` → existing `cast-grid` of
  `CastCard`; `viewMode === "list"` → new `cast-list` of `CastListRow`.
- Not persisted (resets to `"badge"` on reload/navigation).

### 3. Sort control

- A single toggle button (A→Z / Z→A) next to the view toggle, using a sort
  icon that flips or an arrow indicator for direction.
- `CompanyScreen` holds `sortDir: "asc" | "desc"` via `useState`, default
  `"asc"`.
- Applied via `[...list].sort((a, b) => a.name.localeCompare(b.name))`
  (reversed when `sortDir === "desc"`) to the active list and the archived
  list independently — each section keeps sorting itself, sections stay
  separate as they are today.
- One shared control drives both sections (not a separate control per
  section).

### 4. List view component

- New `frontend/components/domain/company/CastListRow.tsx`, sibling to
  `CastCard.tsx`, same props shape (`member`, `onEdit`, `onArchiveToggle`,
  `onDelete`).
- Shows the same fields as `CastCard` — avatar, name, status
  (active/archived), role chips, role count, gender, and the three action
  buttons (edit/archive/delete) — laid out as a horizontal row instead of a
  card.
- New CSS: `.cast-list` (row container) and `.cast-list-row` (per-row layout)
  in `index.css`, following the existing table/row patterns already used
  elsewhere in the app (e.g. `.week-row`) rather than inventing a new visual
  language.

### 5. Data flow

- No hook or API changes. `useCompany()` continues to return `currentCompany`
  (active) and `archive` unchanged.
- `CompanyScreen` derives `sortedActive` / `sortedArchive` from `sortDir`
  before rendering, and picks `CastCard` vs `CastListRow` based on
  `viewMode`. Both are presentational components driven by the same sorted
  array and the same handlers (`openEdit`, `setStatus.mutate`,
  `setDeleteTarget`) already wired up today.

## Testing

- No existing test file directly covers `CastCard`/`CompanyScreen` rendering
  (verify before implementing); if component tests exist for this screen,
  extend them to cover: sort toggling reorders both sections, view toggle
  swaps card/list rendering without changing selected data, and avatar color
  is no longer per-member (single computed style / no inline `background`
  from `avatarColor`).
- Manual verification: run the frontend dev server, visit `/company`, confirm
  badges are uniformly blue, toggle badge/list view, toggle sort direction.
