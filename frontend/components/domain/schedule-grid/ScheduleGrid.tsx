import { CircleSlash } from "lucide-react";
import type { Show, Assignment, CastMember, Role } from "~backend/scheduler/types";
import { GridHead } from "./GridHead";
import { AssignmentCell } from "./AssignmentCell";
import { SpecialDayCell } from "./SpecialDayCell";
import { assignedPerformer, showConflicts, offPerformers, isRedDayFor } from "./logic";
import { isoDate, splitLocation } from "../format";

interface ScheduleGridProps {
  shows: Show[];
  assignments: Assignment[];
  castMembers: CastMember[];
  roles: Role[];
  location: string;
  week: string;
  onAssignmentChange: (showId: string, role: Role, performer: string) => void;
  onToggleRedDay: (date: string, performer: string) => void;
  onShowStatusChange: (showId: string, status: Show["status"]) => void;
  onRemoveShow: (showId: string) => void;
}

export function ScheduleGrid({
  shows,
  assignments,
  castMembers,
  roles,
  location,
  week,
  onAssignmentChange,
  onToggleRedDay,
  onShowStatusChange,
  onRemoveShow,
}: ScheduleGridProps) {
  const showShows = shows.filter((s) => s.status === "show");
  const assignedShowIds = new Set(assignments.filter((a) => a.role !== "OFF").map((a) => a.showId));
  const conflictsByShow = new Map(shows.map((s) => [s.id, showConflicts(assignments, s.id)]));
  const hasAssignments = assignments.length > 0;
  const maxOff = hasAssignments
    ? Math.max(0, ...showShows.map((s) => offPerformers(assignments, castMembers, s.id).length))
    : 0;
  const city = splitLocation(location)[0] || "—";

  // A travel / day-off column is one merged cell over the whole body: every role
  // row, plus the divider and OFF rows when they're showing.
  const hasOffRows = hasAssignments && maxOff > 0;
  const specialRowSpan = roles.length + (hasOffRows ? 1 + maxOff : 0);

  return (
    <div className="grid-wrap">
      <div className="grid-title">
        STOMP <span className="sep">·</span> {city} <span className="sep">·</span> Week {week || "—"}
      </div>
      <div className="grid-scroll">
        <table className="grid-table">
          <GridHead
            shows={shows}
            assignedShowIds={assignedShowIds}
            onStatusChange={onShowStatusChange}
            onRemove={onRemoveShow}
          />
          <tbody>
            <tr className="grid-divider">
              <td />
              {shows.map((s) => (
                <td key={s.id} />
              ))}
            </tr>

            {roles.map((role, rowIndex) => {
              const elig = castMembers.filter((m) => m.eligibleRoles.includes(role));
              return (
                <tr key={role}>
                  <td className="role-label">
                    {role}
                    <span className="role-elig">{elig.length} eligible</span>
                  </td>
                  {shows.map((show) => {
                    if (show.status !== "show") {
                      // The merged cell is emitted once and spans the rows below.
                      return rowIndex === 0 ? (
                        <SpecialDayCell key={show.id} status={show.status} rowSpan={specialRowSpan} />
                      ) : null;
                    }
                    const cur = assignedPerformer(assignments, show.id, role);
                    const isConf = !!cur && conflictsByShow.get(show.id)!.has(cur);
                    return (
                      <AssignmentCell
                        key={show.id}
                        showId={show.id}
                        role={role}
                        eligible={elig}
                        value={cur}
                        isConflict={isConf}
                        onChange={onAssignmentChange}
                      />
                    );
                  })}
                </tr>
              );
            })}

            {hasAssignments && maxOff > 0 ? (
              <>
                <tr className="grid-divider">
                  <td />
                  {shows.map((s) => (s.status === "show" ? <td key={s.id} /> : null))}
                </tr>
                {Array.from({ length: maxOff }).map((_, i) => (
                  <tr key={`off-${i}`}>
                    <td className="off-label">{i === 0 ? "OFF" : ""}</td>
                    {shows.map((show) => {
                      if (show.status !== "show") return null;
                      const offs = offPerformers(assignments, castMembers, show.id);
                      const p = offs[i];
                      if (!p) return <td key={show.id} className="off-cell" />;
                      const date = isoDate(show.date);
                      const red = isRedDayFor(assignments, shows, p, date);
                      return (
                        <td key={show.id} className="off-cell">
                          <button
                            className={`off-chip${red ? " red" : ""}`}
                            onClick={() => onToggleRedDay(date, p)}
                            title={red ? "RED day — click to make regular OFF" : "Regular OFF — click to set RED day"}
                          >
                            {red ? <span className="red-dot" /> : null}
                            {p}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="red-legend">
        <CircleSlash />
        <span>
          <b>RED Day</b> — performer is off the entire day and can't be called for cover. Click any OFF performer to
          toggle RED-day status.
        </span>
      </div>
    </div>
  );
}
