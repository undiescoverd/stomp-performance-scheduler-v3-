import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Download, Plus, Save, Undo2, Wand2, BookmarkPlus } from "lucide-react";
import { useScheduleEditor } from "@/hooks/useScheduleEditor";
import { useScheduleValidation } from "@/hooks/useScheduleValidation";
import { ScheduleGrid } from "@/components/domain/schedule-grid/ScheduleGrid";
import { FairnessMeter } from "@/components/domain/schedule-grid/FairnessMeter";
import { AnalyticsStrip } from "@/components/domain/schedule-grid/AnalyticsStrip";
import { ViolationBanner } from "@/components/domain/schedule-grid/ViolationBanner";
import { SaveTemplateDialog } from "@/components/domain/SaveTemplateDialog";
import { analyzeFatigue, gridAnalytics, rosterShowCounts } from "@/components/domain/schedule-grid/logic";
import { dateRange, shortDate } from "@/components/domain/format";
import { SchedulePDFExporter } from "@/utils/pdfExport";
import { useToast } from "@/components/ui/use-toast";
import { useSettings } from "@/providers/SettingsProvider";

export function ScheduleEditorScreen() {
  const { id } = useParams();
  const editor = useScheduleEditor(id);
  const validation = useScheduleValidation();
  const { toast } = useToast();
  const { dateStyle } = useSettings();
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);

  const castMembers = editor.castData?.castMembers ?? [];
  const roles = editor.castData?.roles ?? [];
  const redTarget = castMembers.length || 12;

  const fatigueIssues = analyzeFatigue(editor.assignments, editor.shows, castMembers);
  const analytics = gridAnalytics(editor.assignments, editor.shows, roles, castMembers);
  const roster = rosterShowCounts(editor.assignments, editor.shows, castMembers);
  const showCount = editor.shows.filter((s) => s.status === "show").length;

  // Live (debounced) validation against the override-aware backend endpoint.
  useEffect(() => {
    const t = setTimeout(() => validation.runValidation(editor.shows, editor.assignments), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.shows, editor.assignments]);

  // Cmd/Ctrl+Z undoes the last shaping edit. Ignored while a field has focus so
  // it doesn't fight the browser's own undo inside a time or city input.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z" || e.shiftKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      editor.handleUndo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor.handleUndo]);

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
      dateStyle,
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
      <SaveTemplateDialog
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
        shows={editor.shows}
        weekStart={editor.weekStartDate}
        templateId={editor.templateId}
        onSaved={editor.setTemplateId}
      />

      <section className="between" style={{ flexWrap: "wrap", gap: 18 }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">{editor.week ? `${editor.week} · ` : ""}Editor</div>
          <input
            className="editor-title-input mt-8"
            value={editor.location}
            onChange={(e) => editor.setLocation(e.target.value)}
            placeholder="Location (e.g. London — Ambassadors Theatre)"
            aria-label="Schedule location"
          />
          <input
            className="mt-8"
            value={editor.week}
            onChange={(e) => editor.setWeek(e.target.value)}
            placeholder="Optional week label (e.g. Preview week)"
            aria-label="Week label"
            style={{
              display: "block",
              width: "min(340px, 100%)",
              fontSize: 13,
              color: "var(--muted)",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "5px 9px",
            }}
          />
          <p className="text-muted mt-8" style={{ fontSize: 14 }}>
            {dateRange(editor.shows, dateStyle)} · {showCount} show{showCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="toolbar">
          <button className="btn btn-subtle btn-sm btn-icon" title="Previous week" onClick={editor.navigateToPreviousWeek}>
            <ChevronLeft />
          </button>
          <span className="mono" style={{ fontSize: 13, color: "var(--muted)", minWidth: 78, textAlign: "center" }}>
            {editor.weekStartDate ? shortDate(editor.weekStartDate, dateStyle) : "—"}
          </span>
          <button className="btn btn-subtle btn-sm btn-icon" title="Next week" onClick={editor.navigateToNextWeek}>
            <ChevronRight />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSaveTemplateOpen(true)} title="Save this week's shape as a reusable template">
            <BookmarkPlus /> Save as template
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
          <button className="btn btn-ghost btn-sm" onClick={editor.handleAddShow}>
            <Plus /> Add Show
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={editor.handleUndo}
            disabled={!editor.canUndo}
            title="Undo the last change to the week (Cmd/Ctrl+Z)"
          >
            <Undo2 /> Undo
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

      <AnalyticsStrip analytics={analytics} shows={editor.shows} redTarget={redTarget} />

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
          onShowStatusChange={editor.handleShowStatusChange}
          onRemoveShow={editor.handleRemoveShow}
          onShowChange={editor.handleShowChange}
          onAddShowToDate={editor.handleAddShowToDate}
          onRestoreDate={editor.handleRestoreDate}
          onSetDestination={editor.handleSetDestination}
          onSetCompanyRedDay={editor.handleSetCompanyRedDay}
        />
      </div>

      <ViolationBanner
        result={validation.result}
        isValidating={validation.isValidating}
        fatigueIssues={fatigueIssues}
        roster={roster}
        onToggleOverride={editor.handleToggleOverride}
      />
    </>
  );
}
