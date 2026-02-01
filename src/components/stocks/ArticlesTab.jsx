import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, Search, Edit2, Trash2, Filter, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ArticleFormModal from './ArticleFormModal';
import CategoryManager from './CategoryManager';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

export default function ArticlesTab() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingArticle, setEditingArticle] = useState(null);
  const [viewMode, setViewMode] = useState('shopping'); // 'shopping' ou 'storage'

  const { data: articles = [], isLoading: loadingArticles } = useQuery({
    queryKey: ['articles'],
    queryFn: () => base44.entities.Article.filter({ is_active: true }, 'name')
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['articleCategories'],
    queryFn: () => base44.entities.ArticleCategory.filter({ is_active: true }, 'name')
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.filter({ is_active: true }, 'name')
  });

  const saveArticleMutation = useMutation({
    mutationFn: ({ id, data }) => {
      if (id) {
        return base44.entities.Article.update(id, data);
      }
      return base44.entities.Article.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articles'] });
      setShowForm(false);
      setEditingArticle(null);
    }
  });

  const deleteArticleMutation = useMutation({
    mutationFn: (id) => base44.entities.Article.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articles'] });
    }
  });

  const updateOrderMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Article.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articles'] });
    }
  });

  const filteredArticles = articles.filter(a => {
    const matchesSearch = a.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || a.category === selectedCategory;
    const matchesSupplier = !selectedSupplier || a.supplier_name === selectedSupplier;
    return matchesSearch && matchesCategory && matchesSupplier;
  });

  // Group articles by supplier or category depending on view mode
  const groupedArticles = filteredArticles.reduce((acc, article) => {
    const groupKey = viewMode === 'shopping' 
      ? (article.supplier_name || 'Sans fournisseur')
      : (article.category || 'Sans catégorie');
    if (!acc[groupKey]) {
      acc[groupKey] = [];
    }
    acc[groupKey].push(article);
    return acc;
  }, {});

  // Sort articles within each group by the appropriate order field
  const orderField = viewMode === 'shopping' ? 'order' : 'storage_order';
  Object.keys(groupedArticles).forEach(groupKey => {
    groupedArticles[groupKey].sort((a, b) => (a[orderField] || 0) - (b[orderField] || 0));
  });

  const handleDragEnd = async (result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const groupKey = destination.droppableId;
    const articlesInGroup = groupedArticles[groupKey] || [];

    // Créer une nouvelle liste avec l'article déplacé
    const updatedList = Array.from(articlesInGroup);
    const [draggedArticle] = updatedList.splice(source.index, 1);
    updatedList.splice(destination.index, 0, draggedArticle);

    // Réassigner les ordres séquentiellement (0, 1, 2, 3...)
    const orderField = viewMode === 'shopping' ? 'order' : 'storage_order';
    const updates = [];
    
    updatedList.forEach((article, index) => {
      if (article[orderField] !== index) {
        updates.push({ id: article.id, [orderField]: index });
      }
    });

    // Faire tous les updates en même temps
    if (updates.length > 0) {
      await Promise.all(
        updates.map(update => 
          base44.entities.Article.update(update.id, { [orderField]: update[orderField] })
        )
      );
      queryClient.invalidateQueries({ queryKey: ['articles'] });
    }
  };

  const handleSave = (data) => {
    saveArticleMutation.mutate({ 
      id: editingArticle?.id, 
      data 
    });
  };

  if (loadingArticles) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Search and Filters */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ex: Poisson..."
              className="pl-10 bg-white border-gray-300 text-gray-900 min-h-[44px]"
            />
          </div>
          <Button
            onClick={() => {
              setEditingArticle(null);
              setShowForm(true);
            }}
            className="bg-orange-600 hover:bg-orange-700 min-h-[44px] w-full sm:w-auto whitespace-nowrap"
          >
            <Plus className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Nouvel article</span>
            <span className="sm:hidden">Nouveau</span>
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              selectedCategory === null
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
            }`}
          >
            Tous les catégories
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.name)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                selectedCategory === cat.name
                  ? 'text-white'
                  : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
              }`}
              style={selectedCategory === cat.name ? { backgroundColor: cat.color || '#2563eb' } : {}}
            >
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: cat.color || '#2563eb' }}
              />
              {cat.name}
            </button>
          ))}
          <CategoryManager categories={categories} />
        </div>

        {/* Supplier Filter */}
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => setSelectedSupplier(null)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              selectedSupplier === null
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
            }`}
          >
            Tous les fournisseurs
          </button>
          {suppliers.map(sup => (
            <button
              key={sup.id}
              onClick={() => setSelectedSupplier(sup.name)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                selectedSupplier === sup.name
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
              }`}
            >
              {sup.name}
            </button>
          ))}
        </div>

        {/* View Mode Toggle */}
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={() => setViewMode('shopping')}
            className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all min-h-[44px] touch-manipulation ${
              viewMode === 'shopping'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
            }`}
          >
            <span className="hidden sm:inline">Parcours Magasin</span>
            <span className="sm:hidden">Magasin</span>
          </button>
          <button
            onClick={() => setViewMode('storage')}
            className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all min-h-[44px] touch-manipulation ${
              viewMode === 'storage'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
            }`}
          >
            <span className="hidden sm:inline">Stockage Boutique</span>
            <span className="sm:hidden">Stockage</span>
          </button>
        </div>
      </div>

      {/* Articles by Supplier with Drag & Drop */}
      {filteredArticles.length === 0 ? (
        <EmptyState
          icon={Filter}
          title="Aucun article trouvé"
          description="Créez votre premier article ou essayez une autre recherche"
          action={
            <Button
              onClick={() => {
                setEditingArticle(null);
                setShowForm(true);
              }}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nouvel article
            </Button>
          }
        />
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="space-y-6 sm:space-y-8">
            {Object.entries(groupedArticles).map(([groupKey, groupArticles]) => {
              const groupColor = viewMode === 'storage' && categories.find(c => c.name === groupKey)?.color;
              return (
                <div key={groupKey}>
                <h3 
                  className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 pb-2 border-b-2 truncate"
                  style={groupColor ? { 
                    color: groupColor, 
                    borderColor: groupColor 
                  } : { 
                    color: '#1f2937', 
                    borderColor: '#d1d5db' 
                  }}
                >
                  {groupKey}
                </h3>
                <Droppable droppableId={groupKey} type="ARTICLE">
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`space-y-2 p-2 sm:p-4 rounded-lg transition-all duration-150 ease-out ${
                        snapshot.isDraggingOver 
                          ? 'bg-blue-100 border-2 border-blue-400 shadow-md' 
                          : 'bg-transparent border-2 border-dashed border-gray-300'
                      }`}
                    >
                      {groupArticles.map((article, index) => (
                        <Draggable key={article.id} draggableId={article.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`bg-white rounded-lg border-2 overflow-hidden flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 p-3 sm:p-4 ${
                                snapshot.isDragging
                                  ? 'border-blue-600 shadow-2xl bg-blue-50 z-50'
                                  : 'border-gray-300 hover:border-blue-400 hover:shadow-md transition-all duration-150'
                              }`}
                            >
                              <div className="flex items-start gap-2 cursor-grab active:cursor-grabbing flex-1 min-w-0 w-full sm:w-auto touch-none" {...provided.dragHandleProps}>
                                <GripVertical className={`w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 transition-colors ${snapshot.isDragging ? 'text-blue-600' : 'text-gray-400'}`} />
                                <div className="flex-1 min-w-0">
                                  {article.image_url && (
                                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded mb-2 overflow-hidden bg-gray-100 flex-shrink-0">
                                      <img
                                        src={article.image_url}
                                        alt={article.name}
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                  )}
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="font-semibold text-gray-900 text-sm sm:text-base truncate">{article.name}</h3>
                                    <span className="inline-block px-1.5 sm:px-2 py-0.5 bg-gray-200 text-gray-800 text-[10px] sm:text-xs font-bold rounded flex-shrink-0">
                                      #{(viewMode === 'shopping' ? article.order : article.storage_order) + 1}
                                    </span>
                                  </div>
                                  <div className="flex gap-2 sm:gap-3 mt-1 text-[11px] sm:text-xs text-gray-600 flex-wrap">
                                    {article.category && (
                                      <span style={{ color: categories.find(c => c.name === article.category)?.color || '#2563eb' }}>
                                        {article.category}
                                      </span>
                                    )}
                                    {article.unit_price > 0 && (
                                      <span className="text-orange-600 font-semibold">
                                        {article.unit_price.toFixed(2)} € / {article.unit || 'unité'}
                                      </span>
                                    )}
                                    {article.supplier_reference && (
                                      <span>Réf: {article.supplier_reference}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex gap-1 flex-shrink-0 w-full sm:w-auto justify-end">
                                <button
                                  onClick={() => {
                                    setEditingArticle(article);
                                    setShowForm(true);
                                  }}
                                  className="p-2 sm:p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    updateOrderMutation.mutate({
                                      id: article.id,
                                      data: { is_hidden: !article.is_hidden }
                                    });
                                  }}
                                  className={`p-2 sm:p-1.5 rounded transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center ${
                                    article.is_hidden 
                                      ? 'text-orange-600 hover:text-orange-700 hover:bg-orange-50' 
                                      : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                                  }`}
                                  title={article.is_hidden ? 'Afficher dans inventaire' : 'Masquer de l\'inventaire'}
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    {article.is_hidden ? (
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    ) : (
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                    )}
                                  </svg>
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm('Supprimer cet article?')) {
                                      deleteArticleMutation.mutate(article.id);
                                    }
                                  }}
                                  className="p-2 sm:p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      )}

      {/* Form Modal */}
      <ArticleFormModal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingArticle(null);
        }}
        onSave={handleSave}
        isSaving={saveArticleMutation.isPending}
        article={editingArticle}
        categories={categories}
        suppliers={suppliers}
        articles={articles}
      />
    </div>
  );
}