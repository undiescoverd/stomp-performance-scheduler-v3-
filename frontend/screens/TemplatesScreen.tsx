import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutTemplate, Plus, Pencil, PencilRuler, Trash2, ArrowRight, Check, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/shell/PageHeader";
import { StatCard } from "@/components/domain/StatCard";
import { DayStrip } from "@/components/domain/DayStrip";
import { Input } from "@/components/ui/input";
import { useTemplates } from "@/hooks/useTemplates";
import { applyTemplate, nextMondayFrom, FULL_WEEK_TEMPLATE_SLOTS } from "@/components/domain/week";
import type { Template } from "~backend/scheduler/types";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The templates library: apply a template into a new schedule, rename it in
 *  place, or delete it. The schedule editor is the builder, so "New from blank
 *  week" just opens an empty editor to shape and then save. */
export function TemplatesScreen() {
  const navigate = useNavigate();
  const { templates, isLoading, error, updateTemplate, deleteTemplate } = useTemplates();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

  const startRename = (t: Template) => {
    setEditingId(t.id);
    setDraftName(t.name);
  };
  const commitRename = (t: Template) => {
    const name = draftName.trim();
    if (name && name !== t.name) updateTemplate.mutate({ id: t.id, name });
    setEditingId(null);
  };

  // Apply: open a new *schedule* seeded from this template on the next Monday
  // (for casting). Venue is left blank for the user to fill in the editor.
  const apply = (t: Template) => {
    const weekStart = nextMondayFrom(todayIso());
    navigate("/schedule/new", {
      state: {
        seed: { location: "", weekStart, shows: applyTemplate(t.slots, weekStart), templateId: t.id },
      },
    });
  };

  // Edit shape: open the template in the shape-only builder to reshape it, then
  // "Save as template" updates it in place (templateId is carried through).
  const editShape = (t: Template) => {
    const weekStart = nextMondayFrom(todayIso());
    navigate("/schedule/new", {
      state: {
        seed: { location: "", weekStart, shows: applyTemplate(t.slots, weekStart), templateId: t.id, templateMode: true },
      },
    });
  };

  // Build a week: open the shape-only builder on a full Mon–Sun canvas, ready to
  // reshape and save as a new template.
  const buildWeek = () => {
    const weekStart = nextMondayFrom(todayIso());
    navigate("/schedule/new", {
      state: {
        seed: {
          location: "",
          weekStart,
          shows: applyTemplate(FULL_WEEK_TEMPLATE_SLOTS, weekStart),
          templateId: undefined,
          templateMode: true,
        },
      },
    });
  };

  const totalShows = (t: Template) => t.slots.filter((s) => s.status === "show").length;

  return (
    <>
      <PageHeader
        eyebrow="Reusable week shapes"
        title="Templates"
        lead="Save any week's shape as a template, then apply it to a new schedule or a tour week. The schedule editor is the builder — shape a week and choose “Save as template”."
        actions={
          <button className="btn btn-primary btn-sm" onClick={buildWeek}>
            <Plus /> Build a week
          </button>
        }
      />

      <section className="stats mt-24">
        <StatCard label="Templates" value={templates.length} tone="accent" icon={<LayoutTemplate />} delta="owner-scoped" />
      </section>

      <section className="mt-32">
        <div className="section-head">
          <h2 className="h1">Your templates</h2>
          <div className="kicker">Edit a shape, apply it to a schedule, rename, or delete</div>
        </div>

        {isLoading ? (
          <div className="card empty">
            <p className="text-muted">Loading templates…</p>
          </div>
        ) : error ? (
          <div className="card empty">
            <div className="h3">Couldn't load templates</div>
            <p className="text-muted">{error.message}</p>
          </div>
        ) : templates.length === 0 ? (
          <div className="card empty">
            <LayoutTemplate />
            <div className="h2">No templates yet</div>
            <p className="text-muted" style={{ maxWidth: "46ch" }}>
              Build a week from a full Mon–Sun canvas — reshape the days and save — or shape any schedule and choose
              “Save as template” in the editor header. It’ll appear here to reuse.
            </p>
            <button className="btn btn-primary btn-sm" onClick={buildWeek}>
              <Plus /> Build a week
            </button>
          </div>
        ) : (
          <div className="stack" style={{ gap: 12 }}>
            {templates.map((t) => {
              const shows = totalShows(t);
              return (
                <div key={t.id} className="card card-pad">
                  <div className="between" style={{ gap: 14, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 220, flex: 1 }}>
                      {editingId === t.id ? (
                        <div className="row" style={{ gap: 8 }}>
                          <Input
                            value={draftName}
                            autoFocus
                            onChange={(e) => setDraftName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename(t);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            aria-label="Template name"
                          />
                          <button className="btn btn-primary btn-sm btn-icon" title="Save name" onClick={() => commitRename(t)}>
                            <Check />
                          </button>
                          <button className="btn btn-ghost btn-sm btn-icon" title="Cancel" onClick={() => setEditingId(null)}>
                            <X />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="h3">{t.name}</div>
                          <div className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
                            {shows} show{shows === 1 ? "" : "s"} · {t.slots.length} day{t.slots.length === 1 ? "" : "s"} set
                          </div>
                        </>
                      )}
                    </div>

                    <div className="row-wrap" style={{ gap: 8 }}>
                      <button className="btn btn-primary btn-sm" onClick={() => editShape(t)} title="Reshape this template's days">
                        <PencilRuler /> Edit shape
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => apply(t)} title="Start a new schedule from this template">
                        Apply <ArrowRight />
                      </button>
                      <button className="btn btn-ghost btn-sm btn-icon" title="Rename" onClick={() => startRename(t)}>
                        <Pencil />
                      </button>
                      <button className="btn btn-danger btn-sm btn-icon" title="Delete" onClick={() => setDeleteTarget(t)}>
                        <Trash2 />
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <DayStrip slots={t.slots} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the template. Schedules already created from it are unaffected. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) deleteTemplate.mutate(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
