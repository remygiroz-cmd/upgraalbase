import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Users, Plus, Mail, UserX, UserCheck, Settings, Copy, CheckCircle2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/ui/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import InviteUserModal from '@/components/admin/InviteUserModal';
import UserPermissionsModal from '@/components/admin/UserPermissionsModal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { cn } from '@/lib/utils';

export default function GestionUtilisateurs() {
  const queryClient = useQueryClient();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list('-created_date')
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: () => base44.entities.Role.list('name')
  });

  const { data: invitations = [] } = useQuery({
    queryKey: ['invitations'],
    queryFn: async () => {
      const response = await base44.functions.invoke('getPendingInvitations');
      return response.data.invitations || [];
    }
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ userId, data }) => base44.functions.invoke('updateUser', { userId, data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      setConfirmAction(null);
      if (confirmAction?.type === 'disable') {
        toast.success('Utilisateur désactivé - il sera déconnecté automatiquement');
      } else if (confirmAction?.type === 'activate') {
        toast.success('Utilisateur réactivé avec succès');
      }
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId) => base44.functions.invoke('deleteUser', { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      setConfirmAction(null);
      toast.success('Utilisateur supprimé - il sera déconnecté automatiquement');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Erreur lors de la suppression');
    }
  });

  const [copiedInviteUrl, setCopiedInviteUrl] = useState(null);

  const resendInviteMutation = useMutation({
    mutationFn: (invitationId) => base44.functions.invoke('resendInvitation', { invitationId }),
    onSuccess: (response, invitationId) => {
      if (response.data.email_sent) {
        toast.success('Email d\'invitation renvoyé avec succès');
      } else {
        const inviteUrl = response.data.invite_url;
        navigator.clipboard.writeText(inviteUrl);
        setCopiedInviteUrl(invitationId);
        toast.warning('Lien copié - envoyez-le manuellement (email non envoyé)');
        setTimeout(() => setCopiedInviteUrl(null), 3000);
      }
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
    }
  });

  const deleteInvitationMutation = useMutation({
    mutationFn: (invitationId) => base44.entities.Invitation.delete(invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      toast.success('Invitation supprimée');
    }
  });

  const handleToggleStatus = (user) => {
    const newStatus = user.status === 'active' ? 'disabled' : 'active';
    setConfirmAction({
      type: newStatus === 'active' ? 'activate' : 'disable',
      user,
      onConfirm: () => updateUserMutation.mutate({
        userId: user.id,
        data: { status: newStatus }
      })
    });
  };

  const handleDeleteUser = (user) => {
    setConfirmAction({
      type: 'delete',
      user,
      onConfirm: () => deleteUserMutation.mutate(user.id)
    });
  };

  const getRoleName = (roleId) => {
    const role = roles.find(r => r.id === roleId);
    return role?.name || 'Aucun rôle';
  };

  const filteredUsers = users.filter(user =>
    user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.team?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loadingUsers) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        icon={Users}
        title="Gestion des utilisateurs"
        subtitle="Inviter et gérer les accès utilisateurs"
        actions={
          <Button
            onClick={() => setShowInviteModal(true)}
            className="bg-orange-600 hover:bg-orange-700 min-h-[44px]"
          >
            <Plus className="w-4 h-4 mr-2" />
            Inviter un utilisateur
          </Button>
        }
      />

      {/* Search */}
      <div className="mb-6">
        <Input
          type="search"
          placeholder="Rechercher un utilisateur..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-white border-gray-300 max-w-md"
        />
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Invitations en attente</h3>
          <div className="grid gap-3">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">
                    {inv.first_name} {inv.last_name}
                  </p>
                  <p className="text-sm text-gray-600">{inv.email}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Invité par {inv.invited_by_name}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resendInviteMutation.mutate(inv.id)}
                    disabled={resendInviteMutation.isPending}
                    className="border-amber-600 text-amber-700 hover:bg-amber-100"
                  >
                    {copiedInviteUrl === inv.id ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Copié !
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copier lien
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => deleteInvitationMutation.mutate(inv.id)}
                    disabled={deleteInvitationMutation.isPending}
                    className="border-red-300 text-red-600 hover:bg-red-50 min-h-[40px] min-w-[40px]"
                    title="Supprimer l'invitation"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Users List */}
      <div className="grid gap-4">
        {filteredUsers.map((user) => (
          <div
            key={user.id}
            className={cn(
              "bg-white rounded-xl border-2 p-4 sm:p-6 transition-all",
              user.status === 'active' ? "border-gray-200" : "border-gray-300 opacity-60"
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <h3 className="text-lg font-bold text-gray-900">{user.full_name}</h3>
                  <Badge
                    variant={user.status === 'active' ? 'default' : 'secondary'}
                    className={cn(
                      user.status === 'active' && "bg-green-100 text-green-700 border-green-300",
                      user.status === 'invited' && "bg-amber-100 text-amber-700 border-amber-300",
                      user.status === 'disabled' && "bg-red-100 text-red-700 border-red-300"
                    )}
                  >
                    {user.status === 'active' && 'Actif'}
                    {user.status === 'invited' && 'Invité'}
                    {user.status === 'disabled' && 'Désactivé'}
                  </Badge>
                  {user.role === 'admin' && (
                    <Badge className="bg-purple-100 text-purple-700 border-purple-300">
                      Admin
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-gray-600">{user.email}</p>
                {user.team && (
                  <p className="text-sm text-gray-500 mt-1">Équipe : {user.team}</p>
                )}
                <p className="text-xs text-gray-500 mt-2">
                  Rôle : <span className="font-medium">{getRoleName(user.role_id)}</span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setSelectedUser(user);
                    setShowPermissionsModal(true);
                  }}
                  className="border-gray-300 hover:bg-gray-50 min-h-[44px] min-w-[44px]"
                  title="Permissions"
                >
                  <Settings className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleToggleStatus(user)}
                  className={cn(
                    "min-h-[44px] min-w-[44px]",
                    user.status === 'active'
                      ? "border-red-300 hover:bg-red-50 text-red-600"
                      : "border-green-300 hover:bg-green-50 text-green-600"
                  )}
                  title={user.status === 'active' ? 'Désactiver' : 'Activer'}
                >
                  {user.status === 'active' ? (
                    <UserX className="w-4 h-4" />
                  ) : (
                    <UserCheck className="w-4 h-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleDeleteUser(user)}
                  className="border-red-300 hover:bg-red-50 text-red-600 min-h-[44px] min-w-[44px]"
                  title="Supprimer définitivement"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <InviteUserModal
        open={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        roles={roles}
      />

      <UserPermissionsModal
        open={showPermissionsModal}
        onClose={() => {
          setShowPermissionsModal(false);
          setSelectedUser(null);
        }}
        user={selectedUser}
        roles={roles}
      />

      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={
          confirmAction?.type === 'activate' ? 'Activer l\'utilisateur' :
          confirmAction?.type === 'delete' ? 'Supprimer l\'utilisateur' :
          'Désactiver l\'utilisateur'
        }
        description={
          confirmAction?.type === 'activate'
            ? `Activer le compte de ${confirmAction?.user?.full_name} ?`
            : confirmAction?.type === 'delete'
            ? `Supprimer définitivement ${confirmAction?.user?.full_name} ? Cette action est irréversible et l'utilisateur sera immédiatement déconnecté.`
            : `Désactiver le compte de ${confirmAction?.user?.full_name} ? L'utilisateur ne pourra plus se connecter.`
        }
        onConfirm={confirmAction?.onConfirm}
        variant={confirmAction?.type === 'delete' ? 'danger' : confirmAction?.type === 'activate' ? 'info' : 'warning'}
        confirmText={
          confirmAction?.type === 'activate' ? 'Activer' :
          confirmAction?.type === 'delete' ? 'Supprimer' :
          'Désactiver'
        }
      />
    </div>
  );
}