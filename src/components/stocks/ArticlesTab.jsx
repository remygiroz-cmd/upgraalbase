import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, Search, Edit2, Trash2, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';

const CATEGORY_COLORS = {
  'viandes': '#dc2626',
  'poisson': '#0891b2',
  'fruits': '#f97316',
  'légumes': '#22c55e',
  'laitages': '#f59e0b',
  'surgelés': '#3b82f6',
  'condiments': '#8b5cf6',
  'boissons': '#ec4899',
};

export default function ArticlesTab() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#2563eb');
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }, 'name')
  });

  const { data: categories = [], isLoading: loadingCategories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.filter({ is_active: true }, 'name')
  });

  const createCategoryMutation = useMutation({
    mutationFn: (data) => base44.entities.Category.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setNewCategoryName('');
      setShowNewCategoryInput(false);
    }
  });

  const deleteProductMutation = useMutation({
    mutationFn: (id) => base44.entities.Product.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    }
  });

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleCreateCategory = () => {
    if (newCategoryName.trim()) {
      createCategoryMutation.mutate({
        name: newCategoryName,
        color: newCategoryColor
      });
    }
  };

  if (loadingProducts || loadingCategories) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      {/* New Category Section */}
      <div className="bg-white rounded-lg border-2 border-gray-300 p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Nouvelle catégorie</h3>
        <div className="flex items-center gap-2 mb-3">
          <Input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="Ex: Poisson..."
            className="bg-gray-50 border-gray-300 text-gray-900 flex-1"
          />
          <div className="flex gap-1">
            {['#dc2626', '#0891b2', '#f97316', '#22c55e', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f43f5e', '#06b6d4'].map(color => (
              <button
                key={color}
                onClick={() => setNewCategoryColor(color)}
                className={`w-6 h-6 rounded-full border-2 ${newCategoryColor === color ? 'border-gray-900' : 'border-gray-300'}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <Button
            onClick={handleCreateCategory}
            disabled={!newCategoryName.trim() || createCategoryMutation.isPending}
            className="bg-orange-600 hover:bg-orange-700"
          >
            + Créer
          </Button>
        </div>
      </div>

      {/* Search and Category Filters */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ex: Poisson..."
            className="pl-10 bg-white border-gray-300 text-gray-900"
          />
        </div>

        <div className="flex flex-wrap gap-2">
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
                  ? 'bg-blue-600 text-white'
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
        </div>
      </div>

      {/* Products Grid */}
      {filteredProducts.length === 0 ? (
        <EmptyState
          icon={Filter}
          title="Aucun article trouvé"
          description="Essayez une autre recherche ou catégorie"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map(product => (
            <div
              key={product.id}
              className="bg-white rounded-lg border-2 border-gray-300 overflow-hidden hover:border-gray-400 transition-all"
            >
              {product.image_url ? (
                <div className="w-full h-32 overflow-hidden bg-gray-100">
                  <img
                    src={product.image_url}
                    alt={product.name}
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
                  <h3 className="font-semibold text-gray-900 flex-1">{product.name}</h3>
                  <div className="flex gap-1 ml-2">
                    <button className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Supprimer cet article?')) {
                          deleteProductMutation.mutate(product.id);
                        }
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {product.category && (
                  <Badge
                    className="mb-3"
                    style={{
                      backgroundColor: categories.find(c => c.name === product.category)?.color || '#2563eb',
                      color: 'white',
                      border: 'none'
                    }}
                  >
                    {product.category}
                  </Badge>
                )}

                <div className="space-y-1 text-sm text-gray-700">
                  {product.unit_price > 0 && (
                    <p className="font-semibold text-orange-600">
                      {product.unit_price.toFixed(2)} € / {product.unit || 'unité'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}