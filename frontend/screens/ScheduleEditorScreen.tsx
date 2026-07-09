import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Download, Save, Wand2 } from "lucide-react";
import { useScheduleEditor } from "@/hooks/useScheduleEditor";
import { useScheduleValidation } from "@/hooks/useScheduleValidation";
import { ScheduleGrid } from "@/components/domain/schedule-grid/ScheduleGrid";
import { FairnessMeter } from "@/components/domain/schedule-grid/FairnessMeter";
import { AnalyticsStrip } from "@/components/domain/schedule-grid/AnalyticsStrip";
import { ViolationBanner } from "@/components/domain/schedule-grid/ViolationBanner";
import { analyzeFatigue, gridAnalytics } from "@/components/domain/schedule-grid/logic";
import { dateRange, weekLabel } from "@/components/domain/format";
import { SchedulePDFExporter } from "@/utils/pdfExport";
import { useToast } from "@/components/ui/use-toast";

export function ScheduleEditorScreen() {
  const { id } = useParams();
  const editor = useScheduleEditor(id);
  const validation = useScheduleValidation();
  const { toast } = useToast();

  const castMembers = editor.castData?.castMembers ?? [];
  const roles = editor.castData?.roles ?? [];
  const redTarget = castMembers.length || 12;

  const fatigueIssues = analyzeFatigue(editor.assignments, editor.shows, castMembers);
  const analytics = gridAnalytics(editor.assignments, editor.shows, roles);
  const showCount = editor.shows.filter((s) => s.status === "show").length;

  // Live (debounced) validation against the override-aware backend endpoint.
  useEffect(() => {
    const t = setTimeout(() => validation.runValidation(editor.shows, editor.assignments), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.shows, editor.assignments]);

  const handleExport = () => {
    if (!castMembers.length) {
      toast({ title: "Not ready", description: "Cast list is still loading.", variant: "destructive" });
      return;
    }
    const exporter = new SchedulePDFExporter({
      location: editor.location,
      week: editor.week,
      shows: editor.shows,
      assignments: editor.assignments,
      castMembers,
      roles,
    });
    exporter.generate();
    exporter.download();
  };

  if (editor.isLoading) {
    return (
      <div className="card empty">
        <p className="text-muted">Loading schedule…</p>
      </div>
    );
  }

  return (
    <>
      <section className="between" style={{ flexWrap: "wrap", gap: 18 }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">{weekLabel(editor.week)} · Editor</div>
          <input
            className="editor-title-input mt-8"
            value={editor.location}
            onChange={(e) => editor.setLocation(e.target.value)}
            placeholder="Location (e.g. London — Ambassadors Theatre)"
            aria-label="Schedule location"
          />
          <p className="text-muted mt-8" style={{ fontSize: 14 }}>
            {dateRange(editor.shows)} · {showCount} show{showCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="toolbar">
          <button className="btn btn-subtle btn-sm btn-icon" title="Previous week" onClick={editor.navigateToPreviousWeek}>
            <ChevronLeft />
          </button>
          <span className="mono" style={{ fontSize: 13, color: "var(--muted)", minWidth: 64, textAlign: "center" }}>
            {weekLabel(editor.week).toUpperCase()}
          </span>
          <button className="btn btn-subtle btn-sm btn-icon" title="Next week" onClick={editor.navigateToNextWeek}>
            <ChevronRight />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleExport}>
            <Download /> Export PDF
          </button>
          <button className="btn btn-primary btn-sm" onClick={editor.handleSave} disabled={editor.isSaving}>
            <Save /> {editor.isSaving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </section>

      <section className="card card-head mt-24" style={{ padding: "14px 18px", flexWrap: "wrap" }}>
        <div className="row-wrap">
          <button className="btn btn-primary btn-sm" onClick={editor.handleAutoGenerate} disabled={editor.isGenerating}>
            <Wand2 /> {editor.isGenerating ? "Generating…" : "Auto Generate"}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={editor.handleClearAll}>
            Clear All
          </button>
          <button className="btn btn-danger btn-sm" onClick={editor.handleResetShowTimes}>
            Reset Times
          </button>
        </div>
        <div className="row-wrap">
          <FairnessMeter covered={analytics.redCovered} target={redTarget} conflicts={analytics.conflicts} />
        </div>
      </section>

      <div className="mt-16">
        <ScheduleGrid
          shows={editor.shows}
          assignments={editor.assignments}
          castMembers={castMembers}
          roles={roles}
          location={editor.location}
          week={editor.week}
          onAssignmentChange={editor.handleAssignmentChange}
          onToggleRedDay={editor.handleToggleRedDay}
        />
      </div>

      <ViolationBanner
        result={validation.result}
        isValidating={validation.isValidating}
        fatigueIssues={fatigueIssues}
        onToggleOverride={editor.handleToggleOverride}
      />

      <AnalyticsStrip analytics={analytics} shows={editor.shows} redTarget={redTarget} />
    </>
  );
}
