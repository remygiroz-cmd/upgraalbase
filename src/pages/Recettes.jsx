import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { BookOpen, Plus, Search, CheckCircle2, Archive, FlaskConical, FileText, Pencil, Trash2, ArchiveRestore } from 'lucide-react';
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
{ value: 'archives', label: 'Archives', icon: Archive }];


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

  const archiveMutation = useMutation({
    mutationFn: (recipe) => base44.entities.Recipe.update(recipe.id, {
      section: 'archives'
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipes'] })
  });

  const restoreMutation = useMutation({
    mutationFn: ({ recipeId, originalSection }) => base44.entities.Recipe.update(recipeId, {
      section: originalSection
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipes'] })
  });

  const filteredRecipes = recipes.filter((r) => {
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
          className="bg-orange-600 hover:bg-orange-700">

            <Plus className="w-4 h-4 mr-2" />
            Nouvelle recette
          </Button>
        } />


      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <Button
              key={section.value}
              variant="outline"
              onClick={() => setActiveSection(section.value)}
              className={cn(
                "border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700",
                activeSection === section.value && "bg-slate-700 text-slate-100"
              )}>

              <Icon className="w-4 h-4 mr-2" />
              {section.label}
            </Button>);

        })}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Rechercher une recette..." className="bg-slate-50 text-slate-100 px-3 py-1 text-base rounded-md flex h-9 w-full border shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm border-slate-700" />


      </div>

      {/* Recipes Grid */}
      {filteredRecipes.length === 0 ?
      <EmptyState
        icon={BookOpen}
        title="Aucune recette"
        description={searchQuery ? "Aucun résultat pour cette recherche" : "Ajoutez votre première recette"}
        action={
        !searchQuery &&
        <Button
          onClick={() => setShowFormModal(true)}
          className="bg-orange-600 hover:bg-orange-700">

                <Plus className="w-4 h-4 mr-2" />
                Créer une recette
              </Button>

        } /> :


      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {filteredRecipes.map((recipe) =>
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
            onClick={() => setViewingRecipe(recipe)}>

                {/* Image */}
                {recipe.image_url ?
            <div className="aspect-video overflow-hidden">
                    <img
                src={recipe.image_url}
                alt={recipe.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />

                  </div> :

            <div className="aspect-video bg-slate-700/50 flex items-center justify-center">
                    <BookOpen className="w-12 h-12 text-slate-600" />
                  </div>
            }

                {/* Content */}
                <div className="bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium line-clamp-2">{recipe.name}</h3>
                    {recipe.is_validated &&
                <Badge className="bg-orange-600/20 text-orange-400 border-orange-600/30 flex-shrink-0">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Validé
                      </Badge>
                }
                  </div>
                  
                  {recipe.author_name &&
              <p className="text-sm text-slate-400 mt-2">
                      Par {recipe.author_name}
                    </p>
              }
                </div>

                {/* Actions overlay */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {activeSection === 'archives' ?
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const originalSection = recipe.section === 'archives' ? 'fiches_techniques' : recipe.section;
                  if (confirm('Restaurer cette recette ?')) {
                    restoreMutation.mutate({ recipeId: recipe.id, originalSection });
                  }
                }}
                className="p-2 rounded-lg bg-slate-800/90 hover:bg-green-600/80 text-slate-300 hover:text-white transition-colors"
                title="Restaurer">

                      <ArchiveRestore className="w-4 h-4" />
                    </button> :

              <>
                      <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(recipe);
                  }}
                  className="p-2 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 transition-colors"
                  title="Modifier">

                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Archiver cette recette ?')) {
                      archiveMutation.mutate(recipe);
                    }
                  }}
                  className="p-2 rounded-lg bg-slate-800/90 hover:bg-orange-600/80 text-slate-300 hover:text-white transition-colors"
                  title="Archiver">

                        <Archive className="w-4 h-4" />
                      </button>
                    </>
              }
                  <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm('Supprimer définitivement cette recette ?')) {
                    deleteMutation.mutate(recipe.id);
                  }
                }}
                className="p-2 rounded-lg bg-slate-800/90 hover:bg-red-600/80 text-slate-300 hover:text-white transition-colors"
                title="Supprimer">

                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
          )}
          </AnimatePresence>
        </div>
      }

      {/* Form Modal */}
      <RecipeFormModal
        open={showFormModal}
        onClose={handleCloseForm}
        recipe={editingRecipe}
        currentSection={activeSection} />


      {/* Detail Modal */}
      {viewingRecipe &&
      <RecipeDetailModal
        recipe={viewingRecipe}
        onClose={() => setViewingRecipe(null)}
        onEdit={() => {
          setViewingRecipe(null);
          handleEdit(viewingRecipe);
        }}
        onValidate={isAdmin && !viewingRecipe.is_validated ? () => validateMutation.mutate(viewingRecipe) : null} />

      }
    </div>);

}