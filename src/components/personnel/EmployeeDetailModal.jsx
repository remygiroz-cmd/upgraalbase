import React, { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { User, Mail, Phone, MapPin, Calendar, CreditCard, Shield, Pencil, Trash2, Archive } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { cn } from '@/lib/utils';

export default function EmployeeDetailModal({ employee, onClose, onEdit }) {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

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

  return (
    <>
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="bg-white border-gray-300 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Détails de l'employé</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Photo et nom */}
            <div className="flex items-center gap-4">
              {employee.photo_url ? (
                <img
                  src={employee.photo_url}
                  alt={`${employee.first_name} ${employee.last_name}`}
                  className="w-20 h-20 rounded-full object-cover"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center">
                  <User className="w-10 h-10 text-orange-600" />
                </div>
              )}
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {employee.first_name} {employee.last_name}
                </h2>
                {employee.position && (
                  <p className="text-gray-600">{employee.position}</p>
                )}
                {!employee.is_active && (
                  <span className="inline-block mt-1 px-2 py-1 bg-gray-200 text-gray-600 text-xs rounded-full">
                    Archivé
                  </span>
                )}
              </div>
            </div>

            {/* Informations personnelles */}
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">
                Informations personnelles
              </h3>
              
              {employee.birth_date && (
                <InfoRow icon={Calendar} label="Date de naissance">
                  {format(new Date(employee.birth_date), 'dd MMMM yyyy', { locale: fr })}
                </InfoRow>
              )}
              
              {employee.birth_place && (
                <InfoRow icon={MapPin} label="Lieu de naissance">
                  {employee.birth_place}
                </InfoRow>
              )}
              
              {employee.address && (
                <InfoRow icon={MapPin} label="Adresse">
                  {employee.address}
                </InfoRow>
              )}
            </div>

            {/* Contact */}
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">
                Contact
              </h3>
              
              {employee.email && (
                <InfoRow icon={Mail} label="Email">
                  <a href={`mailto:${employee.email}`} className="text-orange-600 hover:underline">
                    {employee.email}
                  </a>
                </InfoRow>
              )}
              
              {employee.phone && (
                <InfoRow icon={Phone} label="Téléphone">
                  <a href={`tel:${employee.phone}`} className="text-orange-600 hover:underline">
                    {employee.phone}
                  </a>
                </InfoRow>
              )}
            </div>

            {/* Informations administratives */}
            {(employee.social_security_number || employee.iban) && (
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">
                  Informations administratives
                </h3>
                
                {employee.social_security_number && (
                  <InfoRow icon={Shield} label="N° Sécurité sociale">
                    {employee.social_security_number}
                  </InfoRow>
                )}
                
                {employee.iban && (
                  <InfoRow icon={CreditCard} label="IBAN">
                    {employee.iban}
                  </InfoRow>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-200">
              <Button
                onClick={onEdit}
                className="flex-1 bg-orange-600 hover:bg-orange-700"
              >
                <Pencil className="w-4 h-4 mr-2" />
                Modifier
              </Button>
              <Button
                onClick={() => setConfirmArchive(true)}
                variant="outline"
                className={cn(
                  "flex-1",
                  employee.is_active 
                    ? "border-gray-400 text-gray-700 hover:bg-gray-100"
                    : "border-orange-400 text-orange-700 hover:bg-orange-50"
                )}
              >
                <Archive className="w-4 h-4 mr-2" />
                {employee.is_active ? 'Archiver' : 'Réactiver'}
              </Button>
              <Button
                onClick={() => setConfirmDelete(true)}
                variant="outline"
                className="border-red-400 text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Supprimer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete */}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Supprimer l'employé"
        description={`Êtes-vous sûr de vouloir supprimer ${employee.first_name} ${employee.last_name} ? Cette action est irréversible.`}
        onConfirm={() => deleteMutation.mutate(employee.id)}
        variant="danger"
        confirmText="Supprimer"
      />

      {/* Confirm Archive */}
      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title={employee.is_active ? "Archiver l'employé" : "Réactiver l'employé"}
        description={
          employee.is_active 
            ? `Voulez-vous archiver ${employee.first_name} ${employee.last_name} ? Il n'apparaîtra plus dans la liste active.`
            : `Voulez-vous réactiver ${employee.first_name} ${employee.last_name} ?`
        }
        onConfirm={() => archiveMutation.mutate({ id: employee.id, archive: employee.is_active })}
        variant="warning"
        confirmText={employee.is_active ? "Archiver" : "Réactiver"}
      />
    </>
  );
}

function InfoRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm text-gray-900">{children}</p>
      </div>
    </div>
  );
}