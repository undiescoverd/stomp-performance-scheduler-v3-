import { Link } from "react-router-dom";
import {
  CalendarDays,
  PlayCircle,
  Users,
  ShieldCheck,
  Plus,
  CalendarPlus,
  ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { StatCard } from "@/components/domain/StatCard";
import { ScheduleCard } from "@/components/domain/ScheduleCard";
import { SchedulePill } from "@/components/domain/SchedulePill";
import { WeekStrip } from "@/components/domain/WeekStrip";
import { splitLocation, dateRange, weekLabel } from "@/components/domain/format";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { FEATURE_FLAGS } from "@/config/features";

export function DashboardScreen() {
  const { schedules, spotlight, stats, isLoading, error, refetch } = useDashboardStats();

  return (
    <>
      <PageHeader
        eyebrow="2025 Season"
        title="Performance Schedules"
        lead="Manage STOMP weekly cast schedules with intelligent role assignment, RED-day fairness, and conflict validation across every venue."
        actions={
          <>
            {FEATURE_FLAGS.MULTI_COUNTRY_TOURS ? (
              <Link className="btn btn-ghost btn-sm" to="/tours">View Tours</Link>
            ) : null}
            <Link className="btn btn-ghost btn-sm" to="/company">Manage Company</Link>
          </>
        }
      />

      <section className="stats mt-24">
        <StatCard
          label="Active Schedules"
          value={stats.activeSchedules}
          tone="accent"
          icon={<CalendarDays />}
          delta={`${stats.venues} ${stats.venues === 1 ? "venue" : "venues"}`}
        />
        <StatCard
          label="Total Shows"
          value={stats.totalShows}
          tone="green"
          icon={<PlayCircle />}
          delta={`across ${stats.venues} ${stats.venues === 1 ? "venue" : "venues"}`}
        />
        <StatCard
          label="Active Cast"
          value={stats.activeCast || "—"}
          tone="pink"
          icon={<Users />}
          delta={`${stats.roles} roles · ${stats.activeCast} performers`}
        />
        <StatCard
          label="RED-day Fairness"
          value={stats.fairness && stats.fairness.hasAssignments ? `${stats.fairness.pct}%` : "—"}
          tone="red"
          icon={<ShieldCheck />}
          deltaKind={stats.fairness && stats.fairness.pct === 100 ? "up" : "flat"}
          delta={
            stats.fairness && stats.fairness.hasAssignments
              ? `${stats.fairness.covered} / ${stats.fairness.target} covered`
              : "assign in editor"
          }
        />
      </section>

      {spotlight ? (
        <section className="mt-32">
          <div className="section-head">
            <div>
              <div className="kicker">Current week</div>
              <h2 className="h1 mt-8">
                {splitLocation(spotlight.location)[0]} — {weekLabel(spotlight.week)}
              </h2>
            </div>
            <Link className="btn btn-primary btn-sm" to={`/schedule/${spotlight.id}`}>
              Open Editor <ArrowRight />
            </Link>
          </div>
          <div className="card card-pad">
            <div className="between mb-16">
              <div>
                <div className="h3">{splitLocation(spotlight.location)[1] || spotlight.location}</div>
                <p className="text-muted mt-8" style={{ fontSize: 13 }}>
                  {spotlight.shows.filter((s) => s.status === "show").length} shows ·{" "}
                  {dateRange(spotlight.shows)}
                </p>
              </div>
              <div className="legend-row">
                <SchedulePill variant="show" dot>
                  {spotlight.shows.filter((s) => s.status === "show").length} Show
                </SchedulePill>
                {stats.fairness && stats.fairness.hasAssignments ? (
                  <SchedulePill variant="red" dot>
                    {stats.fairness.covered} RED days
                  </SchedulePill>
                ) : null}
              </div>
            </div>
            <WeekStrip shows={spotlight.shows} />
          </div>
        </section>
      ) : null}

      <section className="mt-32">
        <div className="section-head">
          <div>
            <h2 className="h1">All Schedules</h2>
            <p className="lead mt-8">Every venue week in the current season.</p>
          </div>
          <div className="row-wrap">
            <Link className="btn btn-primary btn-sm" to="/schedule/new">
              <Plus /> New Schedule
            </Link>
          </div>
        </div>

        {isLoading ? (
          <div className="card empty">
            <p className="text-muted">Loading schedules…</p>
          </div>
        ) : error ? (
          <div className="card empty">
            <div className="h3">Couldn't load schedules</div>
            <p className="text-muted">{error.message}</p>
            <button className="btn btn-ghost btn-sm" onClick={() => refetch()}>Retry</button>
          </div>
        ) : schedules.length === 0 ? (
          <div className="card empty">
            <CalendarPlus />
            <div className="h2">No schedules yet</div>
            <p className="text-muted" style={{ maxWidth: "42ch" }}>
              Create your first STOMP performance schedule to start assigning cast and planning shows.
            </p>
            <Link className="btn btn-primary btn-sm" to="/schedule/new">
              <Plus /> Create first schedule
            </Link>
          </div>
        ) : (
          <div className="sched-grid">
            {schedules.map((s) => (
              <ScheduleCard key={s.id} schedule={s} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
