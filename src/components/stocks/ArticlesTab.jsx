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
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.filter({ is_active: true }, 'name')
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

  const handleDragEnd = (result) => {
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
    updatedList.forEach((article, index) => {
      if (article[orderField] !== index) {
        updateOrderMutation.mutate({ 
          id: article.id, 
          data: { [orderField]: index }
        });
      }
    });
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
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ex: Poisson..."
              className="pl-10 bg-white border-gray-300 text-gray-900"
            />
          </div>
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
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('shopping')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              viewMode === 'shopping'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
            }`}
          >
            Parcours Magasin
          </button>
          <button
            onClick={() => setViewMode('storage')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              viewMode === 'storage'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
            }`}
          >
            Stockage Boutique
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
          <div className="space-y-8">
            {Object.entries(groupedArticles).map(([groupKey, groupArticles]) => {
              const groupColor = viewMode === 'storage' && categories.find(c => c.name === groupKey)?.color;
              return (
              <div key={groupKey}>
                <h3 
                  className="text-lg font-semibold mb-4 pb-2 border-b-2"
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
                      className={`space-y-2 p-4 rounded-lg transition-all duration-150 ease-out ${
                        snapshot.isDraggingOver 
                          ? 'bg-blue-100 border-2 border-blue-400 shadow-md' 
                          : 'bg-transparent border-2 border-dashed border-gray-300'
                      }`}
                    >
                      {supplierArticles.map((article, index) => (
                        <Draggable key={article.id} draggableId={article.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`bg-white rounded-lg border-2 overflow-hidden flex items-center gap-3 p-4 transition-all duration-150 ease-out ${
                                snapshot.isDragging
                                  ? 'border-blue-600 shadow-2xl bg-blue-50 z-50 scale-105'
                                  : 'border-gray-300 hover:border-blue-400 hover:shadow-md'
                              }`}
                            >
                              <div className="flex items-start gap-2 cursor-grab active:cursor-grabbing flex-1 min-w-0" {...provided.dragHandleProps}>
                                <GripVertical className={`w-5 h-5 flex-shrink-0 transition-colors ${snapshot.isDragging ? 'text-blue-600' : 'text-gray-400'}`} />
                                <div className="flex-1 min-w-0">
                                  {article.image_url && (
                                    <div className="w-12 h-12 rounded mb-2 overflow-hidden bg-gray-100 flex-shrink-0">
                                      <img
                                        src={article.image_url}
                                        alt={article.name}
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                  )}
                                  <div className="flex items-center gap-2">
                                    <h3 className="font-semibold text-gray-900 truncate">{article.name}</h3>
                                    <span className="inline-block px-2 py-0.5 bg-gray-200 text-gray-800 text-xs font-bold rounded flex-shrink-0">
                                      #{(viewMode === 'shopping' ? article.order : article.storage_order) + 1}
                                    </span>
                                  </div>
                                  <div className="flex gap-3 mt-1 text-xs text-gray-600 flex-wrap">
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
                              <div className="flex gap-1 flex-shrink-0">
                                <button
                                  onClick={() => {
                                    setEditingArticle(article);
                                    setShowForm(true);
                                  }}
                                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm('Supprimer cet article?')) {
                                      deleteArticleMutation.mutate(article.id);
                                    }
                                  }}
                                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
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
            ))}
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