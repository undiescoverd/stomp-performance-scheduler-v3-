import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import backend from "~backend/client";
import type { TemplateSlot } from "~backend/scheduler/types";
import { useToast } from "@/components/ui/use-toast";

/** Owner-scoped week templates: the list plus create/update/delete mutations,
 *  shared by the New Schedule modal, the save dialog, the tour wizard and the
 *  templates library. */
export function useTemplates() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["templates"],
    queryFn: () => backend.scheduler.listTemplates(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["templates"] });

  const createTemplate = useMutation({
    mutationFn: (vars: { name: string; slots: TemplateSlot[] }) => backend.scheduler.createTemplate(vars),
    onSuccess: () => {
      invalidate();
      toast({ title: "Template saved" });
    },
    onError: () => toast({ title: "Couldn't save template", variant: "destructive" }),
  });

  const updateTemplate = useMutation({
    mutationFn: (vars: { id: string; name?: string; slots?: TemplateSlot[] }) =>
      backend.scheduler.updateTemplate(vars),
    onSuccess: () => {
      invalidate();
      toast({ title: "Template updated" });
    },
    onError: () => toast({ title: "Couldn't update template", variant: "destructive" }),
  });

  const deleteTemplate = useMutation({
    mutationFn: (id: string) => backend.scheduler.deleteTemplate({ id }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Template deleted" });
    },
    onError: () => toast({ title: "Couldn't delete template", variant: "destructive" }),
  });

  return {
    templates: query.data?.templates ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
}
