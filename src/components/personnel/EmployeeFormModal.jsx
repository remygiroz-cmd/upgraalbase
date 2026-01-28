import React, { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Trash2, Archive, Upload, User } from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export default function EmployeeFormModal({ open, onClose, employee }) {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState(employee || {
    first_name: '',
    last_name: '',
    nickname: '',
    birth_date: '',
    birth_place: '',
    address: '',
    email: '',
    phone: '',
    social_security_number: '',
    iban: '',
    photo_url: '',
    is_active: true
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

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Employee.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Employé supprimé');
      onClose();
    }
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, archive }) => base44.entities.Employee.update(id, { is_active: !archive }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success(variables.archive ? 'Employé archivé' : 'Employé réactivé');
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

  React.useEffect(() => {
    if (employee) {
      setFormData(employee);
    }
  }, [employee]);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFormData({ ...formData, photo_url: file_url });
      toast.success('Photo téléchargée');
    } catch (error) {
      toast.error('Erreur lors du téléchargement');
    } finally {
      setUploading(false);
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
          {/* Photo */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-100 border-2 border-gray-300">
                {formData.photo_url ? (
                  <img 
                    src={formData.photo_url} 
                    alt="Photo" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <User className="w-12 h-12 text-gray-400" />
                  </div>
                )}
              </div>
              <label className="absolute bottom-0 right-0 bg-orange-600 hover:bg-orange-700 text-white rounded-full p-2 cursor-pointer shadow-lg">
                <Upload className="w-4 h-4" />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            </div>
          </div>

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

          {/* Surnom */}
          <div>
            <Label className="text-gray-900">Surnom</Label>
            <Input
              value={formData.nickname || ''}
              onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
              placeholder="Surnom de l'employé"
              className="bg-white border-gray-300 text-gray-900"
            />
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
          <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-200">
            {employee && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmArchive(true)}
                  className="border-gray-400 text-gray-700 hover:bg-gray-100"
                >
                  <Archive className="w-4 h-4 mr-2" />
                  {employee.is_active ? 'Archiver' : 'Réactiver'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmDelete(true)}
                  className="border-red-400 text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Supprimer
                </Button>
              </>
            )}
            <div className="flex-1" />
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

      {/* Confirm Delete */}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Supprimer l'employé"
        description={`Êtes-vous sûr de vouloir supprimer ${employee?.first_name} ${employee?.last_name} ? Cette action est irréversible.`}
        onConfirm={() => deleteMutation.mutate(employee.id)}
        variant="danger"
        confirmText="Supprimer"
      />

      {/* Confirm Archive */}
      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title={employee?.is_active ? "Archiver l'employé" : "Réactiver l'employé"}
        description={
          employee?.is_active 
            ? `Voulez-vous archiver ${employee?.first_name} ${employee?.last_name} ? Il n'apparaîtra plus dans la liste active.`
            : `Voulez-vous réactiver ${employee?.first_name} ${employee?.last_name} ?`
        }
        onConfirm={() => archiveMutation.mutate({ id: employee.id, archive: employee.is_active })}
        variant="warning"
        confirmText={employee?.is_active ? "Archiver" : "Réactiver"}
      />
    </Dialog>
  );
}