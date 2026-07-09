interface EmptyDayCellProps {
  /** Rows this cell swallows: every body row beneath the header. */
  rowSpan: number;
}

/**
 * A date the week has emptied out. It keeps its column so the week still reads
 * as seven days and the day can be put back where it was, rather than the grid
 * silently closing up around it.
 */
export function EmptyDayCell({ rowSpan }: EmptyDayCellProps) {
  return (
    <td className="cell-empty" rowSpan={rowSpan}>
      <div className="empty-box">
        <span className="empty-label">No show</span>
      </div>
    </td>
  );
}
