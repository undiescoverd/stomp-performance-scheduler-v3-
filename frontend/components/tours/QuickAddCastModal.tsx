import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/components/ui/use-toast';
import { UserPlus } from 'lucide-react';
import backend from '~backend/client';
import type { Role } from '~backend/scheduler/types';

const ROLES: Role[] = ["Sarge", "Potato", "Mozzie", "Ringo", "Particle", "Bin", "Cornish", "Who"];
const FEMALE_ONLY_ROLES: Role[] = ["Bin", "Cornish"];

interface QuickAddCastModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function QuickAddCastModal({ isOpen, onClose, onSuccess }: QuickAddCastModalProps) {
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [eligibleRoles, setEligibleRoles] = useState<Role[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const addMemberMutation = useMutation({
    mutationFn: (data: { name: string; eligibleRoles: Role[]; status: 'active' }) =>
      backend.scheduler.addMember(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company'] });
      queryClient.invalidateQueries({ queryKey: ['cast-members'] });
      toast({
        title: "Success",
        description: `${name} has been added to the cast`
      });
      handleClose();
      onSuccess?.();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to add cast member. Please try again.",
        variant: "destructive"
      });
    }
  });

  const handleClose = () => {
    setName('');
    setGender('male');
    setEligibleRoles([]);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast({
        title: "Error",
        description: "Please enter a name",
        variant: "destructive"
      });
      return;
    }

    if (eligibleRoles.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one role",
        variant: "destructive"
      });
      return;
    }

    // Validate gender restrictions
    const hasFemalOnlyRoles = eligibleRoles.some(role => FEMALE_ONLY_ROLES.includes(role));
    if (hasFemalOnlyRoles && gender === 'male') {
      toast({
        title: "Error",
        description: "Bin and Cornish roles are only available for female cast members",
        variant: "destructive"
      });
      return;
    }

    addMemberMutation.mutate({
      name: name.trim().toUpperCase(),
      eligibleRoles,
      status: 'active'
    });
  };

  const handleRoleToggle = (role: Role) => {
    setEligibleRoles(prev => {
      if (prev.includes(role)) {
        return prev.filter(r => r !== role);
      } else {
        // Check gender restrictions
        if (FEMALE_ONLY_ROLES.includes(role) && gender === 'male') {
          toast({
            title: "Cannot select role",
            description: `${role} is only available for female cast members`,
            variant: "destructive"
          });
          return prev;
        }
        return [...prev, role];
      }
    });
  };

  const handleGenderChange = (newGender: 'male' | 'female') => {
    setGender(newGender);
    
    // Remove female-only roles if switching to male
    if (newGender === 'male') {
      setEligibleRoles(prev => prev.filter(role => !FEMALE_ONLY_ROLES.includes(role)));
    }
  };

  const getAvailableRoles = () => {
    return ROLES.filter(role => {
      if (FEMALE_ONLY_ROLES.includes(role)) {
        return gender === 'female';
      }
      return true;
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add New Cast Member
          </DialogTitle>
          <DialogDescription>
            Quickly add a new cast member to the company
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter cast member name"
              required
            />
          </div>

          <div className="space-y-3">
            <Label>Gender</Label>
            <RadioGroup 
              value={gender} 
              onValueChange={handleGenderChange}
              className="flex gap-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="male" id="male" />
                <Label htmlFor="male">Male</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="female" id="female" />
                <Label htmlFor="female">Female</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-3">
            <Label>Eligible Roles</Label>
            <div className="grid grid-cols-2 gap-3">
              {getAvailableRoles().map((role) => (
                <div key={role} className="flex items-center space-x-2">
                  <Checkbox
                    id={role}
                    checked={eligibleRoles.includes(role)}
                    onCheckedChange={() => handleRoleToggle(role)}
                  />
                  <Label 
                    htmlFor={role} 
                    className={`text-sm ${FEMALE_ONLY_ROLES.includes(role) ? 'text-pink-600 font-medium' : ''}`}
                  >
                    {role}
                  </Label>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="text-pink-600">Bin and Cornish</span> are female-only roles
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={addMemberMutation.isPending}
            >
              {addMemberMutation.isPending ? 'Adding...' : 'Add Cast Member'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}