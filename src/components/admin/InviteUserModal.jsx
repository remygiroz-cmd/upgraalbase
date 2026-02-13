import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Mail, Copy, CheckCircle2, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function InviteUserModal({ open, onClose, roles }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('personnel');
  const [form, setForm] = useState({
    email: '',
    first_name: '',
    last_name: '',
    role_id: '',
    team: '',
    notes: ''
  });
  const [selectedEmployees, setSelectedEmployees] = useState([]);

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-no-user'],
    queryFn: async () => {
      const allEmployees = await base44.entities.Employee.filter({ is_active: true });
      return allEmployees.filter(emp => !emp.user_id && emp.email);
    },
    enabled: open
  });

  const [inviteUrl, setInviteUrl] = React.useState('');
  const [showSuccess, setShowSuccess] = React.useState(false);
  const [emailSent, setEmailSent] = React.useState(false);
  const [successMessage, setSuccessMessage] = React.useState('');

  const inviteMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.functions.invoke('inviteUser', data);
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['employees-no-user'] });
      setInviteUrl(response.data.invite_url);
      setEmailSent(response.data.email_sent);
      setShowSuccess(true);
      setSuccessMessage('Email d\'invitation envoyé avec succès');
      if (response.data.email_sent) {
        toast.success('Email d\'invitation envoyé avec succès');
      }
    }
  });

  const bulkInviteMutation = useMutation({
    mutationFn: async (employeesData) => {
      const results = await Promise.all(
        employeesData.map(emp => 
          base44.functions.invoke('inviteUser', emp)
        )
      );
      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['employees-no-user'] });
      
      const successCount = results.filter(r => r.data?.email_sent).length;
      setShowSuccess(true);
      setEmailSent(true);
      setSuccessMessage(`${successCount}/${results.length} invitation(s) envoyée(s) avec succès`);
      toast.success(`${successCount}/${results.length} invitation(s) envoyée(s)`);
    },
    onError: (error) => {
      toast.error('Erreur lors de l\'envoi des invitations');
    }
  });

  const handleClose = () => {
    onClose();
    setShowSuccess(false);
    setInviteUrl('');
    setEmailSent(false);
    setSuccessMessage('');
    setSelectedEmployees([]);
    setActiveTab('personnel');
    setForm({
      email: '',
      first_name: '',
      last_name: '',
      role_id: '',
      team: '',
      notes: ''
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    inviteMutation.mutate({
      ...form,
      invited_by: currentUser?.email,
      invited_by_name: currentUser?.full_name || currentUser?.email
    });
  };

  const handleBulkInvite = () => {
    if (selectedEmployees.length === 0) {
      toast.error('Veuillez sélectionner au moins un employé');
      return;
    }

    const employeesData = selectedEmployees.map(empId => {
      const emp = employees.find(e => e.id === empId);
      return {
        email: emp.email,
        first_name: emp.first_name,
        last_name: emp.last_name,
        role_id: emp.role_id || roles[0]?.id,
        team: emp.team || '',
        notes: '',
        invited_by: currentUser?.email,
        invited_by_name: currentUser?.full_name || currentUser?.email
      };
    });

    bulkInviteMutation.mutate(employeesData);
  };

  const toggleEmployee = (empId) => {
    setSelectedEmployees(prev => 
      prev.includes(empId) 
        ? prev.filter(id => id !== empId)
        : [...prev, empId]
    );
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(inviteUrl);
    toast.success('Lien copié dans le presse-papier');
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-slate-800 border-slate-700 max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {showSuccess ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                Invitation(s) envoyée(s)
              </>
            ) : (
              <>
                <Mail className="w-5 h-5 text-orange-500" />
                Inviter un utilisateur
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {showSuccess ? (
          <div className="space-y-4">
            <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-4">
              <p className="text-sm text-green-400">
                {successMessage}
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleClose}
                className="bg-slate-700 hover:bg-slate-600"
              >
                Fermer
              </Button>
            </div>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2 bg-slate-700">
              <TabsTrigger value="personnel" className="data-[state=active]:bg-orange-600">
                <Users className="w-4 h-4 mr-2" />
                Depuis Personnel ({employees.length})
              </TabsTrigger>
              <TabsTrigger value="manuel" className="data-[state=active]:bg-orange-600">
                <UserPlus className="w-4 h-4 mr-2" />
                Invitation manuelle
              </TabsTrigger>
            </TabsList>

            <TabsContent value="personnel" className="space-y-4 mt-4">
              {employees.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Aucun employé sans compte utilisateur</p>
                  <p className="text-sm mt-1">Tous les employés ont déjà un compte ou n'ont pas d'email renseigné</p>
                </div>
              ) : (
                <>
                  <div className="bg-slate-700/50 rounded-lg p-3 mb-3">
                    <p className="text-sm text-slate-300">
                      Sélectionnez les employés à inviter ({selectedEmployees.length} sélectionné{selectedEmployees.length > 1 ? 's' : ''})
                    </p>
                  </div>
                  
                  <div className="max-h-96 overflow-y-auto space-y-2">
                    {employees.map((emp) => (
                      <div
                        key={emp.id}
                        onClick={() => toggleEmployee(emp.id)}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
                          selectedEmployees.includes(emp.id)
                            ? "bg-orange-500/10 border-orange-500"
                            : "bg-slate-700/50 border-slate-600 hover:border-slate-500"
                        )}
                      >
                        <Checkbox
                          checked={selectedEmployees.includes(emp.id)}
                          onCheckedChange={() => toggleEmployee(emp.id)}
                          className="border-slate-500"
                        />
                        <div className="flex-1">
                          <p className="font-medium text-slate-100">
                            {emp.first_name} {emp.last_name}
                          </p>
                          <p className="text-sm text-slate-400">{emp.email}</p>
                          {emp.team && (
                            <p className="text-xs text-slate-500 mt-1">Équipe: {emp.team}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleClose}
                      className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700"
                    >
                      Annuler
                    </Button>
                    <Button
                      type="button"
                      onClick={handleBulkInvite}
                      disabled={selectedEmployees.length === 0 || bulkInviteMutation.isPending}
                      className="bg-orange-600 hover:bg-orange-700"
                    >
                      {bulkInviteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Envoyer {selectedEmployees.length > 0 && `(${selectedEmployees.length})`}
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="manuel" className="mt-4">
              <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="first_name">Prénom *</Label>
              <Input
                id="first_name"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                className="bg-slate-700 border-slate-600 mt-1"
                required
              />
            </div>
            <div>
              <Label htmlFor="last_name">Nom *</Label>
              <Input
                id="last_name"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                className="bg-slate-700 border-slate-600 mt-1"
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="bg-slate-700 border-slate-600 mt-1"
              placeholder="email@example.com"
              required
            />
          </div>

          <div>
            <Label htmlFor="role">Rôle *</Label>
            <Select
              value={form.role_id}
              onValueChange={(value) => setForm({ ...form, role_id: value })}
              required
            >
              <SelectTrigger className="bg-slate-700 border-slate-600 mt-1">
                <SelectValue placeholder="Sélectionner un rôle..." />
              </SelectTrigger>
              <SelectContent className="bg-slate-700 border-slate-600">
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="team">Équipe</Label>
            <Input
              id="team"
              value={form.team}
              onChange={(e) => setForm({ ...form, team: e.target.value })}
              className="bg-slate-700 border-slate-600 mt-1"
              placeholder="Ex: Cuisine, Service, Plonge..."
            />
          </div>

          <div>
            <Label htmlFor="notes">Notes (optionnel)</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="bg-slate-700 border-slate-600 mt-1"
              placeholder="Notes internes..."
              rows={3}
            />
          </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700"
                  >
                    Annuler
                  </Button>
                  <Button
                    type="submit"
                    disabled={inviteMutation.isPending}
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    {inviteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Créer l'invitation
                  </Button>
                </div>
              </form>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}