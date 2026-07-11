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
