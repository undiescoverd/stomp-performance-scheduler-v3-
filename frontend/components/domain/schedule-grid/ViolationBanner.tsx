import { AlertCircle, AlertTriangle, Flag, ShieldCheck } from "lucide-react";
import type { ValidationItem } from "~backend/scheduler/validate";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import type { FatigueIssue, RosterEntry } from "./logic";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  /** Structured, per-issue attribution — present once the client is regenerated. */
  items: ValidationItem[];
}

interface ViolationBannerProps {
  result: ValidationResult | null;
  isValidating: boolean;
  fatigueIssues: FatigueIssue[];
  roster: RosterEntry[];
  onToggleOverride: (performer: string) => void;
}

const KIND_LABEL: Record<FatigueIssue["kind"], string> = {
  weekly: "weekly cap (>6 shows)",
  "back-to-back": "back-to-back double days",
};

export function ViolationBanner({ result, isValidating, fatigueIssues, roster, onToggleOverride }: ViolationBannerProps) {
  const errors = result?.errors ?? [];
  const warnings = result?.warnings ?? [];
  const items = result?.items ?? [];

  // Collapse fatigue issues to one entry per performer (client-side, override-aware).
  const fatigueByPerformer = new Map<string, { kinds: Set<string>; overridden: boolean }>();
  for (const f of fatigueIssues) {
    const entry = fatigueByPerformer.get(f.performer) ?? { kinds: new Set<string>(), overridden: false };
    entry.kinds.add(KIND_LABEL[f.kind]);
    entry.overridden = entry.overridden || f.overridden;
    fatigueByPerformer.set(f.performer, entry);
  }

  // Attribute each backend item to a performer only when its name is actually on
  // the roster — an "Unknown performer" item carries a name that matches nobody,
  // so it belongs with the show-level issues rather than vanishing.
  const rosterNames = new Set(roster.map((r) => r.name));
  const scheduleIssues = items.filter((it) => !it.performer || !rosterNames.has(it.performer));

  const summary = isValidating
    ? "checking…"
    : `${errors.length} error${errors.length === 1 ? "" : "s"} · ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`;

  return (
    <div className="validation-card mt-16">
      <div className="violation-head">
        <ShieldCheck />
        Roster &amp; validation
        <span className="violation-count">{summary}</span>
      </div>

      <div className="validation-scroll">
        <table className="validation-table">
          <thead>
            <tr>
              <th className="vt-name-col">Performer</th>
              <th className="vt-count-col">Shows</th>
              <th>Issues</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((r) => {
              const perfItems = items.filter((it) => it.performer === r.name);
              const fatigue = fatigueByPerformer.get(r.name);
              const hasIssues = perfItems.length > 0 || !!fatigue;
              return (
                <tr key={r.name}>
                  <td className="vt-name">{r.name}</td>
                  <td className={r.showCount === 0 ? "vt-count zero" : "vt-count"}>{r.showCount}</td>
                  <td className="vt-issues">
                    {!hasIssues ? (
                      <span className="vt-none">—</span>
                    ) : (
                      <>
                        {perfItems.map((it, i) => (
                          <IssueLine key={`i${i}`} severity={it.severity} message={it.message} />
                        ))}
                        {fatigue ? (
                          <div className="vt-issue warn">
                            <Flag className="v-ico" style={{ color: "var(--amber)" }} />
                            <div className="vt-issue-body">
                              {[...fatigue.kinds].join(", ")}
                              <span className="v-sub">
                                {fatigue.overridden
                                  ? "RD injury/sickness override applied — reported as a warning, not an error."
                                  : "Fatigue violation. Apply an RD override only for a genuine injury/sickness cover."}
                              </span>
                            </div>
                            <div className="vt-issue-action">
                              {fatigue.overridden ? (
                                <button className="btn btn-ghost btn-sm" onClick={() => onToggleOverride(r.name)}>
                                  Remove override
                                </button>
                              ) : (
                                <OverrideConfirm performer={r.name} onConfirm={() => onToggleOverride(r.name)} />
                              )}
                            </div>
                          </div>
                        ) : null}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}

            {scheduleIssues.length > 0 ? (
              <>
                <tr className="vt-group">
                  <td colSpan={3}>Schedule issues</td>
                </tr>
                {scheduleIssues.map((it, i) => (
                  <tr key={`s${i}`} className="vt-group-row">
                    <td colSpan={3} className="vt-issues">
                      <IssueLine severity={it.severity} message={it.message} />
                    </td>
                  </tr>
                ))}
              </>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IssueLine({ severity, message }: { severity: ValidationItem["severity"]; message: string }) {
  return (
    <div className={`vt-issue ${severity === "error" ? "error" : "warn"}`}>
      {severity === "error" ? <AlertCircle className="v-ico" /> : <AlertTriangle className="v-ico" />}
      <div className="vt-issue-body">{message}</div>
    </div>
  );
}

function OverrideConfirm({ performer, onConfirm }: { performer: string; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button className="btn btn-danger btn-sm">
          <Flag /> Override
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Apply RD fatigue override for {performer}?</AlertDialogTitle>
          <AlertDialogDescription>
            This flags {performer}'s stage assignments as an injury/sickness override, downgrading their back-to-back /
            weekly-cap violation from an error to a warning. It never softens role-eligibility, gender, or
            double-assignment errors.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Apply override</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
