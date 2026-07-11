import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import backend from "~backend/client";
import type { Role } from "~backend/scheduler/types";
import { useToast } from "@/components/ui/use-toast";

export interface MemberInput {
  name: string;
  eligibleRoles: Role[];
  gender: "male" | "female";
  status: "active" | "archived";
}

export function useCompany() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["company"],
    queryFn: () => backend.scheduler.getCompany(),
  });

  // Company edits must also refresh the Schedule Editor's roster, which lives
  // under a separate ['cast-members'] query. Without this, an added/archived
  // member wouldn't reach the scheduler until that query's 60s refetch fired.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["company"] });
    qc.invalidateQueries({ queryKey: ["cast-members"] });
  };

  // The company endpoints throw a plain Error ("Member not found") for a missing
  // id, which surfaces as an untyped 500. Degrade gracefully: tell the user and
  // resync from the server rather than leaving a stale card.
  const onError = (verb: string) => (err: unknown) => {
    invalidate();
    toast({
      title: `Couldn't ${verb} member`,
      description: err instanceof Error && /not found/i.test(err.message)
        ? "That member no longer exists — the list has been refreshed."
        : "Something went wrong. The list has been refreshed.",
      variant: "destructive",
    });
  };

  const addMember = useMutation({
    mutationFn: (input: MemberInput) =>
      backend.scheduler.addMember({
        name: input.name,
        eligibleRoles: input.eligibleRoles,
        gender: input.gender,
        status: input.status,
      }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Cast member added" });
    },
    onError: onError("add"),
  });

  const updateMember = useMutation({
    mutationFn: (input: MemberInput & { id: string }) =>
      backend.scheduler.updateMember({
        id: input.id,
        name: input.name,
        eligibleRoles: input.eligibleRoles,
        gender: input.gender,
        status: input.status,
      }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Cast member updated" });
    },
    onError: onError("update"),
  });

  const setStatus = useMutation({
    mutationFn: (vars: { id: string; status: "active" | "archived" }) =>
      backend.scheduler.updateMember({ id: vars.id, status: vars.status }),
    onSuccess: (_d, vars) => {
      invalidate();
      toast({ title: vars.status === "archived" ? "Member archived" : "Member reactivated" });
    },
    onError: onError("update"),
  });

  const deleteMember = useMutation({
    mutationFn: (id: string) => backend.scheduler.deleteMember({ id }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Cast member removed" });
    },
    onError: onError("delete"),
  });

  return {
    currentCompany: query.data?.currentCompany ?? [],
    archive: query.data?.archive ?? [],
    roles: query.data?.roles ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    addMember,
    updateMember,
    setStatus,
    deleteMember,
  };
}
