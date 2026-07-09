import { Plane, CalendarOff } from "lucide-react";
import type { DayStatus } from "~backend/scheduler/types";

/** Travel / day-off cell content spanning a role row for a non-show column. */
export function SpecialDayCell({ status }: { status: Exclude<DayStatus, "show"> }) {
  return (
    <td className="cell-special">
      {status === "travel" ? (
        <div className="special-box special-travel">
          <Plane />
          TRAVEL
        </div>
      ) : (
        <div className="special-box special-off">
          <CalendarOff />
          DAY OFF
        </div>
      )}
    </td>
  );
}
