import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const DAYS = [
  { key: 'L', label: 'Lundi' },
  { key: 'MA', label: 'Mardi' },
  { key: 'ME', label: 'Mercredi' },
  { key: 'J', label: 'Jeudi' },
  { key: 'V', label: 'Vendredi' },
  { key: 'S', label: 'Samedi' },
  { key: 'D', label: 'Dimanche' }
];

export default function SupplierFormModal({ open, onClose, onSave, isSaving, supplier }) {
  const [form, setForm] = useState({
    name: '',
    contact_name: '',
    phone: '',
    email: '',
    address: '',
    internal_reference: '',
    delivery_days: [],
    preferred_delivery_days: [],
    closing_time: '02:00',
    cc_emails: '',
    email_subject: '',
    custom_message: ''
  });

  useEffect(() => {
    if (supplier) {
      setForm({
        name: supplier.name || '',
        contact_name: supplier.contact_name || '',
        phone: supplier.phone || '',
        email: supplier.email || '',
        address: supplier.address || '',
        internal_reference: supplier.internal_reference || '',
        delivery_days: supplier.delivery_days || [],
        preferred_delivery_days: supplier.preferred_delivery_days || [],
        closing_time: supplier.closing_time || '02:00',
        cc_emails: supplier.cc_emails || '',
        email_subject: supplier.email_subject || '',
        custom_message: supplier.custom_message || ''
      });
    } else {
      setForm({
        name: '',
        contact_name: '',
        phone: '',
        email: '',
        address: '',
        internal_reference: '',
        delivery_days: [],
        preferred_delivery_days: [],
        closing_time: '02:00',
        cc_emails: '',
        email_subject: '',
        custom_message: ''
      });
    }
  }, [supplier, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Normaliser closing_time pour forcer minutes à 00
    const normalizedForm = {
      ...form,
      closing_time: form.closing_time ? `${form.closing_time.split(':')[0]}:00` : '02:00'
    };
    
    onSave(normalizedForm);
  };

  const toggleDay = (day) => {
    setForm(prev => ({
      ...prev,
      delivery_days: prev.delivery_days.includes(day)
        ? prev.delivery_days.filter(d => d !== day)
        : [...prev.delivery_days, day]
    }));
  };

  const toggleDeliveryDay = (day) => {
    setForm(prev => ({
      ...prev,
      preferred_delivery_days: prev.preferred_delivery_days.includes(day)
        ? prev.preferred_delivery_days.filter(d => d !== day)
        : [...prev.preferred_delivery_days, day]
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white border-gray-200 max-h-[90vh] overflow-y-auto max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-gray-900">{supplier ? 'Modifier Fournisseur' : 'Ajouter un Fournisseur'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Fiche signalétique */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <span>📋</span> FICHE SIGNALÉTIQUE
            </h3>
            <div className="space-y-3">
              <div>
                <Label htmlFor="name">Nom du fournisseur *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  className="bg-gray-50 border-gray-300 mt-1"
                  required
                />
              </div>

              <div>
                <Label htmlFor="contact_name">Prénom/Contact</Label>
                <Input
                  id="contact_name"
                  value={form.contact_name}
                  onChange={(e) => setForm(prev => ({ ...prev, contact_name: e.target.value }))}
                  className="bg-gray-50 border-gray-300 mt-1"
                />
              </div>

              <div>
                <Label htmlFor="phone">Téléphone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
                  className="bg-gray-50 border-gray-300 mt-1"
                />
              </div>

              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                  className="bg-gray-50 border-gray-300 mt-1"
                />
              </div>

              <div>
                <Label htmlFor="internal_reference">Référence client (Interne)</Label>
                <Input
                  id="internal_reference"
                  placeholder="Ex: FR-12345"
                  value={form.internal_reference}
                  onChange={(e) => setForm(prev => ({ ...prev, internal_reference: e.target.value }))}
                  className="bg-gray-50 border-gray-300 mt-1"
                />
              </div>
            </div>
          </div>

          {/* Automatisation */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <span>⚙️</span> AUTOMATISATION
            </h3>
            
            <div className="space-y-4">
              <div>
                <Label className="mb-3 block">Jours d'envoi automatique</Label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((day, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleDay(day.key)}
                      className={`w-10 h-10 rounded font-semibold transition-all ${
                        form.delivery_days.includes(day.key)
                          ? 'bg-orange-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
                      }`}
                    >
                      {day.key}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="closing_hour">Heure d'envoi automatique</Label>
                <select
                  id="closing_hour"
                  value={form.closing_time ? form.closing_time.split(':')[0] : '02'}
                  onChange={(e) => {
                    const hour = e.target.value.padStart(2, '0');
                    setForm(prev => ({ ...prev, closing_time: `${hour}:00` }));
                  }}
                  className="w-full h-10 px-3 rounded-md border border-gray-300 bg-gray-50 text-gray-900 mt-1 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={String(i).padStart(2, '0')}>
                      {String(i).padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Les commandes seront envoyées automatiquement à cette heure chaque jour sélectionné</p>
              </div>

              <div>
                <Label className="mb-3 block">Jours de livraison souhaités</Label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((day, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleDeliveryDay(day.key)}
                      className={`w-10 h-10 rounded font-semibold transition-all ${
                        form.preferred_delivery_days.includes(day.key)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
                      }`}
                    >
                      {day.key}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Copie email */}
          <div>
            <Label htmlFor="cc_emails">Copie à (Email CC)</Label>
            <Input
              id="cc_emails"
              placeholder="email1@test.com, email2@test.com"
              value={form.cc_emails}
              onChange={(e) => setForm(prev => ({ ...prev, cc_emails: e.target.value }))}
              className="bg-white border-gray-300 text-gray-900 mt-1"
            />
          </div>

          {/* Objet de l'email */}
          <div>
            <Label htmlFor="email_subject">Objet pour l'email</Label>
            <Input
              id="email_subject"
              placeholder="Commande du jour"
              value={form.email_subject}
              onChange={(e) => setForm(prev => ({ ...prev, email_subject: e.target.value }))}
              className="bg-white border-gray-300 text-gray-900 mt-1"
            />
          </div>

          {/* Message personnalisé */}
          <div>
            <Label htmlFor="custom_message">Message personnalisé</Label>
            <Textarea
              id="custom_message"
              placeholder="Bonjour,\nVeuillez trouver ci-joint notre commande pour livraison demain.\nCordialement,"
              value={form.custom_message}
              onChange={(e) => setForm(prev => ({ ...prev, custom_message: e.target.value }))}
              className="bg-white border-gray-300 text-gray-900 mt-1 h-24"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={isSaving} className="bg-orange-600 hover:bg-orange-700">
              {supplier ? 'Modifier' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}