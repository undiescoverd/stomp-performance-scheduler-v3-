import { weekStatus, type TourWeekView } from "@/hooks/useTours";

/** The signature route flourish: a stop per week, dot colored by status. */
export function RouteTimeline({ weeks }: { weeks: TourWeekView[] }) {
  return (
    <div className="tour-route">
      <div className="route-track" />
      <div className="route-stops">
        {weeks.map((w, i) => (
          <div key={w.id} className={`stop st-${weekStatus(w)}`} title={`${w.locationCity} · week ${i + 1}`}>
            <div className="stop-dot" />
            <div className="stop-city">{w.locationCity}</div>
            <div className="stop-wk">W{i + 1}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
