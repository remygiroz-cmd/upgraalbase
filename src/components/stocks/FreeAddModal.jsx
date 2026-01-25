import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X } from 'lucide-react';

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
      <DialogContent className="bg-gradient-to-br from-gray-900 to-gray-800 text-white border-purple-600 max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-500"></div>
              <DialogTitle className="text-lg font-bold">Ajout Libre</DialogTitle>
            </div>
            <button 
              onClick={handleCancel}
              className="p-1 hover:bg-gray-700 rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Nom du produit */}
          <div>
            <Label className="text-xs text-gray-400 uppercase mb-2 block">
              Nom du produit (hors catalogue)
            </Label>
            <Input
              placeholder="Ex: Décoration Spéciale..."
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 h-12"
              required
            />
          </div>

          {/* Quantité et Unité */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-400 uppercase mb-2 block">
                Quantité
              </Label>
              <Input
                type="number"
                min="1"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                className="bg-gray-800 border-gray-700 text-white h-12"
                required
              />
            </div>
            <div>
              <Label className="text-xs text-gray-400 uppercase mb-2 block">
                Unité
              </Label>
              <Input
                placeholder="pce, kg, botte..."
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 h-12"
              />
            </div>
          </div>

          {/* Fournisseur de destination */}
          <div>
            <Label className="text-xs text-gray-400 uppercase mb-2 block">
              Fournisseur de destination
            </Label>
            <Select 
              value={formData.supplier_id} 
              onValueChange={(value) => setFormData({ ...formData, supplier_id: value })}
              required
            >
              <SelectTrigger className="bg-gray-800 border-purple-600 text-white h-12">
                <SelectValue placeholder="-- Choisir --" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                {suppliers.map((supplier) => (
                  <SelectItem 
                    key={supplier.id} 
                    value={supplier.id}
                    className="text-white hover:bg-gray-700"
                  >
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              onClick={handleCancel}
              variant="outline"
              className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-700 h-12"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white h-12"
            >
              + Ajouter à la commande
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}