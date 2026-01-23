import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, X, Sparkles, Loader2 } from 'lucide-react';

export default function ArticleFormModal({ open, onClose, onSave, isSaving, article, categories, suppliers }) {
  const [form, setForm] = useState({
    name: '',
    category: '',
    supplier_id: '',
    unit: '',
    unit_price: 0,
    brand: '',
    supplier_reference: '',
    internal_code: '',
    image_url: ''
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);

  useEffect(() => {
    if (article) {
      setForm({
        name: article.name || '',
        category: article.category || '',
        supplier_id: article.supplier_id || '',
        unit: article.unit || '',
        unit_price: article.unit_price || 0,
        brand: article.brand || '',
        supplier_reference: article.supplier_reference || '',
        internal_code: article.internal_code || '',
        image_url: article.image_url || ''
      });
    } else {
      setForm({
        name: '',
        category: '',
        supplier_id: '',
        unit: '',
        unit_price: 0,
        brand: '',
        supplier_reference: '',
        internal_code: '',
        image_url: ''
      });
    }
  }, [article, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(prev => ({ ...prev, image_url: file_url }));
    } catch (error) {
      console.error('Error uploading image:', error);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!form.name) return;
    
    setGeneratingImage(true);
    try {
      const result = await base44.integrations.Core.GenerateImage({
        prompt: `Professional product photograph of "${form.name}", clear and detailed, white background, commercial food photography, sharp focus, 8k quality`
      });
      if (result?.url) {
        setForm(prev => ({ ...prev, image_url: result.url }));
      }
    } catch (error) {
      console.error('Error generating image:', error);
    } finally {
      setGeneratingImage(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 max-h-[90vh] overflow-y-auto max-w-2xl">
        <DialogHeader>
          <DialogTitle>{article ? 'Modifier l\'article' : 'Nouvel article'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Image */}
          <div>
            <Label>Image</Label>
            {form.image_url ? (
              <div className="mt-2 relative">
                <img 
                  src={form.image_url} 
                  alt="Aperçu" 
                  className="w-full h-40 object-cover rounded-lg border-2 border-slate-600"
                />
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, image_url: '' }))}
                  className="absolute top-2 right-2 p-1 bg-red-600 rounded-full hover:bg-red-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                <label className="block">
                  <div className="border-2 border-dashed border-slate-600 rounded-lg p-4 text-center hover:border-orange-500 hover:bg-slate-700/30 cursor-pointer transition-colors">
                    {uploadingImage ? (
                      <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin text-slate-400" />
                    ) : (
                      <Upload className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                    )}
                    <p className="text-sm text-slate-300">
                      {uploadingImage ? 'Upload en cours...' : 'Cliquez pour uploader une image'}
                    </p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={uploadingImage}
                    className="hidden"
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGenerateImage}
                  disabled={!form.name || generatingImage}
                  className="w-full border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  {generatingImage ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Génération...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Générer avec IA
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Nom de l'article */}
          <div>
            <Label htmlFor="name">Nom de l'article *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              className="bg-slate-700 border-slate-600 mt-1"
              required
            />
          </div>

          {/* Catégorie et Fournisseur */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="category">Catégorie</Label>
              <select
                id="category"
                value={form.category}
                onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value }))}
                className="w-full bg-slate-700 border-slate-600 border rounded px-3 py-2 mt-1 text-slate-100"
              >
                <option value="">Sélectionner...</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.name}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="supplier">Fournisseur</Label>
              <select
                id="supplier"
                value={form.supplier_id}
                onChange={(e) => {
                  const supplier = suppliers.find(s => s.id === e.target.value);
                  setForm(prev => ({ 
                    ...prev, 
                    supplier_id: e.target.value,
                    supplier_name: supplier?.name || ''
                  }));
                }}
                className="w-full bg-slate-700 border-slate-600 border rounded px-3 py-2 mt-1 text-slate-100"
              >
                <option value="">Sélectionner...</option>
                {suppliers.map(sup => (
                  <option key={sup.id} value={sup.id}>{sup.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Unité et Prix */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="unit">Unité</Label>
              <Input
                id="unit"
                value={form.unit}
                onChange={(e) => setForm(prev => ({ ...prev, unit: e.target.value }))}
                placeholder="kg, L, pièce..."
                className="bg-slate-700 border-slate-600 mt-1"
              />
            </div>
            <div>
              <Label htmlFor="unit_price">Prix unitaire (€)</Label>
              <Input
                id="unit_price"
                type="number"
                step="0.01"
                value={form.unit_price}
                onChange={(e) => setForm(prev => ({ ...prev, unit_price: parseFloat(e.target.value) || 0 }))}
                className="bg-slate-700 border-slate-600 mt-1"
              />
            </div>
          </div>

          {/* Marque et Référence */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="brand">Marque</Label>
              <Input
                id="brand"
                value={form.brand}
                onChange={(e) => setForm(prev => ({ ...prev, brand: e.target.value }))}
                className="bg-slate-700 border-slate-600 mt-1"
              />
            </div>
            <div>
              <Label htmlFor="supplier_reference">Référence fournisseur</Label>
              <Input
                id="supplier_reference"
                value={form.supplier_reference}
                onChange={(e) => setForm(prev => ({ ...prev, supplier_reference: e.target.value }))}
                className="bg-slate-700 border-slate-600 mt-1"
              />
            </div>
          </div>

          {/* Code interne */}
          <div>
            <Label htmlFor="internal_code">Code de référence interne</Label>
            <Input
              id="internal_code"
              value={form.internal_code}
              onChange={(e) => setForm(prev => ({ ...prev, internal_code: e.target.value }))}
              className="bg-slate-700 border-slate-600 mt-1"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700">
              Annuler
            </Button>
            <Button type="submit" disabled={isSaving} className="bg-orange-600 hover:bg-orange-700">
              {article ? 'Modifier' : 'Créer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}