import React, { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function EmployeeFormModal({ open, onClose, employee }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState(employee || {
    first_name: '',
    last_name: '',
    birth_date: '',
    birth_place: '',
    address: '',
    email: '',
    phone: '',
    social_security_number: '',
    iban: ''
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Employee.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Employé créé avec succès');
      onClose();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Employee.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Employé mis à jour');
      onClose();
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (employee) {
      updateMutation.mutate({ id: employee.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white border-gray-300 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gray-900">
            {employee ? 'Modifier l\'employé' : 'Nouvel employé'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nom et prénom */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-900">Nom *</Label>
              <Input
                required
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                className="bg-white border-gray-300 text-gray-900"
              />
            </div>
            <div>
              <Label className="text-gray-900">Prénom *</Label>
              <Input
                required
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                className="bg-white border-gray-300 text-gray-900"
              />
            </div>
          </div>

          {/* Date et lieu de naissance */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-900">Date de naissance</Label>
              <Input
                type="date"
                value={formData.birth_date}
                onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                className="bg-white border-gray-300 text-gray-900"
              />
            </div>
            <div>
              <Label className="text-gray-900">Lieu de naissance</Label>
              <Input
                value={formData.birth_place}
                onChange={(e) => setFormData({ ...formData, birth_place: e.target.value })}
                className="bg-white border-gray-300 text-gray-900"
              />
            </div>
          </div>

          {/* Adresse postale */}
          <div>
            <Label className="text-gray-900">Adresse postale</Label>
            <Input
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="bg-white border-gray-300 text-gray-900"
            />
          </div>

          {/* Email et téléphone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-900">Email *</Label>
              <Input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="bg-white border-gray-300 text-gray-900"
              />
            </div>
            <div>
              <Label className="text-gray-900">Téléphone</Label>
              <Input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="bg-white border-gray-300 text-gray-900"
              />
            </div>
          </div>

          {/* Numéro de sécurité sociale */}
          <div>
            <Label className="text-gray-900">Numéro de sécurité sociale</Label>
            <Input
              value={formData.social_security_number}
              onChange={(e) => setFormData({ ...formData, social_security_number: e.target.value })}
              className="bg-white border-gray-300 text-gray-900"
              placeholder="1 23 45 67 890 123 45"
            />
          </div>

          {/* RIB */}
          <div>
            <Label className="text-gray-900">IBAN</Label>
            <Input
              value={formData.iban}
              onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
              className="bg-white border-gray-300 text-gray-900"
              placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-gray-300 text-gray-900"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {employee ? 'Mettre à jour' : 'Créer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}