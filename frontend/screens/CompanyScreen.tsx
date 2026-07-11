import { useState } from "react";
import { Plus, Users, Drama, Layers, Venus } from "lucide-react";
import type { CompanyMember } from "~backend/scheduler/company";
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
import { CastCard } from "@/components/domain/company/CastCard";
import { EligibilityMatrix } from "@/components/domain/company/EligibilityMatrix";
import { CastMemberDialog } from "@/components/domain/company/CastMemberDialog";
import { useCompany, type MemberInput } from "@/hooks/useCompany";

export function CompanyScreen() {
  const { currentCompany, archive, roles, isLoading, error, addMember, updateMember, setStatus, deleteMember } =
    useCompany();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CompanyMember | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanyMember | null>(null);

  const openAdd = () => {
    setEditTarget(null);
    setDialogOpen(true);
  };
  const openEdit = (m: CompanyMember) => {
    setEditTarget(m);
    setDialogOpen(true);
  };
  const submit = (input: MemberInput) => {
    if (editTarget) updateMember.mutate({ ...input, id: editTarget.id });
    else addMember.mutate(input);
    setDialogOpen(false);
  };

  const multiRole = currentCompany.filter((m) => m.eligibleRoles.length > 1).length;
  const femaleCount = currentCompany.filter((m) => m.gender === "female").length;

  return (
    <>
      <PageHeader
        eyebrow="Cast & Roles"
        title="Cast"
        lead="Performers across the STOMP performance roles. Every performer carries exactly one RED day per week."
        actions={
          <button className="btn btn-primary btn-sm" onClick={openAdd}>
            <Plus /> Add Cast Member
          </button>
        }
      />

      <section className="stats mt-24">
        <StatCard label="Active Cast" value={currentCompany.length} tone="accent" icon={<Users />} delta={`${archive.length} archived`} />
        <StatCard label="Roles" value={roles.length} tone="green" icon={<Drama />} />
        <StatCard label="Multi-role" value={multiRole} tone="pink" icon={<Layers />} delta="eligible > 1 role" />
        <StatCard
          label="Female Cast"
          value={femaleCount}
          tone="amber"
          icon={<Venus />}
          delta={`${Math.max(currentCompany.length - femaleCount, 0)} male`}
        />
      </section>

      <section className="mt-32">
        <div className="section-head">
          <h2 className="h1">Cast</h2>
          <div className="kicker">Edit eligibility, archive, or remove</div>
        </div>

        {isLoading ? (
          <div className="card empty">
            <p className="text-muted">Loading company…</p>
          </div>
        ) : error ? (
          <div className="card empty">
            <div className="h3">Couldn't load the company</div>
            <p className="text-muted">{error.message}</p>
          </div>
        ) : currentCompany.length === 0 ? (
          <div className="card empty">
            <div className="h2">No cast yet</div>
            <button className="btn btn-primary btn-sm" onClick={openAdd}>
              <Plus /> Add the first cast member
            </button>
          </div>
        ) : (
          <div className="cast-grid">
            {currentCompany.map((m) => (
              <CastCard
                key={m.id}
                member={m}
                onEdit={openEdit}
                onArchiveToggle={(mem) => setStatus.mutate({ id: mem.id, status: "archived" })}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}

        {archive.length > 0 ? (
          <>
            <div className="section-head mt-32">
              <h2 className="h2">Archived</h2>
              <div className="kicker">{archive.length} archived</div>
            </div>
            <div className="cast-grid">
              {archive.map((m) => (
                <CastCard
                  key={m.id}
                  member={m}
                  onEdit={openEdit}
                  onArchiveToggle={(mem) => setStatus.mutate({ id: mem.id, status: "active" })}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          </>
        ) : null}
      </section>

      <section className="mt-32">
        <div className="section-head">
          <div>
            <h2 className="h1">Role Eligibility Matrix</h2>
            <p className="lead mt-8">Which performer can cover which role.</p>
          </div>
        </div>
        <EligibilityMatrix members={currentCompany} roles={roles} />
      </section>

      <CastMemberDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editTarget}
        roles={roles}
        onSubmit={submit}
        isSubmitting={addMember.isPending || updateMember.isPending}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the cast member. To keep them for later, archive instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) deleteMember.mutate(deleteTarget.id);
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
