import { useEffect, useMemo, useState } from "react";
import type { Show } from "~backend/scheduler/types";
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
import { showsToSlots, weekStartOf } from "./week";

/**
 * Captures the current week's shape as a template. Always offers "Save as new";
 * when the schedule came from a template that still exists, also offers to
 * update that template in place. The schedule editor *is* the week builder, so
 * there is no separate authoring screen.
 */
export function SaveTemplateDialog({
  open,
  onOpenChange,
  shows,
  weekStart,
  templateId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shows: Show[];
  weekStart: string;
  templateId?: string;
  onSaved?: (id: string) => void;
}) {
  const { templates, createTemplate, updateTemplate } = useTemplates();

  // The template this schedule was created from, if it still exists.
  const current = templateId ? templates.find((t) => t.id === templateId) : undefined;

  const [name, setName] = useState("");
  useEffect(() => {
    if (open) setName(current?.name ?? "");
  }, [open, current?.name]);

  const start = weekStart || weekStartOf(shows) || "";
  const slots = useMemo(() => (start ? showsToSlots(shows, start) : []), [shows, start]);
  const showCount = slots.filter((s) => s.status === "show").length;

  const canSave = name.trim().length > 0 && slots.length > 0;
  const busy = createTemplate.isPending || updateTemplate.isPending;

  const saveNew = async () => {
    if (!canSave) return;
    const res = await createTemplate.mutateAsync({ name: name.trim(), slots });
    onSaved?.(res.template.id);
    onOpenChange(false);
  };

  const update = async () => {
    if (!current || slots.length === 0) return;
    await updateTemplate.mutateAsync({ id: current.id, name: name.trim() || current.name, slots });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>
            Capture this week's shape ({showCount} show{showCount === 1 ? "" : "s"}) as a reusable template. Cast and
            venue are not saved.
          </DialogDescription>
        </DialogHeader>

        <div className="stack" style={{ gap: 14 }}>
          <div className="stack" style={{ gap: 6 }}>
            <Label htmlFor="tmpl-name">Template name</Label>
            <Input
              id="tmpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Standard touring week"
            />
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <Label>Captured shape</Label>
            <DayStrip slots={slots} />
          </div>
        </div>

        <DialogFooter>
          <button className="btn btn-ghost btn-sm" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          {current ? (
            <button className="btn btn-subtle btn-sm" onClick={update} disabled={busy || slots.length === 0}>
              Update &ldquo;{current.name}&rdquo;
            </button>
          ) : null}
          <button className="btn btn-primary btn-sm" onClick={saveNew} disabled={!canSave || busy}>
            Save as new template
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
