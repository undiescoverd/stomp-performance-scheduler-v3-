import { AlertCircle, AlertTriangle, CheckCircle2, ShieldCheck, Flag } from "lucide-react";
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
import type { FatigueIssue } from "./logic";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

interface ViolationBannerProps {
  result: ValidationResult | null;
  isValidating: boolean;
  fatigueIssues: FatigueIssue[];
  onToggleOverride: (performer: string) => void;
}

const KIND_LABEL: Record<FatigueIssue["kind"], string> = {
  weekly: "weekly cap (>6 shows)",
  "back-to-back": "back-to-back double days",
};

const MAX_ROWS = 8;

export function ViolationBanner({ result, isValidating, fatigueIssues, onToggleOverride }: ViolationBannerProps) {
  if (!result) return null;
  const { errors, warnings } = result;
  const allClear = errors.length === 0 && warnings.length === 0;

  // Collapse fatigue issues to one row per performer.
  const byPerformer = new Map<string, { kinds: Set<string>; overridden: boolean }>();
  for (const f of fatigueIssues) {
    const entry = byPerformer.get(f.performer) ?? { kinds: new Set<string>(), overridden: false };
    entry.kinds.add(KIND_LABEL[f.kind]);
    entry.overridden = entry.overridden || f.overridden;
    byPerformer.set(f.performer, entry);
  }
  const fatiguePerformers = [...byPerformer.entries()];

  return (
    <div className="violation-card mt-16">
      <div className="violation-head">
        <ShieldCheck />
        Validation
        <span className="violation-count">
          {isValidating
            ? "checking…"
            : `${errors.length} error${errors.length === 1 ? "" : "s"} · ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {allClear ? (
        <div className="violation-row ok">
          <CheckCircle2 className="v-ico" />
          <div className="v-msg">Schedule valid — all constraints satisfied.</div>
        </div>
      ) : (
        <>
          {errors.slice(0, MAX_ROWS).map((e, i) => (
            <div key={`e${i}`} className="violation-row error">
              <AlertCircle className="v-ico" />
              <div className="v-msg">{e}</div>
            </div>
          ))}
          {warnings.slice(0, MAX_ROWS).map((w, i) => (
            <div key={`w${i}`} className="violation-row warn">
              <AlertTriangle className="v-ico" />
              <div className="v-msg">{w}</div>
            </div>
          ))}
          {errors.length + warnings.length > 2 * MAX_ROWS ? (
            <div className="violation-row">
              <div className="v-msg text-muted">
                + {errors.length + warnings.length - 2 * MAX_ROWS} more issue(s). Fill open roles and resolve conflicts
                to clear them.
              </div>
            </div>
          ) : null}
        </>
      )}

      {fatiguePerformers.map(([performer, info]) => (
        <div key={performer} className="violation-row fatigue">
          <Flag className="v-ico" style={{ color: "var(--amber)" }} />
          <div className="v-msg">
            <b>{performer}</b> — {[...info.kinds].join(", ")}
            {info.overridden ? (
              <span className="v-sub">RD injury/sickness override applied — reported as a warning, not an error.</span>
            ) : (
              <span className="v-sub">Fatigue violation. Apply an RD override only for a genuine injury/sickness cover.</span>
            )}
          </div>
          <div className="v-action">
            {info.overridden ? (
              <button className="btn btn-ghost btn-sm" onClick={() => onToggleOverride(performer)}>
                Remove override
              </button>
            ) : (
              <OverrideConfirm performer={performer} onConfirm={() => onToggleOverride(performer)} />
            )}
          </div>
        </div>
      ))}
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
