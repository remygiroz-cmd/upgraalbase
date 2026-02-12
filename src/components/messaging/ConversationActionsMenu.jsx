import React, { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MoreVertical, LogOut, Trash2, AlertTriangle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function ConversationActionsMenu({ 
  conversation, 
  currentEmployee, 
  currentUser,
  isInConversationPage = false
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPermanentDeleteDialog, setShowPermanentDeleteDialog] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const canDeletePermanently = currentUser?.role === 'admin' || currentEmployee?.permission_level === 'manager';

  // Get or create conversation member
  const getOrCreateMemberMutation = useMutation({
    mutationFn: async ({ conversationId, employeeId }) => {
      const members = await base44.entities.ConversationMember.filter({
        conversation_id: conversationId,
        employee_id: employeeId
      });
      
      if (members.length > 0) {
        return members[0];
      }
      
      return await base44.entities.ConversationMember.create({
        conversation_id: conversationId,
        employee_id: employeeId,
        joined_at: new Date().toISOString()
      });
    }
  });

  // Leave conversation
  const leaveMutation = useMutation({
    mutationFn: async () => {
      const member = await getOrCreateMemberMutation.mutateAsync({
        conversationId: conversation.id,
        employeeId: currentEmployee.id
      });

      return await base44.entities.ConversationMember.update(member.id, {
        left_at: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myConversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversationMembers'] });
      toast.success('Vous avez quitté la conversation');
      if (isInConversationPage) {
        navigate(createPageUrl('Home'));
      }
    },
    onError: () => {
      toast.error('Erreur lors de la sortie');
    }
  });

  // Delete for me
  const deleteForMeMutation = useMutation({
    mutationFn: async () => {
      const member = await getOrCreateMemberMutation.mutateAsync({
        conversationId: conversation.id,
        employeeId: currentEmployee.id
      });

      return await base44.entities.ConversationMember.update(member.id, {
        is_hidden: true,
        hidden_at: new Date().toISOString(),
        left_at: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myConversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversationMembers'] });
      toast.success('Conversation supprimée (restaurable)');
      if (isInConversationPage) {
        navigate(createPageUrl('Home'));
      }
    },
    onError: () => {
      toast.error('Erreur lors de la suppression');
    }
  });

  // Permanent delete (admin only)
  const permanentDeleteMutation = useMutation({
    mutationFn: async () => {
      return await base44.entities.Conversation.update(conversation.id, {
        status: 'deleted',
        deleted_at: new Date().toISOString(),
        deleted_by_employee_id: currentEmployee.id
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myConversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Conversation supprimée définitivement');
      if (isInConversationPage) {
        navigate(createPageUrl('Home'));
      }
    },
    onError: () => {
      toast.error('Erreur lors de la suppression définitive');
    }
  });

  const handleLeave = () => {
    leaveMutation.mutate();
    setShowLeaveDialog(false);
  };

  const handleDeleteForMe = () => {
    deleteForMeMutation.mutate();
    setShowDeleteDialog(false);
  };

  const handlePermanentDelete = () => {
    if (confirmText !== 'SUPPRIMER') {
      toast.error('Veuillez taper "SUPPRIMER" pour confirmer');
      return;
    }
    permanentDeleteMutation.mutate();
    setShowPermanentDeleteDialog(false);
    setConfirmText('');
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="p-2 hover:bg-gray-100 rounded-full">
            <MoreVertical className="w-5 h-5 text-gray-600" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setShowLeaveDialog(true)}>
            <LogOut className="w-4 h-4 mr-2" />
            Quitter la conversation
          </DropdownMenuItem>
          
          <DropdownMenuItem onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="w-4 h-4 mr-2" />
            Supprimer pour moi
          </DropdownMenuItem>

          {canDeletePermanently && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => setShowPermanentDeleteDialog(true)}
                className="text-red-600 focus:text-red-600"
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                Supprimer définitivement
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Leave Dialog */}
      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quitter la conversation</DialogTitle>
            <DialogDescription>
              La conversation disparaîtra de votre liste mais restera accessible aux autres participants.
              Vous pourrez la rejoindre à nouveau plus tard.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeaveDialog(false)}>
              Annuler
            </Button>
            <Button onClick={handleLeave}>
              Quitter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete For Me Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer pour moi</DialogTitle>
            <DialogDescription>
              Cette conversation sera masquée et vous en sortirez automatiquement.
              Vous pourrez la restaurer depuis la section "Conversations supprimées".
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDeleteForMe}>
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permanent Delete Dialog */}
      <Dialog open={showPermanentDeleteDialog} onOpenChange={setShowPermanentDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Suppression définitive
            </DialogTitle>
            <DialogDescription className="space-y-3">
              <p className="font-semibold text-gray-900">
                ⚠️ Cette action est irréversible et affectera TOUS les participants.
              </p>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>La conversation disparaîtra pour tous les utilisateurs</li>
                <li>Aucun nouveau message ne pourra être envoyé</li>
                <li>Les données seront conservées pour audit interne uniquement</li>
              </ul>
              <p className="text-sm font-medium">
                Tapez <span className="font-mono bg-gray-100 px-1">SUPPRIMER</span> pour confirmer :
              </p>
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Tapez SUPPRIMER"
            className="font-mono"
          />
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowPermanentDeleteDialog(false);
                setConfirmText('');
              }}
            >
              Annuler
            </Button>
            <Button 
              variant="destructive" 
              onClick={handlePermanentDelete}
              disabled={confirmText !== 'SUPPRIMER'}
            >
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}