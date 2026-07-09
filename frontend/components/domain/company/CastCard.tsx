import { Pencil, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { FEMALE_ONLY_ROLES } from "~backend/scheduler/types";
import type { CompanyMember } from "~backend/scheduler/company";
import { avatarColor } from "../format";

interface CastCardProps {
  member: CompanyMember;
  onEdit: (m: CompanyMember) => void;
  onArchiveToggle: (m: CompanyMember) => void;
  onDelete: (m: CompanyMember) => void;
}

export function CastCard({ member, onEdit, onArchiveToggle, onDelete }: CastCardProps) {
  const initials = member.name.slice(0, 2).toUpperCase();
  const archived = member.status === "archived";

  return (
    <div className="cast-card">
      <div className="cast-top">
        <div className="cast-avatar" style={{ background: avatarColor(member.name) }}>{initials}</div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="cast-name">{member.name}</div>
          <div className={`cast-status${archived ? " archive" : ""}`}>{archived ? "Archived" : "Active"}</div>
        </div>
      </div>

      <div className="role-chips">
        {member.eligibleRoles.map((r) => (
          <span key={r} className={`role-chip${FEMALE_ONLY_ROLES.includes(r) ? " female" : ""}`}>
            {r}
          </span>
        ))}
      </div>

      <div className="cast-stats">
        <div className="cast-stat">
          <b>{member.eligibleRoles.length}</b>
          role{member.eligibleRoles.length === 1 ? "" : "s"}
        </div>
        <div className="cast-stat">
          <b>{member.gender === "female" ? "F" : "M"}</b>
          gender
        </div>
        <div className="row" style={{ marginLeft: "auto", gap: 6 }}>
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
    </div>
  );
}
