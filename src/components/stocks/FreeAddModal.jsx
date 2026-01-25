import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function FreeAddModal({ isOpen, onClose, onAdd, suppliers = [] }) {
  const [formData, setFormData] = useState({
    name: '',
    quantity: 1,
    unit: '',
    supplier_id: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.supplier_id) {
      return;
    }
    onAdd(formData);
    setFormData({ name: '', quantity: 1, unit: '', supplier_id: '' });
    onClose();
  };

  const handleCancel = () => {
    setFormData({ name: '', quantity: 1, unit: '', supplier_id: '' });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white border-gray-300 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Ajout Libre</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nom du produit */}
          <div>
            <Label htmlFor="product_name" className="text-gray-900">Nom du produit (hors catalogue)</Label>
            <Input
              id="product_name"
              placeholder="Ex: Décoration Spéciale..."
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="bg-white border-gray-300 text-gray-900 mt-1"
              required
            />
          </div>

          {/* Quantité et Unité */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="quantity" className="text-gray-900">Quantité</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                className="bg-white border-gray-300 text-gray-900 mt-1"
                required
              />
            </div>
            <div>
              <Label htmlFor="unit" className="text-gray-900">Unité</Label>
              <Input
                id="unit"
                placeholder="pce, kg, botte..."
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="bg-white border-gray-300 text-gray-900 mt-1"
              />
            </div>
          </div>

          {/* Fournisseur de destination */}
          <div>
            <Label htmlFor="supplier" className="text-gray-900">Fournisseur de destination</Label>
            <select
              id="supplier"
              value={formData.supplier_id}
              onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
              className="w-full bg-white border-gray-300 border rounded px-3 py-2 mt-1 text-gray-900"
              required
            >
              <option value="">-- Choisir --</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              className="border-gray-300 text-gray-900 hover:bg-gray-50"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              className="bg-orange-600 hover:bg-orange-700"
            >
              + Ajouter à la commande
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}