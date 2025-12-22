import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { BookOpen, Plus, Search, CheckCircle2, Archive, FlaskConical, FileText, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import PageHeader from '@/components/ui/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import RecipeFormModal from '@/components/cuisine/RecipeFormModal';
import RecipeDetailModal from '@/components/cuisine/RecipeDetailModal';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { value: 'fiches_techniques', label: 'Fiches Techniques', icon: FileText },
  { value: 'labo', label: 'Labo / Créations', icon: FlaskConical },
  { value: 'archives', label: 'Archives', icon: Archive },
];

export default function Recettes() {
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState('fiches_techniques');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [viewingRecipe, setViewingRecipe] = useState(null);

  const { data: recipes = [], isLoading } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => base44.entities.Recipe.list('-created_date')
  });

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Recipe.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipes'] })
  });

  const validateMutation = useMutation({
    mutationFn: (recipe) => base44.entities.Recipe.update(recipe.id, {
      is_validated: true,
      validated_by: currentUser?.email,
      validated_at: new Date().toISOString()
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipes'] })
  });

  const filteredRecipes = recipes.filter(r => {
    if (r.section !== activeSection) return false;
    if (searchQuery && !r.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const handleEdit = (recipe) => {
    setEditingRecipe(recipe);
    setShowFormModal(true);
  };

  const handleCloseForm = () => {
    setShowFormModal(false);
    setEditingRecipe(null);
  };

  const isAdmin = currentUser?.role === 'admin';

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <PageHeader
        icon={BookOpen}
        title="Recettes & Créations"
        subtitle="Fiches techniques et créations culinaires"
        actions={
          <Button
            onClick={() => setShowFormModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nouvelle recette
          </Button>
        }
      />

      {/* Tabs */}
      <Tabs value={activeSection} onValueChange={setActiveSection} className="mb-6">
        <TabsList className="bg-slate-800 p-1">
          {SECTIONS.map(section => (
            <TabsTrigger
              key={section.value}
              value={section.value}
              className="data-[state=active]:bg-slate-700"
            >
              <section.icon className="w-4 h-4 mr-2" />
              {section.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Rechercher une recette..."
          className="pl-10 bg-slate-800 border-slate-700"
        />
      </div>

      {/* Recipes Grid */}
      {filteredRecipes.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Aucune recette"
          description={searchQuery ? "Aucun résultat pour cette recherche" : "Ajoutez votre première recette"}
          action={
            !searchQuery && (
              <Button
                onClick={() => setShowFormModal(true)}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Créer une recette
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {filteredRecipes.map(recipe => (
              <motion.div
                key={recipe.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={cn(
                  "group relative bg-slate-800/50 rounded-2xl border border-slate-700/50",
                  "hover:border-slate-600/50 transition-all cursor-pointer overflow-hidden"
                )}
                onClick={() => setViewingRecipe(recipe)}
              >
                {/* Image */}
                {recipe.image_url ? (
                  <div className="aspect-video overflow-hidden">
                    <img
                      src={recipe.image_url}
                      alt={recipe.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                ) : (
                  <div className="aspect-video bg-slate-700/50 flex items-center justify-center">
                    <BookOpen className="w-12 h-12 text-slate-600" />
                  </div>
                )}

                {/* Content */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium line-clamp-2">{recipe.name}</h3>
                    {recipe.is_validated && (
                      <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/30 flex-shrink-0">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Validé
                      </Badge>
                    )}
                  </div>
                  
                  {recipe.author_name && (
                    <p className="text-sm text-slate-400 mt-2">
                      Par {recipe.author_name}
                    </p>
                  )}
                </div>

                {/* Actions overlay */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(recipe);
                    }}
                    className="p-2 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Supprimer cette recette ?')) {
                        deleteMutation.mutate(recipe.id);
                      }
                    }}
                    className="p-2 rounded-lg bg-slate-800/90 hover:bg-red-600/80 text-slate-300 hover:text-white transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Form Modal */}
      <RecipeFormModal
        open={showFormModal}
        onClose={handleCloseForm}
        recipe={editingRecipe}
        currentSection={activeSection}
      />

      {/* Detail Modal */}
      {viewingRecipe && (
        <RecipeDetailModal
          recipe={viewingRecipe}
          onClose={() => setViewingRecipe(null)}
          onEdit={() => {
            setViewingRecipe(null);
            handleEdit(viewingRecipe);
          }}
          onValidate={isAdmin && !viewingRecipe.is_validated ? () => validateMutation.mutate(viewingRecipe) : null}
        />
      )}
    </div>
  );
}