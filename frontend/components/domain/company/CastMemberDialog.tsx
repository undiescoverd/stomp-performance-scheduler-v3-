import { useEffect, useState } from "react";
import type { Role } from "~backend/scheduler/types";
import type { CompanyMember } from "~backend/scheduler/company";
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
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { MemberInput } from "@/hooks/useCompany";

interface CastMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: CompanyMember | null;
  roles: Role[];
  onSubmit: (input: MemberInput) => void;
  isSubmitting?: boolean;
}

export function CastMemberDialog({ open, onOpenChange, initial, roles, onSubmit, isSubmitting }: CastMemberDialogProps) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<Role>>(new Set());
  const [gender, setGender] = useState<"male" | "female">("male");

  // Reset the form whenever the dialog opens (for add) or target changes (edit).
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setSelected(new Set(initial?.eligibleRoles ?? []));
    setGender(initial?.gender ?? "male");
  }, [open, initial]);

  const canSave = name.trim().length > 0 && selected.size > 0;

  const toggleRole = (role: Role, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(role);
      else next.delete(role);
      return next;
    });
  };

  const submit = () => {
    if (!canSave) return;
    onSubmit({ name: name.trim(), eligibleRoles: [...selected], gender });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? `Edit ${initial.name}` : "Add cast member"}</DialogTitle>
          <DialogDescription>
            Set the performer's name and which roles they're eligible to cover.
          </DialogDescription>
        </DialogHeader>

        <div className="stack" style={{ gap: 16 }}>
          <div className="stack" style={{ gap: 6 }}>
            <Label htmlFor="member-name">Name</Label>
            <Input
              id="member-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. TAYLOR"
              autoFocus
            />
          </div>

          <div className="stack" style={{ gap: 8 }}>
            <Label>Eligible roles</Label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
              {roles.map((role) => (
                <label key={role} className="row" style={{ gap: 8, cursor: "pointer" }}>
                  <Checkbox
                    checked={selected.has(role)}
                    onCheckedChange={(c) => toggleRole(role, c === true)}
                  />
                  <span className="role-chip">{role}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="stack" style={{ gap: 8 }}>
            <Label>Gender</Label>
            <RadioGroup
              value={gender}
              onValueChange={(v) => setGender(v as "male" | "female")}
              className="row"
              style={{ gap: 20 }}
            >
              <label className="row" style={{ gap: 8, cursor: "pointer" }}>
                <RadioGroupItem value="male" /> Male
              </label>
              <label className="row" style={{ gap: 8, cursor: "pointer" }}>
                <RadioGroupItem value="female" /> Female
              </label>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <button className="btn btn-ghost btn-sm" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" onClick={submit} disabled={!canSave || isSubmitting}>
            {isSubmitting ? "Saving…" : initial ? "Save changes" : "Add member"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
