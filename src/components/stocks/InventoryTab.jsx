import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, ShoppingCart, RotateCcw, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export default function InventoryTab() {
  const [inventorySubTab, setInventorySubTab] = useState('stock-status');
  const [stockValues, setStockValues] = useState({});
  const [cart, setCart] = useState({});
  const [showAll, setShowAll] = useState(false);
  const [completedArticles, setCompletedArticles] = useState(new Set());

  const { data: articles = [] } = useQuery({
    queryKey: ['articles'],
    queryFn: () => base44.entities.Article.filter({ is_active: true })
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.filter({ is_active: true }, 'order')
  });

  // Obtenir le jour actuel (L, MA, ME, J, V, S, D)
  const getCurrentDay = () => {
    const days = ['D', 'L', 'MA', 'ME', 'J', 'V', 'S'];
    const today = new Date().getDay();
    return days[today];
  };

  const currentDay = getCurrentDay();

  // Filtrer les articles dont le jour de comptage correspond à aujourd'hui
  const todayArticles = articles.filter(article => 
    article.counting_days?.includes(currentDay)
  );

  // Filtrer les articles non remplis (sauf si showAll est activé)
  const filteredArticles = showAll 
    ? todayArticles 
    : todayArticles.filter(article => !completedArticles.has(article.id));

  // Grouper par catégorie
  const groupedByCategory = filteredArticles.reduce((acc, article) => {
    const category = article.category || 'Sans catégorie';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(article);
    return acc;
  }, {});

  const handleStockChange = (articleId, value, article) => {
    setStockValues(prev => ({
      ...prev,
      [articleId]: value
    }));

    // Pour juste_a_cocher, marquer comme complété immédiatement si coché
    if (article.inventory_mode === 'juste_a_cocher' && value === true) {
      setCompletedArticles(prev => new Set(prev).add(articleId));
    }

    // Mettre à jour le panier automatiquement
    if (article.inventory_mode === 'stock_reel') {
      const safetyStock = article.safety_stock?.[currentDay] || 0;
      const currentStock = value;
      const toOrder = Math.max(0, safetyStock - currentStock);
      
      if (toOrder > 0) {
        setCart(prev => ({
          ...prev,
          [articleId]: {
            article,
            quantity: toOrder,
            initialQuantity: toOrder
          }
        }));
      } else {
        setCart(prev => {
          const newCart = { ...prev };
          delete newCart[articleId];
          return newCart;
        });
      }
    } else {
      // juste_a_cocher
      if (value === true) {
        const orderQty = article.order_quantity?.[currentDay] || 0;
        setCart(prev => ({
          ...prev,
          [articleId]: {
            article,
            quantity: orderQty,
            initialQuantity: orderQty
          }
        }));
      } else {
        setCart(prev => {
          const newCart = { ...prev };
          delete newCart[articleId];
          return newCart;
        });
      }
    }
  };

  const getDayLabel = (day) => {
    const labels = {
      'L': 'Lundi',
      'MA': 'Mardi', 
      'ME': 'Mercredi',
      'J': 'Jeudi',
      'V': 'Vendredi',
      'S': 'Samedi',
      'D': 'Dimanche'
    };
    return labels[day] || day;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Inventaire du jour</h2>
          <p className="text-sm text-gray-600">
            Liste filtrée selon les jours de comptage paramétrés
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-purple-600 text-purple-600 hover:bg-purple-50">
            <Plus className="w-4 h-4 mr-2" />
            Ajout Libre
          </Button>
          <Button className="bg-orange-600 hover:bg-orange-700">
            <ShoppingCart className="w-4 h-4 mr-2" />
            Commande Exceptionnelle
          </Button>
        </div>
      </div>

      {/* Sub Tabs */}
      <Tabs value={inventorySubTab} onValueChange={setInventorySubTab}>
        <div className="flex gap-4">
          <TabsList className="bg-transparent gap-2">
            <TabsTrigger
              value="stock-status"
              className="relative px-4 py-2 rounded-lg border-2 border-gray-300 data-[state=active]:border-orange-600 data-[state=active]:bg-transparent data-[state=active]:text-gray-900"
            >
              État des stocks
              {todayArticles.length > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                  {todayArticles.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="cart"
              className="px-4 py-2 rounded-lg border-2 border-gray-300 data-[state=active]:border-orange-600 data-[state=active]:bg-transparent data-[state=active]:text-gray-900"
            >
              Panier
              {Object.keys(cart).length > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-orange-600 text-white text-xs rounded-full">
                  {Object.keys(cart).length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <Button 
            className="ml-auto bg-orange-600 hover:bg-orange-700 px-8"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? 'Masquer remplis' : 'Voir tout'}
          </Button>
        </div>

        <TabsContent value="stock-status" className="mt-6">
          {todayArticles.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p>Aucun article à compter aujourd'hui ({getDayLabel(currentDay)})</p>
            </div>
          ) : filteredArticles.length === 0 && !showAll ? (
            <div className="text-center py-16 text-gray-500">
              <p>✓ Tous les articles ont été remplis</p>
              <Button 
                className="mt-4 bg-orange-600 hover:bg-orange-700"
                onClick={() => setShowAll(true)}
              >
                Voir tout
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedByCategory).map(([categoryName, categoryArticles]) => {
                const category = categories.find(c => c.name === categoryName);
                return (
                  <div key={categoryName}>
                    {/* Category Header */}
                    <div 
                      className="px-4 py-2 rounded-t-lg font-bold text-white flex items-center gap-2"
                      style={{ backgroundColor: category?.color || '#6b7280' }}
                    >
                      <span className="w-3 h-3 rounded-full bg-white"></span>
                      {categoryName.toUpperCase()}
                    </div>

                    {/* Category Articles */}
                    <div className="bg-gray-900 rounded-b-lg divide-y divide-gray-700">
                      {categoryArticles.map((article) => (
                        <div 
                          key={article.id}
                          className="px-4 py-4 flex items-center justify-between hover:bg-gray-800 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            {article.image_url && (
                              <img 
                                src={article.image_url} 
                                alt={article.name}
                                className="w-10 h-10 rounded object-cover"
                              />
                            )}
                            <div>
                              <h4 className="font-semibold text-white">{article.name}</h4>
                              <div className="flex gap-2 text-xs mt-1">
                                {article.inventory_mode === 'stock_reel' ? (
                                  <span className="px-2 py-0.5 bg-orange-600 text-white rounded">
                                    # Stock Réel
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-purple-600 text-white rounded">
                                    ☑ Juste à cocher
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="text-xs text-gray-400 uppercase">En réserve</div>
                              {article.inventory_mode === 'juste_a_cocher' ? (
                                <div className="flex items-center gap-2">
                                  <div className="text-sm text-gray-300">
                                    {article.order_quantity?.[currentDay] || 0}
                                  </div>
                                  <Button
                                    variant={stockValues[article.id] ? "default" : "outline"}
                                    size="sm"
                                    className={stockValues[article.id] 
                                      ? "bg-emerald-600 hover:bg-emerald-700 gap-2" 
                                      : "border-gray-600 text-gray-400 hover:bg-gray-700 hover:border-gray-500"
                                    }
                                    onClick={() => handleStockChange(article.id, !stockValues[article.id], article)}
                                  >
                                    {stockValues[article.id] && <Check className="w-4 h-4" />}
                                    COMMANDER
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => {
                                      const currentValue = stockValues[article.id] ?? article.safety_stock?.[currentDay] ?? 0;
                                      handleStockChange(article.id, Math.max(0, currentValue - 1), article);
                                    }}
                                    className="w-8 h-8 rounded bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg active:scale-95 transition-transform"
                                  >
                                    -
                                  </button>
                                  <div className="w-12 h-8 flex items-center justify-center bg-gray-800 border border-gray-600 text-white font-semibold rounded">
                                    {stockValues[article.id] ?? article.safety_stock?.[currentDay] ?? 0}
                                  </div>
                                  <button
                                    onClick={() => {
                                      const currentValue = stockValues[article.id] ?? article.safety_stock?.[currentDay] ?? 0;
                                      handleStockChange(article.id, currentValue + 1, article);
                                    }}
                                    className="w-8 h-8 rounded bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg active:scale-95 transition-transform"
                                  >
                                    +
                                  </button>
                                  <button
                                    onClick={() => {
                                      const resetValue = { ...stockValues };
                                      delete resetValue[article.id];
                                      setStockValues(resetValue);
                                    }}
                                    className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors ml-1"
                                    title="Réinitialiser"
                                  >
                                    <RotateCcw className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                            {article.inventory_mode === 'stock_reel' && (
                              <button
                                onClick={() => {
                                  setCompletedArticles(prev => new Set(prev).add(article.id));
                                }}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

            </div>
          )}
        </TabsContent>

        <TabsContent value="cart" className="mt-6">
          {Object.keys(cart).length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p>Panier vide</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.values(cart).map(({ article, quantity, initialQuantity }) => (
                <div 
                  key={article.id}
                  className="bg-white rounded-lg border-2 border-gray-300 p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    {article.image_url && (
                      <img 
                        src={article.image_url} 
                        alt={article.name}
                        className="w-12 h-12 rounded object-cover"
                      />
                    )}
                    <div>
                      <h4 className="font-semibold text-gray-900">{article.name}</h4>
                      <div className="flex gap-2 text-xs mt-1">
                        <span className="text-gray-600">{article.supplier_name}</span>
                        {article.category && (
                          <span className="text-gray-600">• {article.category}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          if (quantity > 1) {
                            setCart(prev => ({
                              ...prev,
                              [article.id]: { article, quantity: quantity - 1, initialQuantity }
                            }));
                          } else {
                            setCart(prev => {
                              const newCart = { ...prev };
                              delete newCart[article.id];
                              return newCart;
                            });
                          }
                        }}
                        className="w-8 h-8 rounded bg-gray-200 hover:bg-gray-300 text-gray-900 font-bold text-lg active:scale-95 transition-transform"
                      >
                        -
                      </button>
                      <div className="w-16 h-8 flex items-center justify-center bg-white border-2 border-orange-600 text-gray-900 font-bold rounded">
                        {quantity}
                      </div>
                      <button
                        onClick={() => {
                          setCart(prev => ({
                            ...prev,
                            [article.id]: { article, quantity: quantity + 1, initialQuantity }
                          }));
                        }}
                        className="w-8 h-8 rounded bg-gray-200 hover:bg-gray-300 text-gray-900 font-bold text-lg active:scale-95 transition-transform"
                      >
                        +
                      </button>
                      <button
                        onClick={() => {
                          setCart(prev => ({
                            ...prev,
                            [article.id]: { article, quantity: initialQuantity, initialQuantity }
                          }));
                        }}
                        className="p-1.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-900 transition-colors ml-1"
                        title="Réinitialiser"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="text-xs text-gray-500">
                      {article.unit || 'unités'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Bouton Valider Commande - visible sur tous les onglets */}
      <div className="flex justify-center pt-6">
        <Button className="bg-emerald-600 hover:bg-emerald-700 px-8">
          <ShoppingCart className="w-4 h-4 mr-2" />
          Valider Commande
        </Button>
      </div>
    </div>
  );
}