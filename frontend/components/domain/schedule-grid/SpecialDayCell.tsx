import { Plane, CalendarOff } from "lucide-react";
import type { DayStatus } from "~backend/scheduler/types";

interface SpecialDayCellProps {
  status: Exclude<DayStatus, "show">;
  /** Rows this cell swallows: every body row beneath the header. */
  rowSpan: number;
}

/**
 * A travel or day-off column has no cast, so its whole body collapses into one
 * merged cell. The label runs vertically, reading bottom-to-top.
 */
export function SpecialDayCell({ status, rowSpan }: SpecialDayCellProps) {
  const travel = status === "travel";
  return (
    <td className="cell-special" rowSpan={rowSpan}>
      <div className={`special-box ${travel ? "special-travel" : "special-off"}`}>
        {travel ? <Plane /> : <CalendarOff />}
        <span className="special-label">{travel ? "Travel Day" : "Day Off"}</span>
      </div>
    </td>
  );
}
