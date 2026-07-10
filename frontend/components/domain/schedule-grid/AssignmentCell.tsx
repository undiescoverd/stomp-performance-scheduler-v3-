import type { CastMember, Role } from "~backend/scheduler/types";

interface AssignmentCellProps {
  showId: string;
  role: Role;
  eligible: CastMember[];
  value: string;
  isConflict: boolean;
  onChange: (showId: string, role: Role, performer: string) => void;
}

/**
 * Native select scoped to eligible performers — this is what structurally
 * prevents role-eligibility / gender violations from ever entering the grid.
 */
export function AssignmentCell({ showId, role, eligible, value, isConflict, onChange }: AssignmentCellProps) {
  return (
    <td className="cell-assign">
      <select
        className={`assign-select${value ? " filled" : ""}${isConflict ? " conflict" : ""}`}
        value={value}
        aria-label={`${role} assignment`}
        onChange={(e) => onChange(showId, role, e.target.value)}
      >
        <option value="">—</option>
        {eligible.map((m) => (
          <option key={m.name} value={m.name}>
            {m.name}
          </option>
        ))}
      </select>
    </td>
  );
}
