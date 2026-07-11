import { Plane, CalendarOff } from "lucide-react";
import type { DayStatus } from "~backend/scheduler/types";

interface SpecialDayCellProps {
  status: Exclude<DayStatus, "show">;
  /** Rows this cell swallows: every body row beneath the header. */
  rowSpan: number;
  /** This day off carries the whole company's RED day. Ignored for travel. */
  isCompanyRedDay?: boolean;
}

/**
 * A travel or day-off column has no cast, so its whole body collapses into one
 * merged cell. The label runs vertically, reading bottom-to-top. A day off
 * nominated as the company RED day reads in red, matching the printed call
 * sheet convention (the day-off label is red, the travel label is black).
 */
export function SpecialDayCell({ status, rowSpan, isCompanyRedDay }: SpecialDayCellProps) {
  const travel = status === "travel";
  const red = !travel && isCompanyRedDay === true;
  return (
    <td className="cell-special" rowSpan={rowSpan}>
      <div className={`special-box ${travel ? "special-travel" : red ? "special-red" : "special-off"}`}>
        {travel ? <Plane /> : <CalendarOff />}
        <span className="special-label">{travel ? "Travel Day" : red ? "Company RED Day" : "Day Off"}</span>
      </div>
    </td>
  );
}
