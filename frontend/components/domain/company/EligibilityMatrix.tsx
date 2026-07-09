import { Check } from "lucide-react";
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
              <th key={r}>{r}</th>
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
                    {yes ? (
                      <span className="elig-badge">
                        <Check size={14} strokeWidth={3} />
                      </span>
                    ) : (
                      <span className="elig-dash" aria-hidden="true">
                        &ndash;
                      </span>
                    )}
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
