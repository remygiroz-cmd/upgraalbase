import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Upload } from 'lucide-react';

const CONTRACT_TYPES = [
  { value: 'cdi', label: 'CDI' },
  { value: 'cdd', label: 'CDD' },
  { value: 'extra', label: 'Extra' },
  { value: 'apprenti', label: 'Apprenti' },
  { value: 'stage', label: 'Stage' },
];

const PERMISSION_LEVELS = [
  { value: 'employee', label: 'Employé' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Administrateur' },
];

export default function EmployeeFormModal({ open, onClose, employee }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('identity');
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    gender: '',
    birth_date: '',
    birth_place: '',
    nationality: '',
    photo_url: '',
    address: '',
    email: '',
    phone: '',
    social_security_number: '',
    iban: '',
    bic: '',
    contract_type: 'cdi',
    position: '',
    team: '',
    start_date: '',
    start_time: '',
    end_date: '',
    contract_hours: 35,
    hourly_rate: 0,
    trial_end_date: '',
    permission_level: 'employee',
    contract_days: {
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: false,
      sunday: false
    },
    notes: '',
    is_active: true
  });

  useEffect(() => {
    if (employee) {
      setForm({
        first_name: employee.first_name || '',
        last_name: employee.last_name || '',
        gender: employee.gender || '',
        birth_date: employee.birth_date || '',
        birth_place: employee.birth_place || '',
        nationality: employee.nationality || '',
        photo_url: employee.photo_url || '',
        address: employee.address || '',
        email: employee.email || '',
        phone: employee.phone || '',
        social_security_number: employee.social_security_number || '',
        iban: employee.iban || '',
        bic: employee.bic || '',
        contract_type: employee.contract_type || 'cdi',
        position: employee.position || '',
        team: employee.team || '',
        start_date: employee.start_date || '',
        start_time: employee.start_time || '',
        end_date: employee.end_date || '',
        contract_hours: employee.contract_hours || 35,
        hourly_rate: employee.hourly_rate || 0,
        trial_end_date: employee.trial_end_date || '',
        permission_level: employee.permission_level || 'employee',
        contract_days: employee.contract_days || {
          monday: true,
          tuesday: true,
          wednesday: true,
          thursday: true,
          friday: true,
          saturday: false,
          sunday: false
        },
        notes: employee.notes || '',
        is_active: employee.is_active !== false
      });
    } else {
      setForm({
        first_name: '',
        last_name: '',
        gender: '',
        birth_date: '',
        birth_place: '',
        nationality: '',
        photo_url: '',
        address: '',
        email: '',
        phone: '',
        social_security_number: '',
        iban: '',
        bic: '',
        contract_type: 'cdi',
        position: '',
        team: '',
        start_date: '',
        start_time: '',
        end_date: '',
        contract_hours: 35,
        hourly_rate: 0,
        trial_end_date: '',
        permission_level: 'employee',
        contract_days: {
          monday: true,
          tuesday: true,
          wednesday: true,
          thursday: true,
          friday: true,
          saturday: false,
          sunday: false
        },
        notes: '',
        is_active: true
      });
    }
    setActiveTab('identity');
  }, [employee, open]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (employee?.id) {
        return base44.entities.Employee.update(employee.id, data);
      }
      return base44.entities.Employee.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      onClose();
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(form);
  };

  const handleUploadPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file });
      if (result?.file_url) {
        setForm(prev => ({ ...prev, photo_url: result.file_url }));
      }
    } catch (error) {
      console.error('Upload failed:', error);
    }
    setUploading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 max-w-3xl max-h-[95vh] overflow-hidden flex flex-col p-0">
        <div className="px-6 py-4 border-b border-slate-700">
          <DialogHeader>
            <DialogTitle>{employee ? 'Modifier' : 'Nouvel'} employé</DialogTitle>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 overflow-y-auto flex-1 px-6 py-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4 bg-slate-700">
              <TabsTrigger value="identity">Identité</TabsTrigger>
              <TabsTrigger value="contact">Contact</TabsTrigger>
              <TabsTrigger value="contract">Contrat</TabsTrigger>
              <TabsTrigger value="legal">Légal</TabsTrigger>
            </TabsList>

            {/* Identity Tab */}
            <TabsContent value="identity" className="space-y-4 mt-4">
              <div className="flex items-center gap-4">
                {form.photo_url ? (
                  <img
                    src={form.photo_url}
                    alt="Photo"
                    className="w-20 h-20 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center text-slate-500">
                    Photo
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700"
                  disabled={uploading}
                  onClick={() => document.getElementById('employee-photo-upload').click()}
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2" />
                  )}
                  Upload photo
                </Button>
                <input
                  id="employee-photo-upload"
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={handleUploadPhoto}
                  className="hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="first_name">Prénom *</Label>
                  <Input
                    id="first_name"
                    value={form.first_name}
                    onChange={(e) => setForm(prev => ({ ...prev, first_name: e.target.value }))}
                    className="bg-slate-700 border-slate-600 mt-1"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="last_name">Nom *</Label>
                  <Input
                    id="last_name"
                    value={form.last_name}
                    onChange={(e) => setForm(prev => ({ ...prev, last_name: e.target.value }))}
                    className="bg-slate-700 border-slate-600 mt-1"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Sexe</Label>
                  <Select
                    value={form.gender}
                    onValueChange={(value) => setForm(prev => ({ ...prev, gender: value }))}
                  >
                    <SelectTrigger className="bg-slate-700 border-slate-600 mt-1">
                      <SelectValue placeholder="..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-700 border-slate-600">
                      <SelectItem value="male">Homme</SelectItem>
                      <SelectItem value="female">Femme</SelectItem>
                      <SelectItem value="other">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="birth_date">Date de naissance</Label>
                  <Input
                    id="birth_date"
                    type="date"
                    value={form.birth_date}
                    onChange={(e) => setForm(prev => ({ ...prev, birth_date: e.target.value }))}
                    className="bg-slate-700 border-slate-600 mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="nationality">Nationalité</Label>
                  <Input
                    id="nationality"
                    value={form.nationality}
                    onChange={(e) => setForm(prev => ({ ...prev, nationality: e.target.value }))}
                    className="bg-slate-700 border-slate-600 mt-1"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="birth_place">Lieu de naissance</Label>
                <Input
                  id="birth_place"
                  value={form.birth_place}
                  onChange={(e) => setForm(prev => ({ ...prev, birth_place: e.target.value }))}
                  className="bg-slate-700 border-slate-600 mt-1"
                />
              </div>
            </TabsContent>

            {/* Contact Tab */}
            <TabsContent value="contact" className="space-y-4 mt-4">
              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                  className="bg-slate-700 border-slate-600 mt-1"
                  required
                />
              </div>

              <div>
                <Label htmlFor="phone">Téléphone</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
                  className="bg-slate-700 border-slate-600 mt-1"
                />
              </div>

              <div>
                <Label htmlFor="address">Adresse</Label>
                <Textarea
                  id="address"
                  value={form.address}
                  onChange={(e) => setForm(prev => ({ ...prev, address: e.target.value }))}
                  className="bg-slate-700 border-slate-600 mt-1"
                />
              </div>
            </TabsContent>

            {/* Contract Tab */}
            <TabsContent value="contract" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Type de contrat</Label>
                  <Select
                    value={form.contract_type}
                    onValueChange={(value) => setForm(prev => ({ ...prev, contract_type: value }))}
                  >
                    <SelectTrigger className="bg-slate-700 border-slate-600 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-700 border-slate-600">
                      {CONTRACT_TYPES.map(ct => (
                        <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Niveau d'accès</Label>
                  <Select
                    value={form.permission_level}
                    onValueChange={(value) => setForm(prev => ({ ...prev, permission_level: value }))}
                  >
                    <SelectTrigger className="bg-slate-700 border-slate-600 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-700 border-slate-600">
                      {PERMISSION_LEVELS.map(pl => (
                        <SelectItem key={pl.value} value={pl.value}>{pl.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="position">Poste</Label>
                  <Input
                    id="position"
                    value={form.position}
                    onChange={(e) => setForm(prev => ({ ...prev, position: e.target.value }))}
                    className="bg-slate-700 border-slate-600 mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="team">Équipe</Label>
                  <Input
                    id="team"
                    value={form.team}
                    onChange={(e) => setForm(prev => ({ ...prev, team: e.target.value }))}
                    className="bg-slate-700 border-slate-600 mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="start_date">Date d'entrée</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm(prev => ({ ...prev, start_date: e.target.value }))}
                    className="bg-slate-700 border-slate-600 mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="trial_end_date">Fin période d'essai</Label>
                  <Input
                    id="trial_end_date"
                    type="date"
                    value={form.trial_end_date}
                    onChange={(e) => setForm(prev => ({ ...prev, trial_end_date: e.target.value }))}
                    className="bg-slate-700 border-slate-600 mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="contract_hours">Heures contractuelles / semaine</Label>
                  <Input
                    id="contract_hours"
                    type="number"
                    value={form.contract_hours}
                    onChange={(e) => setForm(prev => ({ ...prev, contract_hours: parseFloat(e.target.value) || 0 }))}
                    className="bg-slate-700 border-slate-600 mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="hourly_rate">Taux horaire (€)</Label>
                  <Input
                    id="hourly_rate"
                    type="number"
                    step="0.01"
                    value={form.hourly_rate}
                    onChange={(e) => setForm(prev => ({ ...prev, hourly_rate: parseFloat(e.target.value) || 0 }))}
                    className="bg-slate-700 border-slate-600 mt-1"
                  />
                </div>
              </div>

              {/* Jours contractuels */}
              <div className="bg-slate-700 p-5 rounded-lg border border-slate-500 shadow-md">
                <div className="mb-3">
                  <Label className="text-sm font-semibold block text-slate-100 mb-1">
                    Jours contractuels (semaine)
                  </Label>
                  <p className="text-xs text-slate-400">
                    Utilisé pour calculer les heures prévues (lissage)
                  </p>
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {[
                    { key: 'monday', label: 'Lun' },
                    { key: 'tuesday', label: 'Mar' },
                    { key: 'wednesday', label: 'Mer' },
                    { key: 'thursday', label: 'Jeu' },
                    { key: 'friday', label: 'Ven' },
                    { key: 'saturday', label: 'Sam' },
                    { key: 'sunday', label: 'Dim' }
                  ].map(day => (
                    <button
                      key={day.key}
                      type="button"
                      onClick={() => setForm(prev => ({
                        ...prev,
                        contract_days: {
                          ...prev.contract_days,
                          [day.key]: !prev.contract_days[day.key]
                        }
                      }))}
                      className={`flex flex-col items-center justify-center p-3 rounded border-2 transition-all ${
                        form.contract_days[day.key]
                          ? 'bg-blue-600 border-blue-500 shadow-lg'
                          : 'bg-slate-800 border-slate-600 hover:border-slate-500'
                      }`}
                    >
                      <span className={`text-sm font-bold ${form.contract_days[day.key] ? 'text-white' : 'text-slate-300'}`}>
                        {day.label}
                      </span>
                      {form.contract_days[day.key] && (
                        <span className="text-xs text-blue-100 mt-1">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Legal Tab */}
            <TabsContent value="legal" className="space-y-4 mt-4">
              <div>
                <Label htmlFor="social_security_number">N° Sécurité sociale</Label>
                <Input
                  id="social_security_number"
                  value={form.social_security_number}
                  onChange={(e) => setForm(prev => ({ ...prev, social_security_number: e.target.value }))}
                  className="bg-slate-700 border-slate-600 mt-1"
                />
              </div>

              <div>
                <Label htmlFor="iban">IBAN</Label>
                <Input
                  id="iban"
                  value={form.iban}
                  onChange={(e) => setForm(prev => ({ ...prev, iban: e.target.value }))}
                  className="bg-slate-700 border-slate-600 mt-1"
                />
              </div>

              <div>
                <Label htmlFor="bic">BIC</Label>
                <Input
                  id="bic"
                  value={form.bic}
                  onChange={(e) => setForm(prev => ({ ...prev, bic: e.target.value }))}
                  className="bg-slate-700 border-slate-600 mt-1"
                />
              </div>

              <div>
                <Label htmlFor="notes">Notes internes</Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="bg-slate-700 border-slate-600 mt-1 min-h-[100px]"
                />
              </div>
            </TabsContent>
          </Tabs>

        </form>

        <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700">
            Annuler
          </Button>
          <Button 
            type="submit" 
            onClick={handleSubmit}
            className="bg-orange-600 hover:bg-orange-700"
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {employee ? 'Mettre à jour' : 'Créer'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}