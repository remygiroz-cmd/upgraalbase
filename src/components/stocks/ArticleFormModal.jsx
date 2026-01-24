import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, X, Sparkles, Loader2 } from 'lucide-react';

export default function ArticleFormModal({ open, onClose, onSave, isSaving, article, categories, suppliers, articles = [] }) {
  const [form, setForm] = useState({
    name: '',
    category: '',
    supplier_id: '',
    unit: '',
    unit_price: 0,
    brand: '',
    supplier_reference: '',
    internal_code: '',
    image_url: '',
    order: 0,
    storage_order: 0
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
        image_url: article.image_url || '',
        order: article.order || 0,
        storage_order: article.storage_order || 0
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
        image_url: '',
        order: 0,
        storage_order: 0
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
      <DialogContent className="bg-white border-gray-300 max-h-[90vh] overflow-y-auto max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-gray-900">{article ? 'Modifier l\'article' : 'Nouvel article'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Image */}
          <div>
            <Label className="text-gray-900">Image</Label>
            {form.image_url ? (
              <div className="mt-2 relative">
                <img 
                  src={form.image_url} 
                  alt="Aperçu" 
                  className="w-full h-40 object-cover rounded-lg border-2 border-gray-300"
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
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-orange-500 hover:bg-orange-50 cursor-pointer transition-colors">
                    {uploadingImage ? (
                      <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin text-gray-500" />
                    ) : (
                      <Upload className="w-8 h-8 mx-auto mb-2 text-gray-500" />
                    )}
                    <p className="text-sm text-gray-700">
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
                  className="w-full border-gray-300 text-gray-900 hover:bg-gray-50"
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
            <Label htmlFor="name" className="text-gray-900">Nom de l'article *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              className="bg-white border-gray-300 text-gray-900 mt-1"
              required
            />
          </div>

          {/* Catégorie et Fournisseur */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="category" className="text-gray-900">Catégorie</Label>
              <select
                id="category"
                value={form.category}
                onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value }))}
                className="w-full bg-white border-gray-300 border rounded px-3 py-2 mt-1 text-gray-900"
              >
                <option value="">Sélectionner...</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.name}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="supplier" className="text-gray-900">Fournisseur</Label>
              <select
                id="supplier"
                value={form.supplier_id}
                onChange={(e) => {
                  const supplier = suppliers.find(s => s.id === e.target.value);
                  let nextOrder = 0;
                  let nextStorageOrder = 0;
                  
                  // Si création d'un nouvel article, calculer le prochain rang
                  if (!article && e.target.value) {
                    const supplierArticles = articles.filter(a => a.supplier_id === e.target.value);
                    nextOrder = supplierArticles.length;
                    nextStorageOrder = supplierArticles.length;
                  }
                  
                  setForm(prev => ({ 
                    ...prev, 
                    supplier_id: e.target.value,
                    supplier_name: supplier?.name || '',
                    order: !article ? nextOrder : prev.order,
                    storage_order: !article ? nextStorageOrder : prev.storage_order
                  }));
                }}
                className="w-full bg-white border-gray-300 border rounded px-3 py-2 mt-1 text-gray-900"
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
              <Label htmlFor="unit" className="text-gray-900">Unité</Label>
              <Input
                id="unit"
                value={form.unit}
                onChange={(e) => setForm(prev => ({ ...prev, unit: e.target.value }))}
                placeholder="kg, L, pièce..."
                className="bg-white border-gray-300 text-gray-900 mt-1"
              />
            </div>
            <div>
              <Label htmlFor="unit_price" className="text-gray-900">Prix unitaire (€)</Label>
              <Input
                id="unit_price"
                type="number"
                step="0.01"
                value={form.unit_price}
                onChange={(e) => setForm(prev => ({ ...prev, unit_price: parseFloat(e.target.value) || 0 }))}
                className="bg-white border-gray-300 text-gray-900 mt-1"
              />
            </div>
          </div>

          {/* Marque et Référence */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="brand" className="text-gray-900">Marque</Label>
              <Input
                id="brand"
                value={form.brand}
                onChange={(e) => setForm(prev => ({ ...prev, brand: e.target.value }))}
                className="bg-white border-gray-300 text-gray-900 mt-1"
              />
            </div>
            <div>
              <Label htmlFor="supplier_reference" className="text-gray-900">Référence fournisseur</Label>
              <Input
                id="supplier_reference"
                value={form.supplier_reference}
                onChange={(e) => setForm(prev => ({ ...prev, supplier_reference: e.target.value }))}
                className="bg-white border-gray-300 text-gray-900 mt-1"
              />
            </div>
          </div>

          {/* Code interne */}
          <div>
            <Label htmlFor="internal_code" className="text-gray-900">Code de référence interne</Label>
            <Input
              id="internal_code"
              value={form.internal_code}
              onChange={(e) => setForm(prev => ({ ...prev, internal_code: e.target.value }))}
              className="bg-white border-gray-300 text-gray-900 mt-1"
            />
          </div>

          {/* Ordres */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="order" className="text-gray-900">Rang Parcours Magasin</Label>
              <Input
                id="order"
                type="number"
                min="1"
                value={form.order + 1}
                onChange={(e) => setForm(prev => ({ ...prev, order: Math.max(0, parseInt(e.target.value) - 1) || 0 }))}
                className="bg-white border-gray-300 text-gray-900 mt-1"
              />
            </div>
            <div>
              <Label htmlFor="storage_order" className="text-gray-900">Rang Stockage Boutique</Label>
              <Input
                id="storage_order"
                type="number"
                min="1"
                value={form.storage_order + 1}
                onChange={(e) => setForm(prev => ({ ...prev, storage_order: Math.max(0, parseInt(e.target.value) - 1) || 0 }))}
                className="bg-white border-gray-300 text-gray-900 mt-1"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="border-gray-300 text-gray-900 hover:bg-gray-50">
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