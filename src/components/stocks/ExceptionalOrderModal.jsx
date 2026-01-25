import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';

export default function ExceptionalOrderModal({ isOpen, onClose, articles = [], todayArticles = [], onAddToCart }) {
  const [search, setSearch] = useState('');
  const [selectedItems, setSelectedItems] = useState({});

  // Articles qui NE sont PAS prévus pour aujourd'hui
  const exceptionalArticles = articles.filter(article => 
    article.is_active && !todayArticles.some(ta => ta.id === article.id)
  );

  // Filtrer par recherche
  const filteredArticles = exceptionalArticles.filter(article =>
    article.name.toLowerCase().includes(search.toLowerCase()) ||
    article.category?.toLowerCase().includes(search.toLowerCase()) ||
    article.supplier_name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleQuantityChange = (articleId, quantity) => {
    if (quantity <= 0) {
      setSelectedItems(prev => {
        const newItems = { ...prev };
        delete newItems[articleId];
        return newItems;
      });
    } else {
      setSelectedItems(prev => ({
        ...prev,
        [articleId]: quantity
      }));
    }
  };

  const handleValidate = () => {
    Object.entries(selectedItems).forEach(([articleId, quantity]) => {
      const article = exceptionalArticles.find(a => a.id === articleId);
      if (article) {
        onAddToCart(article, quantity);
      }
    });
    setSelectedItems({});
    setSearch('');
    onClose();
  };

  const handleCancel = () => {
    setSelectedItems({});
    setSearch('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-orange-500 text-white max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">⚡</span>
              <DialogTitle className="text-lg font-bold text-white">Commande Exceptionnelle</DialogTitle>
            </div>
            <button 
              onClick={handleCancel}
              className="p-1 hover:bg-slate-700 rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Recherche */}
          <div className="relative flex-shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Rechercher un produit hors planning..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-800 border-slate-600 text-white placeholder:text-gray-400 pl-10 h-12"
            />
          </div>

          {/* Liste des articles */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {filteredArticles.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                {search ? 'Aucun article trouvé' : 'Tous les articles sont déjà planifiés aujourd\'hui'}
              </div>
            ) : (
              filteredArticles.map((article) => (
                <div
                  key={article.id}
                  className="bg-slate-700/50 hover:bg-slate-700 rounded-lg p-3 border-2 border-transparent hover:border-orange-500 transition-all"
                >
                  <div className="flex items-center gap-3">
                    {article.image_url && (
                      <img 
                        src={article.image_url} 
                        alt={article.name}
                        className="w-12 h-12 rounded object-cover flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-white truncate">{article.name}</h4>
                      <p className="text-xs text-gray-400 truncate">
                        {article.category && `${article.category} • `}
                        {article.supplier_name}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleQuantityChange(article.id, (selectedItems[article.id] || 0) - 1)}
                        className="w-8 h-8 rounded bg-slate-600 hover:bg-slate-500 text-white font-bold transition-colors"
                        disabled={!selectedItems[article.id]}
                      >
                        -
                      </button>
                      <div className="w-12 h-8 flex items-center justify-center bg-orange-600 text-white font-bold rounded">
                        {selectedItems[article.id] || 0}
                      </div>
                      <button
                        onClick={() => handleQuantityChange(article.id, (selectedItems[article.id] || 0) + 1)}
                        className="w-8 h-8 rounded bg-slate-600 hover:bg-slate-500 text-white font-bold transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Actions */}
          <div className="flex-shrink-0 pt-4 border-t border-slate-700">
            <Button
              onClick={handleValidate}
              disabled={Object.keys(selectedItems).length === 0}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold h-12 text-base"
            >
              VALIDER LES AJOUTS
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}