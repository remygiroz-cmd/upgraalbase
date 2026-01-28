import React, { useState } from 'react';
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Trash2, Archive, Upload, User, FileText, Download, Send } from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export default function EmployeeFormModal({ open, onClose, employee, isManager = false }) {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [showConfirmationDialog, setShowConfirmationDialog] = useState(false);
  const [showCreationSuccess, setShowCreationSuccess] = useState(false);

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

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
    gross_salary: null,
    gross_hourly_rate: null,
    payment_method: '',
    payslips: [],
    documents: [],
    is_active: true
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Employee.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setShowCreationSuccess(true);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Employee.update(id, data),
    onSuccess: async (updatedEmployee) => {
      await queryClient.invalidateQueries({ queryKey: ['employees'] });
      setFormData(updatedEmployee);
      toast.success('Employé mis à jour');
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
    
    // Convertir les champs texte en majuscules
    const uppercasedData = {
      ...formData,
      first_name: formData.first_name?.toUpperCase() || '',
      last_name: formData.last_name?.toUpperCase() || '',
      married_name: formData.married_name?.toUpperCase() || '',
      nickname: formData.nickname?.toUpperCase() || '',
      address: formData.address?.toUpperCase() || '',
      birth_place: formData.birth_place?.toUpperCase() || '',
      nationality: formData.nationality?.toUpperCase() || '',
      position: formData.position?.toUpperCase() || '',
      team: formData.team?.toUpperCase() || '',
      manager: formData.manager?.toUpperCase() || '',
      coefficient_level: formData.coefficient_level?.toUpperCase() || '',
      social_security_number: formData.social_security_number?.toUpperCase() || '',
      iban: formData.iban?.toUpperCase() || '',
      bic: formData.bic?.toUpperCase() || ''
    };
    
    if (employee) {
      updateMutation.mutate({ id: employee.id, data: uppercasedData });
    } else {
      createMutation.mutate(uppercasedData);
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
        gross_salary: null,
        gross_hourly_rate: null,
        payment_method: '',
        payslips: [],
        documents: [],
        is_active: true
      });
    }
  }, [employee]);

  // Calcul automatique du salaire brut mensuel
  React.useEffect(() => {
    if (formData.gross_hourly_rate && formData.contract_hours) {
      const hourlyRate = parseFloat(formData.gross_hourly_rate);
      const hoursMatch = formData.contract_hours.match(/^(\d+):(\d+)$/);
      
      if (hoursMatch && !isNaN(hourlyRate)) {
        const hours = parseInt(hoursMatch[1]);
        const minutes = parseInt(hoursMatch[2]);
        const totalHours = hours + (minutes / 60);
        const calculatedSalary = totalHours * hourlyRate;
        
        setFormData(prev => ({
          ...prev,
          gross_salary: Math.round(calculatedSalary * 100) / 100
        }));
      }
    }
  }, [formData.gross_hourly_rate, formData.contract_hours]);

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

  const handleSendToAccounting = async () => {
    if (!recipientEmail || !recipientEmail.includes('@')) {
      toast.error('Email valide requis');
      return;
    }

    setSendingEmail(true);
    setShowEmailDialog(false);
    try {
      const currentUser = await base44.auth.me();
      const establishments = await base44.entities.Establishment.list();
      const establishment = establishments[0];
      
      const isFemale = formData.gender === 'female';
      const subject = isFemale ? 'Nouvelle employée' : 'Nouvel employé';
      
      const contractTypes = {
        cdi: 'CDI',
        cdd: 'CDD',
        extra: 'Extra',
        apprenti: 'Alternant',
        stage: 'Stage'
      };

      const body = `Bonjour,

Merci d'enregistrer ${isFemale ? 'notre nouvelle employée' : 'notre nouvel employé'}.

Informations :
━━━━━━━━━━━━━━━━━━━━━━━━

• Nom : ${formData.last_name || '-'}
• Prénom(s) : ${formData.first_name || '-'}${formData.married_name ? `\n• Nom d'épouse : ${formData.married_name}` : ''}
• Email : ${formData.email || '-'}
• Date d'embauche : ${formData.start_date ? new Date(formData.start_date).toLocaleDateString('fr-FR') : '-'}
• Type de contrat : ${formData.contract_type ? contractTypes[formData.contract_type] : '-'}${formData.contract_type === 'cdd' && formData.end_date ? `\n• Date de fin de contrat : ${new Date(formData.end_date).toLocaleDateString('fr-FR')}` : ''}
• Heures contractuelles / mois : ${formData.contract_hours || '-'}
• Heures contractuelles / semaine : ${formData.contract_hours_weekly || '-'}
• Nombre de jours de travail / semaine : ${formData.work_days_per_week || '-'}
• Taux horaire brut : ${formData.gross_hourly_rate ? `${formData.gross_hourly_rate} €/h` : '-'}

Cordialement,

${currentUser.full_name || '-'}
${currentUser.phone ? currentUser.phone : '-'}
${currentUser.email || '-'}`;

      await base44.functions.invoke('sendEmailWithResend', {
        to: recipientEmail,
        subject: subject,
        body: body,
        from_name: establishment?.name || 'UpGraal',
        reply_to: currentUser.email
      });

      setRecipientEmail('');
      setShowConfirmationDialog(true);
    } catch (error) {
      toast.error('Erreur lors de l\'envoi de l\'email');
    } finally {
      setSendingEmail(false);
    }
  };

  const openEmailDialog = () => {
    setRecipientEmail('');
    setShowEmailDialog(true);
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
            <TabsList className="grid w-full grid-cols-4 bg-gray-100">
              <TabsTrigger value="infos" className="data-[state=active]:bg-white text-xs sm:text-sm">Informations</TabsTrigger>
              <TabsTrigger value="contrat" className="data-[state=active]:bg-white text-xs sm:text-sm">Contrat</TabsTrigger>
              <TabsTrigger value="remuneration" className="data-[state=active]:bg-white text-xs sm:text-sm">Rémunération</TabsTrigger>
              <TabsTrigger value="documents" className="data-[state=active]:bg-white text-xs sm:text-sm">Documents</TabsTrigger>
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

          {/* Nom d'épouse (affiché seulement si féminin) */}
          {formData.gender === 'female' && (
            <div>
              <Label className="text-gray-900">Nom d'épouse</Label>
              <Input
                value={formData.married_name || ''}
                onChange={(e) => setFormData({ ...formData, married_name: e.target.value })}
                placeholder="Nom d'épouse"
                className="bg-white border-gray-300 text-gray-900"
              />
            </div>
          )}

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
              <Label className="text-gray-900">Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="bg-white border-gray-300 text-gray-900"
              />
            </div>
            <div>
              <Label className="text-gray-900">Téléphone *</Label>
              <Input
                type="tel"
                required
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-900">IBAN</Label>
              <Input
                value={formData.iban || ''}
                onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
                className="bg-white border-gray-300 text-gray-900"
                placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX"
              />
            </div>
            <div>
              <Label className="text-gray-900">BIC</Label>
              <Input
                value={formData.bic || ''}
                onChange={(e) => setFormData({ ...formData, bic: e.target.value })}
                className="bg-white border-gray-300 text-gray-900"
                placeholder="BNPAFRPPXXX"
              />
            </div>
          </div>
            </TabsContent>

            <TabsContent value="contrat" className="space-y-4 mt-4">
              {!isManager && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-orange-800">
                    ℹ️ Vous pouvez consulter ces informations mais seuls les responsables peuvent les modifier.
                  </p>
                </div>
              )}

              {/* Poste et Équipe */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-900">Poste</Label>
                  <Input
                    value={formData.position || ''}
                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    placeholder="Ex: Cuisinier, Livreur..."
                    className="bg-white border-gray-300 text-gray-900"
                    disabled={!isManager}
                  />
                </div>
                <div>
                  <Label className="text-gray-900">Équipe</Label>
                  <Input
                    value={formData.team || ''}
                    onChange={(e) => setFormData({ ...formData, team: e.target.value })}
                    placeholder="Équipe"
                    className="bg-white border-gray-300 text-gray-900"
                    disabled={!isManager}
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
                    disabled={!isManager}
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
                    disabled={!isManager}
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
                    disabled={!isManager}
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
                    disabled={!isManager}
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
                  disabled={!isManager}
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
                  disabled={!isManager}
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
                  disabled={!isManager}
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
                  disabled={!isManager}
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
                  disabled={!isManager}
                />
              </div>

              {/* Statut */}
              <div>
                <Label className="text-gray-900">Statut</Label>
                <Select
                  value={formData.is_active ? 'active' : 'archived'}
                  onValueChange={(value) => setFormData({ ...formData, is_active: value === 'active' })}
                  disabled={!isManager}
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
              {!isManager && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-orange-800">
                    ℹ️ Vous pouvez consulter ces informations mais seuls les responsables peuvent les modifier.
                  </p>
                </div>
              )}

              {/* Salaire brut */}
              <div>
                <Label className="text-gray-900">Salaire brut mensuel (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.gross_salary || ''}
                  onChange={(e) => setFormData({ ...formData, gross_salary: parseFloat(e.target.value) || '' })}
                  className="bg-white border-gray-300 text-gray-900"
                  placeholder="Calculé automatiquement"
                  disabled
                />
                <p className="text-xs text-gray-500 mt-1">
                  Calculé à partir du taux horaire × heures contractuelles/mois
                </p>
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
                  disabled={!isManager}
                />
              </div>

              {/* Mode de paiement */}
              <div>
                <Label className="text-gray-900">Mode de paiement</Label>
                <Select
                  value={formData.payment_method || ''}
                  onValueChange={(value) => setFormData({ ...formData, payment_method: value })}
                  disabled={!isManager}
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
                  disabled={!isManager}
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
                          {isManager && (
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
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload nouvelle fiche */}
                {isManager && (
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
                )}
              </div>
            </TabsContent>

            <TabsContent value="documents" className="space-y-4 mt-4">
              {!isManager && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-orange-800">
                    ℹ️ Vous pouvez télécharger ces documents mais seuls les responsables peuvent en ajouter ou supprimer.
                  </p>
                </div>
              )}

              {/* Catégories de documents */}
              <div>
                <Label className="text-gray-900 mb-3 block">Documents de l'employé</Label>
                
                {/* Liste des documents existants */}
                {formData.documents && formData.documents.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {formData.documents.map((doc, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-300 rounded-lg">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <FileText className="w-5 h-5 text-gray-500 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                            <div className="flex items-center gap-2 flex-wrap">
                              {doc.category && (
                                <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded">
                                  {doc.category}
                                </span>
                              )}
                              <span className="text-xs text-gray-400">
                                {new Date(doc.uploaded_at).toLocaleDateString('fr-FR')}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-700 p-2"
                            title="Télécharger"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                          {isManager && (
                            <button
                              type="button"
                              onClick={() => {
                                const newDocs = formData.documents.filter((_, i) => i !== index);
                                setFormData({ ...formData, documents: newDocs });
                              }}
                              className="text-red-600 hover:text-red-700 p-2"
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload nouveau document */}
                {isManager && (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                    <label className="cursor-pointer">
                      <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                      <p className="text-sm text-gray-600 mb-1 font-medium">Ajouter un document</p>
                      <p className="text-xs text-gray-500 mb-2">PDF, images, max 10MB</p>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;

                          setUploading(true);
                          try {
                            const { file_url } = await base44.integrations.Core.UploadFile({ file });
                            
                            const docName = prompt('Nom du document (ex: Contrat CDI)');
                            if (!docName) {
                              toast.error('Nom requis');
                              return;
                            }

                            const docCategory = prompt('Catégorie (ex: Contrat, Identité, Visite médicale, Avertissement, DPAE, Courrier)');
                            
                            const newDocument = {
                              name: docName,
                              url: file_url,
                              category: docCategory || 'Autre',
                              uploaded_at: new Date().toISOString()
                            };

                            setFormData({
                              ...formData,
                              documents: [...(formData.documents || []), newDocument]
                            });
                            toast.success('Document ajouté');
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
                    {uploading && (
                      <p className="text-xs text-gray-500 mt-2">Téléchargement en cours...</p>
                    )}
                  </div>
                )}

                <p className="text-xs text-gray-500 mt-2">
                  Types de documents : Contrats, Avenants, Papiers d'identité, Permis de conduire, 
                  Avertissements, Courriers, DPAE, Visites médicales, etc.
                </p>
              </div>
            </TabsContent>
          </Tabs>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-200">
            {employee && isManager && currentUser?.email !== employee.email && (
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
            {isManager && (
              <Button
                type="button"
                variant="outline"
                onClick={openEmailDialog}
                disabled={sendingEmail}
                className="border-blue-400 text-blue-700 hover:bg-blue-50"
              >
                <Send className="w-4 h-4 mr-2" />
                Déclarer à la compta
              </Button>
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
              disabled={createMutation.isPending || updateMutation.isPending || (employee && !isManager && currentUser?.email !== employee.email)}
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

      {/* Email Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent className="bg-white border-gray-300 w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle className="text-gray-900 flex items-center gap-2">
              <Send className="w-5 h-5 text-blue-600" />
              Déclarer à la comptabilité
            </DialogTitle>
            <DialogDescription className="text-gray-600">
              Envoyer les informations de {formData.gender === 'female' ? 'la nouvelle employée' : 'le nouvel employé'} par email
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-gray-900">Email du destinataire *</Label>
              <Input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="compta@exemple.fr"
                className="bg-white border-gray-300 text-gray-900 mt-1"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-1">
                L'email contiendra toutes les informations nécessaires
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowEmailDialog(false)}
              className="border-gray-300 text-gray-900 w-full sm:w-auto min-h-[44px]"
            >
              Annuler
            </Button>
            <Button
              onClick={handleSendToAccounting}
              disabled={sendingEmail || !recipientEmail}
              className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto min-h-[44px]"
            >
              <Send className="w-4 h-4 mr-2" />
              {sendingEmail ? 'Envoi...' : 'Envoyer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmationDialog} onOpenChange={setShowConfirmationDialog}>
        <DialogContent className="bg-white border-gray-300 w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <Send className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <DialogTitle className="text-gray-900 text-lg">Message bien envoyé</DialogTitle>
                <DialogDescription className="text-gray-600 text-sm">
                  Les informations ont été transmises avec succès
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          
          <div className="flex justify-end mt-4">
            <Button
              onClick={() => setShowConfirmationDialog(false)}
              className="bg-green-600 hover:bg-green-700 min-h-[44px]"
            >
              OK
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Creation Success Dialog */}
      <Dialog open={showCreationSuccess} onOpenChange={(open) => {
        if (!open) {
          setShowCreationSuccess(false);
          onClose();
        }
      }}>
        <DialogContent className="bg-white border-gray-300 w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <User className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <DialogTitle className="text-gray-900 text-lg">Employé créé</DialogTitle>
                <DialogDescription className="text-gray-600 text-sm">
                  {formData.first_name} {formData.last_name} a été ajouté avec succès
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          
          <div className="flex justify-end mt-4">
            <Button
              onClick={() => {
                setShowCreationSuccess(false);
                onClose();
              }}
              className="bg-green-600 hover:bg-green-700 min-h-[44px]"
            >
              OK
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}