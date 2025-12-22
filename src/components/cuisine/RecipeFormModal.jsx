import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Upload, Sparkles, Plus, Trash2 } from 'lucide-react';

const SECTIONS = [
  { value: 'fiches_techniques', label: 'Fiches Techniques' },
  { value: 'labo', label: 'Labo / Créations' },
  { value: 'archives', label: 'Archives' },
];

export default function RecipeFormModal({ open, onClose, recipe, currentSection }) {
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const [form, setForm] = useState({
    name: '',
    section: currentSection || 'fiches_techniques',
    image_url: '',
    steps: '',
    ingredients: [],
    media_urls: []
  });

  useEffect(() => {
    if (recipe) {
      setForm({
        name: recipe.name || '',
        section: recipe.section || currentSection || 'fiches_techniques',
        image_url: recipe.image_url || '',
        steps: recipe.steps || '',
        ingredients: recipe.ingredients || [],
        media_urls: recipe.media_urls || []
      });
    } else {
      setForm({
        name: '',
        section: currentSection || 'fiches_techniques',
        image_url: '',
        steps: '',
        ingredients: [],
        media_urls: []
      });
    }
  }, [recipe, open, currentSection]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const payload = {
        ...data,
        author: currentUser?.email,
        author_name: currentUser?.full_name || currentUser?.email
      };
      
      if (recipe?.id) {
        return base44.entities.Recipe.update(recipe.id, payload);
      }
      return base44.entities.Recipe.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      onClose();
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(form);
  };

  const handleGenerateImage = async () => {
    if (!form.name) return;
    setGenerating(true);
    try {
      const result = await base44.integrations.Core.GenerateImage({
        prompt: `Professional food photography of "${form.name}", gourmet dish, restaurant quality, clean white plate, elegant presentation, studio lighting`
      });
      if (result?.url) {
        setForm(prev => ({ ...prev, image_url: result.url }));
      }
    } catch (error) {
      console.error('Image generation failed:', error);
    }
    setGenerating(false);
  };

  const handleUploadImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file });
      if (result?.file_url) {
        setForm(prev => ({ ...prev, image_url: result.file_url }));
      }
    } catch (error) {
      console.error('Upload failed:', error);
    }
    setUploading(false);
  };

  const addIngredient = () => {
    setForm(prev => ({
      ...prev,
      ingredients: [...prev.ingredients, { name: '', quantity: '' }]
    }));
  };

  const updateIngredient = (index, field, value) => {
    setForm(prev => ({
      ...prev,
      ingredients: prev.ingredients.map((ing, i) => 
        i === index ? { ...ing, [field]: value } : ing
      )
    }));
  };

  const removeIngredient = (index) => {
    setForm(prev => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== index)
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{recipe ? 'Modifier la recette' : 'Nouvelle recette'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="name">Nom de la recette *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Risotto aux champignons"
                className="bg-slate-700 border-slate-600 mt-1"
                required
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <Label>Section</Label>
              <Select
                value={form.section}
                onValueChange={(value) => setForm(prev => ({ ...prev, section: value }))}
              >
                <SelectTrigger className="bg-slate-700 border-slate-600 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-700 border-slate-600">
                  {SECTIONS.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Image */}
          <div>
            <Label>Image</Label>
            <div className="mt-2 space-y-3">
              {form.image_url && (
                <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-slate-600">
                  <img 
                    src={form.image_url} 
                    alt="Preview" 
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGenerateImage}
                  disabled={generating || !form.name}
                  className="border-slate-600"
                >
                  {generating ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  Générer IA
                </Button>
                
                <label className="cursor-pointer">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-slate-600 pointer-events-none"
                    disabled={uploading}
                  >
                    {uploading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4 mr-2" />
                    )}
                    Upload photo
                  </Button>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUploadImage}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Ingredients */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Ingrédients</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addIngredient}
                className="text-emerald-400"
              >
                <Plus className="w-4 h-4 mr-1" />
                Ajouter
              </Button>
            </div>
            
            <div className="space-y-2">
              {form.ingredients.map((ing, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={ing.name}
                    onChange={(e) => updateIngredient(index, 'name', e.target.value)}
                    placeholder="Ingrédient"
                    className="bg-slate-700 border-slate-600 flex-1"
                  />
                  <Input
                    value={ing.quantity}
                    onChange={(e) => updateIngredient(index, 'quantity', e.target.value)}
                    placeholder="Quantité"
                    className="bg-slate-700 border-slate-600 w-28"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeIngredient(index)}
                    className="text-slate-400 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              
              {form.ingredients.length === 0 && (
                <p className="text-sm text-slate-500 py-2">
                  Aucun ingrédient ajouté
                </p>
              )}
            </div>
          </div>

          {/* Steps */}
          <div>
            <Label htmlFor="steps">Étapes de préparation</Label>
            <Textarea
              id="steps"
              value={form.steps}
              onChange={(e) => setForm(prev => ({ ...prev, steps: e.target.value }))}
              placeholder="1. Première étape...&#10;2. Deuxième étape..."
              className="bg-slate-700 border-slate-600 mt-1 min-h-[200px]"
            />
            <p className="text-xs text-slate-500 mt-1">
              Vous pouvez utiliser le format Markdown pour la mise en forme
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <Button type="button" variant="outline" onClick={onClose} className="border-slate-600">
              Annuler
            </Button>
            <Button 
              type="submit" 
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {recipe ? 'Mettre à jour' : 'Créer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}