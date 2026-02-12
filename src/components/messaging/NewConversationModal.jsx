import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, User, Users as UsersIcon, Building2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { cn } from '@/lib/utils';

export default function NewConversationModal({ 
  open, 
  onOpenChange, 
  currentEmployee,
  employees 
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('privee');
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [title, setTitle] = useState('');
  
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Filter available employees
  const availableEmployees = useMemo(() => {
    if (!currentEmployee) return [];
    
    return employees
      .filter(emp => 
        emp.id !== currentEmployee.id && 
        emp.is_active !== false &&
        emp.user_id // Only show employees with linked accounts
      )
      .filter(emp => {
        if (!searchTerm) return true;
        const search = searchTerm.toLowerCase();
        return (
          emp.first_name?.toLowerCase().includes(search) ||
          emp.last_name?.toLowerCase().includes(search) ||
          emp.email?.toLowerCase().includes(search)
        );
      });
  }, [employees, currentEmployee, searchTerm]);

  // Get all conversations to check for duplicates
  const { data: allConversations = [] } = useQuery({
    queryKey: ['allConversations'],
    queryFn: () => base44.entities.Conversation.list(),
    enabled: open
  });

  const createConversationMutation = useMutation({
    mutationFn: async (data) => {
      // For private conversations, check for duplicates
      if (data.type === 'privee') {
        const participantSet = new Set(data.participant_employee_ids);
        const existingPrivate = allConversations.find(conv => {
          if (conv.type !== 'privee') return false;
          const convSet = new Set(conv.participant_employee_ids || []);
          return convSet.size === participantSet.size && 
                 [...participantSet].every(id => convSet.has(id));
        });

        if (existingPrivate) {
          return existingPrivate; // Return existing instead of creating
        }
      }

      return await base44.entities.Conversation.create(data);
    },
    onSuccess: (conv) => {
      queryClient.invalidateQueries({ queryKey: ['myConversations'] });
      queryClient.invalidateQueries({ queryKey: ['allConversations'] });
      
      const isExisting = !conv.created_date || 
                        new Date() - new Date(conv.created_date) > 5000;
      
      if (isExisting) {
        toast.success('Conversation ouverte');
      } else {
        toast.success('Conversation créée');
      }
      
      onOpenChange(false);
      navigate(createPageUrl('Conversation') + '?id=' + conv.id);
      resetForm();
    },
    onError: () => {
      toast.error('Erreur lors de la création');
    }
  });

  const resetForm = () => {
    setSearchTerm('');
    setSelectedType('privee');
    setSelectedEmployees([]);
    setTitle('');
  };

  const handleCreate = () => {
    if (selectedEmployees.length === 0) {
      toast.error('Sélectionnez au moins un participant');
      return;
    }

    const participantIds = [currentEmployee.id, ...selectedEmployees];

    const conversationData = {
      type: selectedType,
      participant_employee_ids: participantIds,
      created_by_employee_id: currentEmployee.id
    };

    // Auto-generate title for private conversations
    if (selectedType === 'privee' && !title.trim()) {
      const otherEmployees = employees.filter(emp => selectedEmployees.includes(emp.id));
      const names = otherEmployees.map(emp => emp.first_name).join(' & ');
      conversationData.title = `${currentEmployee.first_name} & ${names}`;
    } else if (title.trim()) {
      conversationData.title = title.trim();
    }

    createConversationMutation.mutate(conversationData);
  };

  const toggleEmployee = (empId) => {
    setSelectedEmployees(prev => 
      prev.includes(empId) 
        ? prev.filter(id => id !== empId)
        : [...prev, empId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouvelle conversation</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type selection */}
          <div>
            <Label>Type de conversation</Label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="privee">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Privée
                  </div>
                </SelectItem>
                <SelectItem value="equipe">
                  <div className="flex items-center gap-2">
                    <UsersIcon className="w-4 h-4" />
                    Équipe
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Title (optional) */}
          <div>
            <Label>Titre (optionnel)</Label>
            <Input
              placeholder="Ex: Équipe Livraison"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1"
            />
          </div>

          {/* Search employees */}
          <div>
            <Label>Participants</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Rechercher un employé..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Employee list */}
          <div className="border rounded-lg max-h-64 overflow-y-auto">
            {availableEmployees.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">
                Aucun employé trouvé
              </div>
            ) : (
              <div className="divide-y">
                {availableEmployees.map(emp => (
                  <button
                    key={emp.id}
                    onClick={() => toggleEmployee(emp.id)}
                    className={cn(
                      "w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center gap-3",
                      selectedEmployees.includes(emp.id) && "bg-blue-50"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold",
                      selectedEmployees.includes(emp.id) ? "bg-blue-600" : "bg-gray-400"
                    )}>
                      {emp.first_name?.charAt(0)}{emp.last_name?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">
                        {emp.first_name} {emp.last_name}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {emp.position || emp.email}
                      </p>
                    </div>
                    {selectedEmployees.includes(emp.id) && (
                      <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected count */}
          {selectedEmployees.length > 0 && (
            <p className="text-xs text-gray-600">
              {selectedEmployees.length} participant{selectedEmployees.length > 1 ? 's' : ''} sélectionné{selectedEmployees.length > 1 ? 's' : ''}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleCreate}
              disabled={selectedEmployees.length === 0 || createConversationMutation.isPending}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              Créer
            </Button>
            <Button
              onClick={() => {
                onOpenChange(false);
                resetForm();
              }}
              variant="outline"
            >
              Annuler
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}