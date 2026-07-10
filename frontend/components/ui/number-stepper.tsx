import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { clampToRange } from "@/lib/number";

interface NumberStepperProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  id?: string;
  "aria-label"?: string;
  disabled?: boolean;
}

/**
 * A number field you can type into.
 *
 * The input holds a raw string while it is being edited, so an empty box or a
 * "1" on its way to "12" is allowed to exist. Clamping happens on commit —
 * blur, Enter, or a stepper button — never on a keystroke, and `onChange` only
 * ever emits a clamped integer.
 */
export function NumberStepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  id,
  "aria-label": ariaLabel,
  disabled,
}: NumberStepperProps) {
  const [buffer, setBuffer] = React.useState(String(value));

  // Re-sync when the value changes from outside, or the number shown here can
  // drift from the one that was committed.
  React.useEffect(() => setBuffer(String(value)), [value]);

  // An emptied or unparseable field settles on `min`, matching what holding the
  // minus button down already does.
  const commit = (raw: string) => {
    const next = clampToRange(raw, min, max, min);
    setBuffer(String(next));
    if (next !== value) onChange(next);
  };

  const nudge = (delta: number) => {
    const next = clampToRange(String(value + delta), min, max, value);
    setBuffer(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <div className="row" style={{ gap: 6 }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm btn-icon"
        aria-label="Decrease"
        disabled={disabled || value <= min}
        onClick={() => nudge(-step)}
      >
        <Minus />
      </button>
      <Input
        id={id}
        aria-label={ariaLabel}
        inputMode="numeric"
        value={buffer}
        disabled={disabled}
        style={{ textAlign: "center" }}
        onChange={(e) => setBuffer(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(e.currentTarget.value);
          }
        }}
      />
      <button
        type="button"
        className="btn btn-ghost btn-sm btn-icon"
        aria-label="Increase"
        disabled={disabled || value >= max}
        onClick={() => nudge(step)}
      >
        <Plus />
      </button>
    </div>
  );
}
