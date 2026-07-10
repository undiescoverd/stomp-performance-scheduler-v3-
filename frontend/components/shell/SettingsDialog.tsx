import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useSettings } from "@/providers/SettingsProvider";
import { shortDate, type DateStyle } from "@/components/domain/format";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** A fixed date so each option's preview reads as a format, not as today. */
const SAMPLE = "2026-07-22";

const DATE_STYLES: { value: DateStyle; label: string }[] = [
  { value: "dmy", label: "Day/Month/Year" },
  { value: "mdy", label: "Month/Day/Year" },
  { value: "iso", label: "ISO 8601" },
  { value: "short", label: "Short" },
];

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { dateStyle, setDateStyle } = useSettings();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Preferences are stored in this browser and apply everywhere dates are shown, including exported PDFs.
          </DialogDescription>
        </DialogHeader>

        <div className="stack" style={{ gap: 10 }}>
          <Label>Date format</Label>
          <RadioGroup value={dateStyle} onValueChange={(v) => setDateStyle(v as DateStyle)}>
            {DATE_STYLES.map((s) => (
              <div key={s.value} className="row" style={{ gap: 10, minHeight: 32 }}>
                <RadioGroupItem value={s.value} id={`date-style-${s.value}`} />
                <Label htmlFor={`date-style-${s.value}`} style={{ cursor: "pointer" }}>
                  {s.label}
                </Label>
                <span className="text-muted" style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
                  {shortDate(SAMPLE, s.value)}
                </span>
              </div>
            ))}
          </RadioGroup>
        </div>
      </DialogContent>
    </Dialog>
  );
}
