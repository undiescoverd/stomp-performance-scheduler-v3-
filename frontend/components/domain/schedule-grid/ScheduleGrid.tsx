import { CircleSlash } from "lucide-react";
import type { Show, Assignment, CastMember, Role } from "~backend/scheduler/types";
import { GridHead } from "./GridHead";
import { AssignmentCell } from "./AssignmentCell";
import { SpecialDayCell } from "./SpecialDayCell";
import { EmptyDayCell } from "./EmptyDayCell";
import { assignedPerformer, showConflicts, offPerformers, isRedDayFor, companyRedDate } from "./logic";
import { isoDate, splitLocation, dowShort, shortDate } from "../format";
import { columnsForWeek, weekStartOf } from "../week";

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
  onShowChange: (showId: string, field: "time" | "callTime", value: string) => boolean;
  onAddShowToDate: (date: string) => void;
  onRestoreDate: (date: string) => void;
  onSetDestination: (travelShowId: string, city: string) => void;
  onSetCompanyRedDay: (showId: string, on: boolean) => void;
  /** Template-builder context: render the day/status/time header only — no cast
   *  role rows, OFF rows or RED-day legend (there is no cast to place). */
  shapeOnly?: boolean;
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
  onShowChange,
  onAddShowToDate,
  onRestoreDate,
  onSetDestination,
  onSetCompanyRedDay,
  shapeOnly,
}: ScheduleGridProps) {
  const showShows = shows.filter((s) => s.status === "show");
  const assignedShowIds = new Set(assignments.filter((a) => a.role !== "OFF").map((a) => a.showId));
  const conflictsByShow = new Map(shows.map((s) => [s.id, showConflicts(assignments, s.id)]));
  const hasAssignments = assignments.length > 0;
  const maxOff = hasAssignments
    ? Math.max(0, ...showShows.map((s) => offPerformers(assignments, castMembers, s.id).length))
    : 0;
  const city = splitLocation(location)[0] || "—";

  // While a company RED day exists it IS everyone's RED day, so the per-performer
  // toggle has nothing left to say: every OFF chip reads as RED and the chips go
  // inert until the day off is removed.
  const companyRed = companyRedDate(shows);
  const companyRedLabel = companyRed ? `${dowShort(companyRed)} ${shortDate(companyRed, "short")}` : "";
  const companyRedTitle = companyRed
    ? `Company RED day on ${companyRedLabel} covers the whole company this week.`
    : "";

  // Columns, not shows: a date the week has emptied out still gets one, so the
  // week always reads Monday to Sunday and a removed day can be put back.
  const weekStart = weekStartOf(shows);
  const columns = weekStart ? columnsForWeek(shows, weekStart) : [];

  // A travel, day-off or empty column is one merged cell over the whole body:
  // every role row, plus the divider and OFF rows when they're showing.
  const hasOffRows = hasAssignments && maxOff > 0;
  const specialRowSpan = roles.length + (hasOffRows ? 1 + maxOff : 0);

  return (
    <div className="grid-wrap">
      <div className="grid-scroll">
        <table className="grid-table">
          {/* One <col> per column: a city header spans several of them, and under
              auto layout a wide spanning cell distorts the columns beneath it. */}
          <colgroup>
            <col className="col-label" />
            {columns.map((c) => (
              <col key={c.show?.id ?? `empty-${c.date}`} />
            ))}
          </colgroup>
          <GridHead
            columns={columns}
            assignedShowIds={assignedShowIds}
            location={city}
            week={week}
            onStatusChange={onShowStatusChange}
            onRemove={onRemoveShow}
            onShowChange={onShowChange}
            onAddShowToDate={onAddShowToDate}
            onRestoreDate={onRestoreDate}
            onSetDestination={onSetDestination}
            onSetCompanyRedDay={onSetCompanyRedDay}
          />
          <tbody>
            <tr className="grid-divider">
              <td />
              {columns.map((c) => (
                <td key={c.show?.id ?? `empty-${c.date}`} />
              ))}
            </tr>

            {!shapeOnly && roles.map((role, rowIndex) => {
              const elig = castMembers.filter((m) => m.eligibleRoles.includes(role));
              return (
                <tr key={role}>
                  <td className="role-label">
                    {role}
                    <span className="role-elig">{elig.length} eligible</span>
                  </td>
                  {columns.map((column) => {
                    const key = column.show?.id ?? `empty-${column.date}`;

                    // The merged cell is emitted once and spans the rows below.
                    if (!column.show) {
                      return rowIndex === 0 ? <EmptyDayCell key={key} rowSpan={specialRowSpan} /> : null;
                    }
                    if (column.show.status !== "show") {
                      return rowIndex === 0 ? (
                        <SpecialDayCell
                          key={key}
                          status={column.show.status}
                          rowSpan={specialRowSpan}
                          isCompanyRedDay={column.show.isCompanyRedDay}
                        />
                      ) : null;
                    }

                    const show = column.show;
                    const cur = assignedPerformer(assignments, show.id, role);
                    const isConf = !!cur && conflictsByShow.get(show.id)!.has(cur);
                    return (
                      <AssignmentCell
                        key={key}
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

            {!shapeOnly && hasAssignments && maxOff > 0 ? (
              <>
                <tr className="grid-divider">
                  <td />
                  {columns.map((c) => (c.show?.status === "show" ? <td key={c.show.id} /> : null))}
                </tr>
                {Array.from({ length: maxOff }).map((_, i) => (
                  <tr key={`off-${i}`}>
                    <td className="off-label">{i === 0 ? "OFF" : ""}</td>
                    {columns.map((column) => {
                      const show = column.show;
                      if (show?.status !== "show") return null;
                      const offs = offPerformers(assignments, castMembers, show.id);
                      const p = offs[i];
                      if (!p) return <td key={show.id} className="off-cell" />;
                      const date = isoDate(show.date);
                      const red = isRedDayFor(assignments, shows, p, date);
                      return (
                        <td key={show.id} className="off-cell">
                          <button
                            className={`off-chip${red ? " red" : ""}`}
                            disabled={companyRed !== null}
                            onClick={() => onToggleRedDay(date, p)}
                            title={
                              companyRed
                                ? companyRedTitle
                                : red
                                  ? "RED day — click to make regular OFF"
                                  : "Regular OFF — click to set RED day"
                            }
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
      {shapeOnly ? null : (
        <div className="red-legend">
          <CircleSlash />
          <span>
            <b>RED Day</b> — performer is off the entire day and can't be called for cover.{" "}
            {companyRed ? (
              <>
                The company RED day on {companyRedLabel} covers everyone this week, so individual RED days are paused.
                Remove the day off to bring them back.
              </>
            ) : (
              <>Click any OFF performer to toggle RED-day status.</>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
