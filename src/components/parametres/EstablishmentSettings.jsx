import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Building2, Save, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

export default function EstablishmentSettings() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: establishments = [], isLoading } = useQuery({
    queryKey: ['establishment'],
    queryFn: () => base44.entities.Establishment.list()
  });

  const establishment = establishments[0] || {};

  const [formData, setFormData] = useState({
    name: '',
    postal_address: '',
    delivery_address: '',
    siret: '',
    website: '',
    contact_email: '',
    managers: [{ name: '', phone: '', email: '' }]
  });

  useEffect(() => {
    if (establishment.id) {
      setFormData({
        name: establishment.name || '',
        postal_address: establishment.postal_address || '',
        delivery_address: establishment.delivery_address || '',
        siret: establishment.siret || '',
        website: establishment.website || '',
        contact_email: establishment.contact_email || '',
        managers: establishment.managers?.length > 0 ? establishment.managers : [{ name: '', phone: '', email: '' }]
      });
    }
  }, [establishment]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (establishment.id) {
        return base44.entities.Establishment.update(establishment.id, data);
      }
      return base44.entities.Establishment.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['establishment'] });
      toast.success('Informations enregistrées avec succès');
      setSaving(false);
    },
    onError: () => {
      toast.error('Erreur lors de l\'enregistrement');
      setSaving(false);
    }
  });

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast.error('Le nom de l\'établissement est requis');
      return;
    }
    
    // Filter out empty managers
    const cleanedData = {
      ...formData,
      managers: formData.managers.filter(m => m.name.trim() || m.phone.trim() || m.email.trim())
    };
    
    setSaving(true);
    saveMutation.mutate(cleanedData);
  };

  const addManager = () => {
    setFormData({
      ...formData,
      managers: [...formData.managers, { name: '', phone: '', email: '' }]
    });
  };

  const removeManager = (index) => {
    const newManagers = formData.managers.filter((_, i) => i !== index);
    setFormData({
      ...formData,
      managers: newManagers.length > 0 ? newManagers : [{ name: '', phone: '', email: '' }]
    });
  };

  const updateManager = (index, field, value) => {
    const newManagers = [...formData.managers];
    newManagers[index][field] = value;
    setFormData({ ...formData, managers: newManagers });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border-2 border-gray-300 p-6 shadow-sm">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Building2 className="w-5 h-5" />
          Informations de l'établissement
        </h3>
        <p className="text-sm text-gray-700 mt-1">
          Coordonnées et détails administratifs de l'établissement
        </p>
      </div>

      <div className="space-y-6">
        {/* Informations de base */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label htmlFor="name">Nom de l'établissement *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Restaurant Le Gourmet"
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="siret">Numéro de SIRET</Label>
            <Input
              id="siret"
              value={formData.siret}
              onChange={(e) => setFormData({ ...formData, siret: e.target.value })}
              placeholder="123 456 789 00012"
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="contact_email">Email de contact</Label>
            <Input
              id="contact_email"
              type="email"
              value={formData.contact_email}
              onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
              placeholder="contact@restaurant.fr"
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="website">Site internet</Label>
            <Input
              id="website"
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              placeholder="https://www.restaurant.fr"
              className="mt-2"
            />
          </div>
        </div>

        {/* Adresses */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="postal_address">Adresse postale</Label>
            <Textarea
              id="postal_address"
              value={formData.postal_address}
              onChange={(e) => setFormData({ ...formData, postal_address: e.target.value })}
              placeholder="123 Rue de la Gastronomie&#10;75001 Paris"
              rows={3}
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="delivery_address">Adresse de livraison</Label>
            <Textarea
              id="delivery_address"
              value={formData.delivery_address}
              onChange={(e) => setFormData({ ...formData, delivery_address: e.target.value })}
              placeholder="456 Rue de la Cuisine&#10;75001 Paris"
              rows={3}
              className="mt-2"
            />
          </div>
        </div>

        {/* Responsables */}
        <div className="border-t border-gray-200 pt-6">
          <div className="flex items-center justify-between mb-4">
            <Label className="text-base font-semibold">Responsables</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={addManager}
              className="border-orange-600 text-orange-600 hover:bg-orange-50"
            >
              <Plus className="w-4 h-4 mr-1" />
              Ajouter
            </Button>
          </div>

          <div className="space-y-3">
            {formData.managers.map((manager, index) => (
              <div key={index} className="flex flex-col gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <Input
                      value={manager.name}
                      onChange={(e) => updateManager(index, 'name', e.target.value)}
                      placeholder="Nom du responsable"
                      className="bg-white"
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      value={manager.phone}
                      onChange={(e) => updateManager(index, 'phone', e.target.value)}
                      placeholder="Téléphone"
                      className="bg-white"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeManager(index)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                    disabled={formData.managers.length === 1}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div>
                  <Input
                    type="email"
                    value={manager.email || ''}
                    onChange={(e) => updateManager(index, 'email', e.target.value)}
                    placeholder="Email du responsable"
                    className="bg-white"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Save Button */}
        <div className="pt-4 border-t border-gray-200">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-orange-600 hover:bg-orange-700"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enregistrement...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Enregistrer les informations
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}