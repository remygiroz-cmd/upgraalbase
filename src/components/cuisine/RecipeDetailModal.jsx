import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil, CheckCircle2, BookOpen, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function RecipeDetailModal({ recipe, onClose, onEdit, onValidate }) {
  if (!recipe) return null;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <DialogTitle className="flex-1">{recipe.name}</DialogTitle>
            {recipe.is_validated && (
              <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/30 ml-2">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Validé
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Image */}
          {recipe.image_url ? (
            <div className="aspect-video rounded-xl overflow-hidden border border-slate-700">
              <img
                src={recipe.image_url}
                alt={recipe.name}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="aspect-video bg-slate-700/50 rounded-xl flex items-center justify-center">
              <BookOpen className="w-16 h-16 text-slate-600" />
            </div>
          )}

          {/* Meta */}
          <div className="flex flex-wrap gap-4 text-sm text-slate-400">
            {recipe.author_name && (
              <div className="flex items-center gap-2">
                <User className="w-4 h-4" />
                <span>Par {recipe.author_name}</span>
              </div>
            )}
            {recipe.validated_at && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>
                  Validé le {format(new Date(recipe.validated_at), "d MMMM yyyy", { locale: fr })}
                </span>
              </div>
            )}
          </div>

          {/* Ingredients */}
          {recipe.ingredients && recipe.ingredients.length > 0 && (
            <div>
              <h3 className="font-semibold mb-3">Ingrédients</h3>
              <div className="bg-slate-700/30 rounded-xl p-4">
                <ul className="space-y-2">
                  {recipe.ingredients.map((ing, index) => (
                    <li key={index} className="flex justify-between">
                      <span>{ing.name}</span>
                      <span className="text-slate-400">{ing.quantity}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Steps */}
          {recipe.steps && (
            <div>
              <h3 className="font-semibold mb-3">Préparation</h3>
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{recipe.steps}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            {onValidate && (
              <Button
                onClick={onValidate}
                variant="outline"
                className="border-emerald-600 text-emerald-400 hover:bg-emerald-600/20"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Valider la recette
              </Button>
            )}
            <Button
              onClick={onEdit}
              variant="outline"
              className="border-slate-600"
            >
              <Pencil className="w-4 h-4 mr-2" />
              Modifier
            </Button>
            <Button onClick={onClose} className="bg-slate-600 hover:bg-slate-500">
              Fermer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}