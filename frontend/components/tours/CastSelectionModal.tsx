import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { 
  Users, 
  UserPlus, 
  ChevronRight, 
  ChevronLeft, 
  Archive, 
  ArrowUp 
} from 'lucide-react';
import backend from '~backend/client';
import type { CompanyMember } from '~backend/scheduler/company';
import { QuickAddCastModal } from './QuickAddCastModal';

interface CastSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedCast: CompanyMember[]) => void;
  initialSelection?: CompanyMember[];
}

export function CastSelectionModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  initialSelection = [] 
}: CastSelectionModalProps) {
  const [selectedCast, setSelectedCast] = useState<Set<string>>(new Set());
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch company data
  const { data: companyData, isLoading } = useQuery({
    queryKey: ['company'],
    queryFn: () => backend.scheduler.getCompany()
  });

  // Archive/activate member mutation
  const updateMemberMutation = useMutation({
    mutationFn: (data: { id: string; status: 'active' | 'archived' }) =>
      backend.scheduler.updateMember({ id: data.id, status: data.status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company'] });
      toast({
        title: "Success",
        description: "Cast member status updated"
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update cast member status",
        variant: "destructive"
      });
    }
  });

  // Initialize selection from props
  useEffect(() => {
    if (initialSelection.length > 0) {
      setSelectedCast(new Set(initialSelection.map(member => member.id)));
    }
  }, [initialSelection]);

  const handleClose = () => {
    setSelectedCast(new Set());
    onClose();
  };

  const handleConfirm = () => {
    const activeCast = companyData?.currentCompany || [];
    const selected = activeCast.filter(member => selectedCast.has(member.id));
    
    if (selected.length !== 12) {
      toast({
        title: "Invalid selection",
        description: "Please select exactly 12 cast members for the tour",
        variant: "destructive"
      });
      return;
    }

    onConfirm(selected);
    handleClose();
  };

  const toggleCastSelection = (memberId: string) => {
    setSelectedCast(prev => {
      const newSet = new Set(prev);
      if (newSet.has(memberId)) {
        newSet.delete(memberId);
      } else {
        if (newSet.size >= 12) {
          toast({
            title: "Maximum reached",
            description: "You can only select 12 cast members for a tour",
            variant: "destructive"
          });
          return prev;
        }
        newSet.add(memberId);
      }
      return newSet;
    });
  };

  const moveToArchive = (member: CompanyMember) => {
    updateMemberMutation.mutate({ id: member.id, status: 'archived' });
    // Remove from selection if selected
    setSelectedCast(prev => {
      const newSet = new Set(prev);
      newSet.delete(member.id);
      return newSet;
    });
  };

  const moveToActive = (member: CompanyMember) => {
    updateMemberMutation.mutate({ id: member.id, status: 'active' });
  };

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-4xl h-[600px]">
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="mt-2 text-sm text-muted-foreground">Loading cast members...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const activeCast = companyData?.currentCompany || [];
  const archivedCast = companyData?.archive || [];
  const selectedCount = selectedCast.size;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-4xl h-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Select Tour Cast
            </DialogTitle>
            <DialogDescription>
              Select exactly 12 cast members for this tour. Only active cast members can be selected.
            </DialogDescription>
            <div className="flex items-center justify-between pt-2">
              <Badge variant={selectedCount === 12 ? "default" : "secondary"}>
                {selectedCount}/12 selected
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowQuickAdd(true)}
                className="flex items-center gap-2"
              >
                <UserPlus className="h-4 w-4" />
                Quick Add
              </Button>
            </div>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 flex-1">
            {/* Active Cast */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">Active Cast ({activeCast.length})</h3>
                <Badge variant="outline">Selectable</Badge>
              </div>
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {activeCast.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          checked={selectedCast.has(member.id)}
                          onCheckedChange={() => toggleCastSelection(member.id)}
                          disabled={!selectedCast.has(member.id) && selectedCount >= 12}
                        />
                        <div>
                          <p className="font-medium">{member.name}</p>
                          <div className="flex gap-1 mt-1">
                            {member.eligibleRoles.map((role) => (
                              <Badge key={role} variant="secondary" className="text-xs">
                                {role}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => moveToArchive(member)}
                        disabled={updateMemberMutation.isPending}
                        title="Move to archive"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {activeCast.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="h-8 w-8 mx-auto mb-2" />
                      <p>No active cast members</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Archived Cast */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">Archived Cast ({archivedCast.length})</h3>
                <Badge variant="outline">
                  <Archive className="h-3 w-3 mr-1" />
                  Archive
                </Badge>
              </div>
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {archivedCast.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 border rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div>
                        <p className="font-medium text-muted-foreground">{member.name}</p>
                        <div className="flex gap-1 mt-1">
                          {member.eligibleRoles.map((role) => (
                            <Badge key={role} variant="outline" className="text-xs">
                              {role}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => moveToActive(member)}
                        disabled={updateMemberMutation.isPending}
                        title="Move to active"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {archivedCast.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Archive className="h-8 w-8 mx-auto mb-2" />
                      <p>No archived cast members</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirm}
              disabled={selectedCount !== 12}
            >
              Continue ({selectedCount}/12)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QuickAddCastModal
        isOpen={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        onSuccess={() => {
          // Refresh will happen automatically via react-query
        }}
      />
    </>
  );
}