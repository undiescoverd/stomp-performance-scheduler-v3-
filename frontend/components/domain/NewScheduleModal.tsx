import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DayStrip } from "./DayStrip";
import { useTemplates } from "@/hooks/useTemplates";
import {
  applyTemplate,
  mondayOf,
  nextMondayFrom,
  BUILTIN_TEMPLATE_CHOICES,
  FULL_WEEK_TEMPLATE_ID,
  STANDARD_TEMPLATE_ID,
  type TemplateChoice,
} from "./week";

/** Today as a local YYYY-MM-DD (mirrors the tour wizard). */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The deliberate setup step before the editor. Collects venue + week-start
 * (Monday) + a starting template, resolves them into Show[] via applyTemplate,
 * and hands the editor a seed through router state — replacing the old
 * jump-straight-into-a-hardcoded-London-week behavior.
 */
export function NewScheduleModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { templates } = useTemplates();

  const [venue, setVenue] = useState("");
  const [weekStart, setWeekStart] = useState("");
  const [choiceId, setChoiceId] = useState<string>(STANDARD_TEMPLATE_ID);

  useEffect(() => {
    if (!open) return;
    setVenue("");
    setWeekStart(nextMondayFrom(todayIso()));
    setChoiceId(STANDARD_TEMPLATE_ID);
  }, [open]);

  // Built-in choices (Standard, Blank) first, then the user's own templates.
  const choices: TemplateChoice[] = useMemo(
    () => [...BUILTIN_TEMPLATE_CHOICES, ...templates.map((t) => ({ id: t.id, name: t.name, slots: t.slots }))],
    [templates],
  );
  const selected = choices.find((c) => c.id === choiceId) ?? choices[0];

  const effectiveStart = weekStart || nextMondayFrom(todayIso());
  const previewShows = selected ? applyTemplate(selected.slots, effectiveStart) : [];
  const showCount = previewShows.filter((s) => s.status === "show").length;

  const canCreate = venue.trim().length > 0 && weekStart.length > 0 && !!selected;

  const confirm = () => {
    if (!canCreate || !selected) return;
    const isBuiltin = selected.id === STANDARD_TEMPLATE_ID || selected.id === FULL_WEEK_TEMPLATE_ID;
    navigate("/schedule/new", {
      state: {
        seed: {
          location: venue.trim(),
          weekStart,
          shows: applyTemplate(selected.slots, weekStart),
          // Built-ins aren't stored rows, so they don't record a template_id.
          templateId: isBuiltin ? undefined : selected.id,
        },
      },
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New schedule</DialogTitle>
          <DialogDescription>Pick a venue, the week's Monday, and a starting shape.</DialogDescription>
        </DialogHeader>

        <div className="stack" style={{ gap: 14 }}>
          <div className="stack" style={{ gap: 6 }}>
            <Label htmlFor="ns-venue">Venue</Label>
            <Input
              id="ns-venue"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="London — Ambassadors Theatre"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="stack" style={{ gap: 6 }}>
              <Label htmlFor="ns-week">Week start (Mon)</Label>
              {/* Snap to Monday: template offsets are measured from the week's
                  Monday, so a mid-week start would drift every show. */}
              <Input
                id="ns-week"
                type="date"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value ? mondayOf(e.target.value) : "")}
              />
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <Label htmlFor="ns-template">Template</Label>
              <select
                id="ns-template"
                className="travel-select"
                value={choiceId}
                onChange={(e) => setChoiceId(e.target.value)}
              >
                {choices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="stack" style={{ gap: 8 }}>
            <div className="between">
              <Label>
                Preview · {showCount} show{showCount === 1 ? "" : "s"}
              </Label>
              <Link
                to="/templates"
                className="text-muted"
                style={{ fontSize: 12 }}
                onClick={() => onOpenChange(false)}
              >
                Manage templates →
              </Link>
            </div>
            <DayStrip shows={previewShows} />
          </div>
        </div>

        <DialogFooter>
          <button className="btn btn-ghost btn-sm" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" onClick={confirm} disabled={!canCreate}>
            Open editor
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
