import { FEMALE_ONLY_ROLES } from "~backend/scheduler/types";
import type { Role } from "~backend/scheduler/types";
import type { CompanyMember } from "~backend/scheduler/company";

interface EligibilityMatrixProps {
  members: CompanyMember[];
  roles: Role[];
}

export function EligibilityMatrix({ members, roles }: EligibilityMatrixProps) {
  return (
    <div className="grid-scroll card">
      <table className="matrix">
        <thead>
          <tr>
            <th>Performer</th>
            {roles.map((r) => (
              <th key={r} className={FEMALE_ONLY_ROLES.includes(r) ? "female-role" : ""}>
                {r}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <th>{m.name}</th>
              {roles.map((r) => {
                const yes = m.eligibleRoles.includes(r);
                return (
                  <td key={r} className={yes ? "yes" : "no"}>
                    {yes ? "✓" : "·"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
