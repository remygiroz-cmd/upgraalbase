import React, { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
    show_phone_in_directory: false,
    social_security_number: '',
    iban: '',
    bic: '',
    photo_url: '',
    gross_salary: '',
    gross_hourly_rate: '',
    payment_method: '',
    payslips: [],
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
    } else {
      setFormData({
        first_name: '',
        last_name: '',
        nickname: '',
        birth_date: '',
        birth_place: '',
        address: '',
        email: '',
        phone: '',
        show_phone_in_directory: false,
        social_security_number: '',
        iban: '',
        bic: '',
        photo_url: '',
        gross_salary: '',
        gross_hourly_rate: '',
        payment_method: '',
        payslips: [],
        is_active: true
      });
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

          <Tabs defaultValue="infos" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-gray-100">
              <TabsTrigger value="infos" className="data-[state=active]:bg-white">Informations</TabsTrigger>
              <TabsTrigger value="contrat" className="data-[state=active]:bg-white">Contrat</TabsTrigger>
              <TabsTrigger value="remuneration" className="data-[state=active]:bg-white">Rémunération</TabsTrigger>
            </TabsList>

            <TabsContent value="infos" className="space-y-4 mt-4">
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

          {/* Sexe et Nationalité */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-900">Sexe</Label>
              <Select
                value={formData.gender || ''}
                onValueChange={(value) => setFormData({ ...formData, gender: value })}
              >
                <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Homme</SelectItem>
                  <SelectItem value="female">Femme</SelectItem>
                  <SelectItem value="other">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-900">Nationalité</Label>
              <Input
                value={formData.nationality || ''}
                onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                placeholder="Nationalité"
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
                placeholder="+33 6 12 34 56 78"
              />
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  id="show_phone_in_directory"
                  checked={formData.show_phone_in_directory || false}
                  onChange={(e) => setFormData({ ...formData, show_phone_in_directory: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <Label htmlFor="show_phone_in_directory" className="text-xs text-gray-600 font-normal cursor-pointer">
                  Afficher le téléphone sur l'étiquette pour tous
                </Label>
              </div>
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
            </TabsContent>

            <TabsContent value="contrat" className="space-y-4 mt-4">
              {/* Poste et Équipe */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-900">Poste</Label>
                  <Input
                    value={formData.position || ''}
                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    placeholder="Ex: Cuisinier, Livreur..."
                    className="bg-white border-gray-300 text-gray-900"
                  />
                </div>
                <div>
                  <Label className="text-gray-900">Équipe</Label>
                  <Input
                    value={formData.team || ''}
                    onChange={(e) => setFormData({ ...formData, team: e.target.value })}
                    placeholder="Équipe"
                    className="bg-white border-gray-300 text-gray-900"
                  />
                </div>
              </div>

              {/* Type de contrat et Temps de travail */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-900">Type de contrat</Label>
                  <Select
                    value={formData.contract_type || ''}
                    onValueChange={(value) => setFormData({ ...formData, contract_type: value })}
                  >
                    <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cdi">CDI</SelectItem>
                      <SelectItem value="cdd">CDD</SelectItem>
                      <SelectItem value="extra">Extra</SelectItem>
                      <SelectItem value="apprenti">Alternant</SelectItem>
                      <SelectItem value="stage">Stage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-gray-900">Temps de travail</Label>
                  <Select
                    value={formData.work_time_type || ''}
                    onValueChange={(value) => setFormData({ ...formData, work_time_type: value })}
                  >
                    <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full_time">Temps plein</SelectItem>
                      <SelectItem value="part_time">Temps partiel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Dates de contrat */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-900">Date d'embauche</Label>
                  <Input
                    type="date"
                    value={formData.start_date || ''}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="bg-white border-gray-300 text-gray-900"
                  />
                </div>
                <div>
                  <Label className="text-gray-900">Date de fin de contrat</Label>
                  <Input
                    type="date"
                    value={formData.end_date || ''}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="bg-white border-gray-300 text-gray-900"
                    placeholder={formData.contract_type === 'cdd' ? 'Obligatoire pour CDD' : 'Optionnel'}
                  />
                </div>
              </div>

              {/* Heures contractuelles / mois */}
              <div>
                <Label className="text-gray-900">Heures contractuelles / mois</Label>
                <Input
                  type="text"
                  value={formData.contract_hours || ''}
                  onChange={(e) => setFormData({ ...formData, contract_hours: e.target.value })}
                  className="bg-white border-gray-300 text-gray-900"
                  placeholder="Ex: 151:40"
                />
              </div>

              {/* Heures contractuelles / semaine */}
              <div>
                <Label className="text-gray-900">Heures contractuelles / semaine</Label>
                <Input
                  type="text"
                  value={formData.contract_hours_weekly || ''}
                  onChange={(e) => setFormData({ ...formData, contract_hours_weekly: e.target.value })}
                  className="bg-white border-gray-300 text-gray-900"
                  placeholder="Ex: 35:00"
                />
              </div>

              {/* Nombre de jours de travail par semaine */}
              <div>
                <Label className="text-gray-900">Nombre de jours de travail par semaine</Label>
                <Input
                  type="number"
                  min="1"
                  max="7"
                  value={formData.work_days_per_week || ''}
                  onChange={(e) => setFormData({ ...formData, work_days_per_week: parseFloat(e.target.value) })}
                  className="bg-white border-gray-300 text-gray-900"
                  placeholder="Ex: 5"
                />
              </div>

              {/* Coefficient / Niveau */}
              <div>
                <Label className="text-gray-900">Coefficient / Niveau</Label>
                <Input
                  value={formData.coefficient_level || ''}
                  onChange={(e) => setFormData({ ...formData, coefficient_level: e.target.value })}
                  className="bg-white border-gray-300 text-gray-900"
                  placeholder="Ex: Niveau 2, Coef 150"
                />
              </div>

              {/* Responsable hiérarchique */}
              <div>
                <Label className="text-gray-900">Responsable hiérarchique</Label>
                <Input
                  value={formData.manager || ''}
                  onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
                  className="bg-white border-gray-300 text-gray-900"
                  placeholder="Nom du responsable"
                />
              </div>

              {/* Statut */}
              <div>
                <Label className="text-gray-900">Statut</Label>
                <Select
                  value={formData.is_active ? 'active' : 'archived'}
                  onValueChange={(value) => setFormData({ ...formData, is_active: value === 'active' })}
                >
                  <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Actif</SelectItem>
                    <SelectItem value="archived">Sorti (Archivé)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="remuneration" className="space-y-4 mt-4">
              {/* Salaire brut */}
              <div>
                <Label className="text-gray-900">Salaire brut mensuel (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.gross_salary || ''}
                  onChange={(e) => setFormData({ ...formData, gross_salary: parseFloat(e.target.value) || '' })}
                  className="bg-white border-gray-300 text-gray-900"
                  placeholder="Ex: 2500.00"
                />
              </div>

              {/* Taux horaire brut */}
              <div>
                <Label className="text-gray-900">Taux horaire brut (€/h)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.gross_hourly_rate || ''}
                  onChange={(e) => setFormData({ ...formData, gross_hourly_rate: parseFloat(e.target.value) || '' })}
                  className="bg-white border-gray-300 text-gray-900"
                  placeholder="Ex: 15.50"
                />
              </div>

              {/* Mode de paiement */}
              <div>
                <Label className="text-gray-900">Mode de paiement</Label>
                <Select
                  value={formData.payment_method || ''}
                  onValueChange={(value) => setFormData({ ...formData, payment_method: value })}
                >
                  <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="virement">Virement</SelectItem>
                    <SelectItem value="cheque">Chèque</SelectItem>
                    <SelectItem value="especes">Espèces</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* IBAN (copié depuis l'onglet Informations) */}
              <div>
                <Label className="text-gray-900">IBAN</Label>
                <Input
                  value={formData.iban || ''}
                  onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
                  className="bg-white border-gray-300 text-gray-900"
                  placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX"
                />
              </div>

              {/* Fiches de paie */}
              <div>
                <Label className="text-gray-900 mb-2 block">Fiches de paie</Label>
                
                {/* Liste des fiches existantes */}
                {formData.payslips && formData.payslips.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {formData.payslips.map((payslip, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-300 rounded-lg">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{payslip.month}</p>
                          <p className="text-xs text-gray-500">
                            Uploadée le {new Date(payslip.uploaded_at).toLocaleDateString('fr-FR')}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <a
                            href={payslip.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:text-blue-700 underline"
                          >
                            Télécharger
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              const newPayslips = formData.payslips.filter((_, i) => i !== index);
                              setFormData({ ...formData, payslips: newPayslips });
                            }}
                            className="text-xs text-red-600 hover:text-red-700"
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload nouvelle fiche */}
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                  <label className="cursor-pointer">
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600 mb-1">Ajouter une fiche de paie</p>
                    <p className="text-xs text-gray-500">PDF, max 10MB</p>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;

                        setUploading(true);
                        try {
                          const { file_url } = await base44.integrations.Core.UploadFile({ file });
                          const monthPrompt = prompt('Mois de la fiche de paie (ex: 2026-01)');
                          if (!monthPrompt) {
                            toast.error('Mois requis');
                            return;
                          }
                          
                          const newPayslip = {
                            month: monthPrompt,
                            file_url,
                            uploaded_at: new Date().toISOString(),
                            uploaded_by: formData.email
                          };

                          setFormData({
                            ...formData,
                            payslips: [...(formData.payslips || []), newPayslip]
                          });
                          toast.success('Fiche de paie ajoutée');
                        } catch (error) {
                          toast.error('Erreur lors du téléchargement');
                        } finally {
                          setUploading(false);
                        }
                      }}
                      disabled={uploading}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </TabsContent>
          </Tabs>

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