import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, Search, Edit2, Trash2, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ArticleFormModal from './ArticleFormModal';
import CategoryManager from './CategoryManager';

export default function ArticlesTab() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingArticle, setEditingArticle] = useState(null);

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

  const filteredArticles = articles.filter(a => {
    const matchesSearch = a.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || a.category === selectedCategory;
    const matchesSupplier = !selectedSupplier || a.supplier_name === selectedSupplier;
    return matchesSearch && matchesCategory && matchesSupplier;
  });

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
      </div>

      {/* Articles Grid */}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredArticles.map(article => (
            <div
              key={article.id}
              className="bg-white rounded-lg border-2 border-gray-300 overflow-hidden hover:border-gray-400 transition-all"
            >
              {article.image_url ? (
                <div className="w-full h-32 overflow-hidden bg-gray-100">
                  <img
                    src={article.image_url}
                    alt={article.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-full h-32 bg-gray-200 flex items-center justify-center">
                  <span className="text-gray-400 text-sm">Pas d'image</span>
                </div>
              )}

              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 flex-1">{article.name}</h3>
                  <div className="flex gap-1 ml-2">
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

                {article.category && (
                  <Badge
                    className="mb-3"
                    style={{
                      backgroundColor: categories.find(c => c.name === article.category)?.color || '#2563eb',
                      color: 'white',
                      border: 'none'
                    }}
                  >
                    {article.category}
                  </Badge>
                )}

                <div className="space-y-1 text-sm text-gray-700">
                  {article.supplier_name && (
                    <p className="font-medium text-gray-900">
                      {article.supplier_name}
                    </p>
                  )}
                  {article.unit_price > 0 && (
                    <p className="font-semibold text-orange-600">
                      {article.unit_price.toFixed(2)} € / {article.unit || 'unité'}
                    </p>
                  )}
                  {article.brand && (
                    <p className="text-xs text-gray-600">
                      Marque: {article.brand}
                    </p>
                  )}
                  {article.supplier_reference && (
                    <p className="text-xs text-gray-600">
                      Réf: {article.supplier_reference}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
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
      />
    </div>
  );
}