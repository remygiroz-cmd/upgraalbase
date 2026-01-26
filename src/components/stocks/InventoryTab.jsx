import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, ShoppingCart, RotateCcw, Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import FreeAddModal from './FreeAddModal';
import ExceptionalOrderModal from './ExceptionalOrderModal';
import OrderConflictModal from './OrderConflictModal';

export default function InventoryTab() {
  const [conflictInfo, setConflictInfo] = useState(null);
  // Charger l'état depuis localStorage
  const [inventorySubTab, setInventorySubTab] = useState(() => {
    const saved = localStorage.getItem('inventorySubTab');
    return saved || 'stock-status';
  });
  
  const [stockValues, setStockValues] = useState(() => {
    const saved = localStorage.getItem('inventoryStockValues');
    return saved ? JSON.parse(saved) : {};
  });
  
  const [cart, setCart] = useState(() => {
    const saved = localStorage.getItem('inventoryCart');
    return saved ? JSON.parse(saved) : {};
  });
  
  const [showAll, setShowAll] = useState(() => {
    const saved = localStorage.getItem('inventoryShowAll');
    return saved === 'true';
  });
  
  const [completedArticles, setCompletedArticles] = useState(() => {
    const saved = localStorage.getItem('inventoryCompletedArticles');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  const [showFreeAddModal, setShowFreeAddModal] = useState(false);
  const [showExceptionalOrderModal, setShowExceptionalOrderModal] = useState(false);

  const queryClient = useQueryClient();

  const createOrderMutation = useMutation({
    mutationFn: (orderData) => base44.entities.Order.create(orderData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Commande créée avec succès');
    }
  });

  const updateOrderMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Order.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Commande mise à jour');
    }
  });

  const deleteOrderMutation = useMutation({
    mutationFn: (id) => base44.entities.Order.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    }
  });

  // Sauvegarder dans localStorage à chaque changement
  useEffect(() => {
    localStorage.setItem('inventorySubTab', inventorySubTab);
  }, [inventorySubTab]);

  useEffect(() => {
    localStorage.setItem('inventoryStockValues', JSON.stringify(stockValues));
  }, [stockValues]);

  useEffect(() => {
    localStorage.setItem('inventoryCart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem('inventoryShowAll', showAll.toString());
  }, [showAll]);

  useEffect(() => {
    localStorage.setItem('inventoryCompletedArticles', JSON.stringify(Array.from(completedArticles)));
  }, [completedArticles]);

  const { data: articles = [] } = useQuery({
    queryKey: ['articles'],
    queryFn: () => base44.entities.Article.filter({ is_active: true })
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.filter({ is_active: true }, 'order')
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.filter({ is_active: true })
  });

  const { data: existingOrders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () => base44.entities.Order.list()
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

  // Trier par storage_order dans chaque catégorie
  Object.keys(groupedByCategory).forEach(category => {
    groupedByCategory[category].sort((a, b) => (a.storage_order || 0) - (b.storage_order || 0));
  });

  const handleStockChange = (articleId, value, article) => {
    setStockValues(prev => ({
      ...prev,
      [articleId]: value
    }));

    // Pour juste_a_cocher, marquer comme complété immédiatement si coché
    if (article.inventory_mode === 'juste_a_cocher' && value === true) {
      setCompletedArticles(prev => new Set(prev).add(articleId));
    }

    // S'assurer que l'article a toutes les propriétés nécessaires, notamment unit_price
    const articleWithPrice = {
      ...article,
      unit_price: article.unit_price || 0
    };

    // Mettre à jour le panier automatiquement
    if (article.inventory_mode === 'stock_reel') {
      const safetyStock = article.safety_stock?.[currentDay] || 0;
      const currentStock = value;
      const toOrder = Math.max(0, safetyStock - currentStock);
      
      if (toOrder > 0) {
        setCart(prev => ({
          ...prev,
          [articleId]: {
            article: articleWithPrice,
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
            article: articleWithPrice,
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

  const handleReset = () => {
    if (confirm('Voulez-vous vraiment réinitialiser tout l\'inventaire ? Cette action est irréversible.')) {
      setStockValues({});
      setCart({});
      setCompletedArticles(new Set());
      setShowAll(false);
      localStorage.removeItem('inventoryStockValues');
      localStorage.removeItem('inventoryCart');
      localStorage.removeItem('inventoryCompletedArticles');
      localStorage.removeItem('inventoryShowAll');
    }
  };

  const handleFreeAdd = (formData) => {
    const freeArticle = {
      id: `free-${Date.now()}`,
      name: formData.name,
      unit: formData.unit,
      supplier_id: formData.supplier_id,
      supplier_name: suppliers.find(s => s.id === formData.supplier_id)?.name,
      unit_price: 0,
      isFree: true
    };
    
    setCart(prev => ({
      ...prev,
      [freeArticle.id]: {
        article: freeArticle,
        quantity: formData.quantity,
        initialQuantity: formData.quantity
      }
    }));
  };

  const handleExceptionalAdd = (article, quantity) => {
    // S'assurer que l'article a le unit_price
    const articleWithPrice = {
      ...article,
      unit_price: article.unit_price || 0
    };
    
    setCart(prev => ({
      ...prev,
      [article.id]: {
        article: articleWithPrice,
        quantity: quantity,
        initialQuantity: quantity
      }
    }));
  };

  const handleValidateOrder = async () => {
    if (Object.keys(cart).length === 0) {
      toast.error('Le panier est vide');
      return;
    }

    // Grouper les articles par fournisseur
    const ordersBySupplier = {};
    
    Object.values(cart).forEach(({ article, quantity }) => {
      const supplierId = article.supplier_id;
      const supplierName = article.supplier_name || 'Fournisseur inconnu';
      
      if (!ordersBySupplier[supplierId]) {
        ordersBySupplier[supplierId] = {
          supplier_id: supplierId,
          supplier_name: supplierName,
          items: []
        };
      }
      
      ordersBySupplier[supplierId].items.push({
        product_id: article.isFree ? null : article.id,
        product_name: article.name,
        quantity: quantity,
        unit: article.unit,
        unit_price: article.unit_price || 0,
        supplier_reference: article.supplier_reference || ''
      });
    });

    // Vérifier les conflits avec les commandes existantes en cours
    const today = new Date().toISOString().split('T')[0];
    const ordersInProgress = existingOrders.filter(order => order.status === 'en_cours');
    
    for (const order of Object.values(ordersBySupplier)) {
      const existingOrder = ordersInProgress.find(o => o.supplier_id === order.supplier_id);
      
      if (existingOrder) {
        // Conflit détecté
        setConflictInfo({
          supplierName: order.supplier_name,
          newOrder: order,
          existingOrder: existingOrder
        });
        return; // Arrêter et attendre la décision de l'utilisateur
      }
    }

    // Aucun conflit, créer les commandes
    await createOrders(ordersBySupplier, today);
  };

  const getNextDeliveryDay = (preferredDays) => {
    if (!preferredDays || preferredDays.length === 0) return '';
    
    // Mapping des jours courts vers les jours complets
    const dayMapping = {
      'L': 'Lundi',
      'MA': 'Mardi',
      'ME': 'Mercredi',
      'J': 'Jeudi',
      'V': 'Vendredi',
      'S': 'Samedi',
      'D': 'Dimanche'
    };
    
    // Si un seul jour, le retourner
    if (preferredDays.length === 1) {
      return dayMapping[preferredDays[0]] || '';
    }
    
    // Mapping des jours vers leurs indices (Lundi = 1, Dimanche = 0)
    const dayIndices = {
      'L': 1, 'MA': 2, 'ME': 3, 'J': 4, 'V': 5, 'S': 6, 'D': 0
    };
    
    // Obtenir l'index du jour actuel
    const today = new Date().getDay();
    
    // Convertir les jours préférés en indices
    const preferredIndices = preferredDays.map(day => dayIndices[day]).sort((a, b) => a - b);
    
    // Trouver le prochain jour >= aujourd'hui
    let nextDay = preferredIndices.find(index => index >= today);
    
    // Si aucun jour trouvé (tous les jours sont passés cette semaine), prendre le premier de la liste
    if (nextDay === undefined) {
      nextDay = preferredIndices[0];
    }
    
    // Trouver le jour court correspondant
    const nextDayShort = Object.keys(dayIndices).find(key => dayIndices[key] === nextDay);
    
    return dayMapping[nextDayShort] || '';
  };

  const createOrders = async (ordersBySupplier, today) => {
    try {
      for (const order of Object.values(ordersBySupplier)) {
        // Trouver le fournisseur et déterminer le jour de livraison souhaité
        const supplier = suppliers.find(s => s.id === order.supplier_id);
        const desiredDeliveryDay = supplier ? getNextDeliveryDay(supplier.preferred_delivery_days) : '';
        
        await createOrderMutation.mutateAsync({
          ...order,
          date: today,
          delivery_date: today,
          desired_delivery_day: desiredDeliveryDay,
          status: 'en_cours'
        });
      }
      
      // Vider le panier après validation
      setCart({});
      setStockValues({});
      setCompletedArticles(new Set());
      localStorage.removeItem('inventoryCart');
      localStorage.removeItem('inventoryStockValues');
      localStorage.removeItem('inventoryCompletedArticles');
      
      toast.success(`${Object.keys(ordersBySupplier).length} commande(s) créée(s)`);
    } catch (error) {
      toast.error('Erreur lors de la création des commandes');
    }
  };

  const handleConflictReplace = async () => {
    if (!conflictInfo) return;
    
    const today = new Date().toISOString().split('T')[0];
    
    try {
      // Supprimer l'ancienne commande
      await deleteOrderMutation.mutateAsync(conflictInfo.existingOrder.id);
      
      // Trouver le fournisseur et déterminer le jour de livraison souhaité
      const supplier = suppliers.find(s => s.id === conflictInfo.newOrder.supplier_id);
      const desiredDeliveryDay = supplier ? getNextDeliveryDay(supplier.preferred_delivery_days) : '';
      
      // Créer la nouvelle
      await createOrderMutation.mutateAsync({
        ...conflictInfo.newOrder,
        date: today,
        delivery_date: today,
        desired_delivery_day: desiredDeliveryDay,
        status: 'en_cours'
      });
      
      // Vider le panier
      setCart({});
      setStockValues({});
      setCompletedArticles(new Set());
      localStorage.removeItem('inventoryCart');
      localStorage.removeItem('inventoryStockValues');
      localStorage.removeItem('inventoryCompletedArticles');
      
      setConflictInfo(null);
      toast.success('Commande remplacée avec succès');
    } catch (error) {
      toast.error('Erreur lors du remplacement de la commande');
    }
  };

  const handleConflictMerge = async () => {
    if (!conflictInfo) return;
    
    try {
      // Fusionner les articles
      const existingItems = conflictInfo.existingOrder.items || [];
      const newItems = conflictInfo.newOrder.items;
      
      // Créer une map pour fusionner les quantités des articles identiques
      const itemsMap = new Map();
      
      existingItems.forEach(item => {
        const key = item.product_id || item.product_name;
        itemsMap.set(key, { ...item });
      });
      
      newItems.forEach(item => {
        const key = item.product_id || item.product_name;
        if (itemsMap.has(key)) {
          const existing = itemsMap.get(key);
          existing.quantity += item.quantity;
        } else {
          itemsMap.set(key, { ...item });
        }
      });
      
      const mergedItems = Array.from(itemsMap.values());
      
      // Mettre à jour la commande existante
      await updateOrderMutation.mutateAsync({
        id: conflictInfo.existingOrder.id,
        data: { items: mergedItems }
      });
      
      // Vider le panier
      setCart({});
      setStockValues({});
      setCompletedArticles(new Set());
      localStorage.removeItem('inventoryCart');
      localStorage.removeItem('inventoryStockValues');
      localStorage.removeItem('inventoryCompletedArticles');
      
      setConflictInfo(null);
      toast.success('Articles ajoutés au bon de commande existant');
    } catch (error) {
      toast.error('Erreur lors de la fusion des commandes');
    }
  };

  const handleConflictCancel = () => {
    setConflictInfo(null);
  };

    return (
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 break-words">Inventaire du jour</h2>
            <p className="text-xs sm:text-sm text-gray-600 break-words">
              Liste filtrée selon les jours de comptage paramétrés
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              className="border-red-600 text-red-600 hover:bg-red-50 min-h-[44px] w-full sm:w-auto"
              onClick={handleReset}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Réinitialiser</span>
              <span className="sm:hidden">Réinit.</span>
            </Button>
            <Button 
              variant="outline" 
              className="border-purple-600 text-purple-600 hover:bg-purple-50 min-h-[44px] w-full sm:w-auto"
              onClick={() => setShowFreeAddModal(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Ajout Libre</span>
              <span className="sm:hidden">Ajout</span>
            </Button>
            <Button 
              className="bg-orange-600 hover:bg-orange-700 min-h-[44px] w-full sm:w-auto"
              onClick={() => setShowExceptionalOrderModal(true)}
            >
              <ShoppingCart className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Commande Exceptionnelle</span>
              <span className="sm:hidden">Commande</span>
            </Button>
          </div>
        </div>

      {/* Sub Tabs */}
      <Tabs value={inventorySubTab} onValueChange={setInventorySubTab}>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <TabsList className="bg-transparent gap-2 w-full sm:w-auto grid grid-cols-2 sm:inline-flex">
            <TabsTrigger
              value="stock-status"
              className="relative px-3 sm:px-4 py-2 rounded-lg border-2 border-gray-300 data-[state=active]:border-orange-600 data-[state=active]:bg-transparent data-[state=active]:text-gray-900 text-xs sm:text-sm min-h-[44px]"
            >
              <span className="hidden sm:inline">État des stocks</span>
              <span className="sm:hidden">Stocks</span>
              {todayArticles.length > 0 && (
                <span className="ml-1 sm:ml-2 px-1.5 sm:px-2 py-0.5 bg-red-500 text-white text-[10px] sm:text-xs rounded-full">
                  {todayArticles.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="cart"
              className="px-3 sm:px-4 py-2 rounded-lg border-2 border-gray-300 data-[state=active]:border-orange-600 data-[state=active]:bg-transparent data-[state=active]:text-gray-900 text-xs sm:text-sm min-h-[44px]"
            >
              Panier
              {Object.keys(cart).length > 0 && (
                <span className="ml-1 sm:ml-2 px-1.5 sm:px-2 py-0.5 bg-orange-600 text-white text-[10px] sm:text-xs rounded-full">
                  {Object.keys(cart).length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <Button 
            className="w-full sm:w-auto sm:ml-auto bg-orange-600 hover:bg-orange-700 px-6 sm:px-8 min-h-[44px] text-sm sm:text-base"
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
                      className="px-3 sm:px-4 py-2 rounded-t-lg font-bold text-white flex items-center gap-2 text-sm sm:text-base"
                      style={{ backgroundColor: category?.color || '#6b7280' }}
                    >
                      <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-white flex-shrink-0"></span>
                      <span className="truncate">{categoryName.toUpperCase()}</span>
                    </div>

                    {/* Category Articles */}
                    <div className="bg-gray-900 rounded-b-lg divide-y divide-gray-700">
                      {categoryArticles.map((article) => (
                        <div 
                          key={article.id}
                          className="px-3 sm:px-4 py-3 sm:py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 hover:bg-gray-800 transition-colors"
                        >
                          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 w-full sm:w-auto">
                            {article.image_url && (
                              <img 
                                src={article.image_url} 
                                alt={article.name}
                                className="w-10 h-10 sm:w-12 sm:h-12 rounded object-cover flex-shrink-0"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <h4 className="font-semibold text-white text-sm sm:text-base truncate">{article.name}</h4>
                              {article.remarks && (
                                <p className="text-[11px] sm:text-xs text-gray-400 italic mt-0.5 truncate">
                                  {article.remarks}
                                </p>
                              )}
                              <div className="flex gap-2 text-[10px] sm:text-xs mt-1 flex-wrap">
                                {article.inventory_mode === 'stock_reel' ? (
                                  <span className="px-1.5 sm:px-2 py-0.5 bg-orange-600 text-white rounded whitespace-nowrap">
                                    # Stock Réel
                                  </span>
                                ) : (
                                  <span className="px-1.5 sm:px-2 py-0.5 bg-purple-600 text-white rounded whitespace-nowrap">
                                    ☑ Juste à cocher
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                            <div className="text-right flex-shrink-0">
                              <div className="text-[11px] sm:text-xs text-gray-400 uppercase mb-1">En réserve</div>
                              {article.inventory_mode === 'juste_a_cocher' ? (
                                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
                                  <div className="text-sm text-gray-300 whitespace-nowrap">
                                    {article.order_quantity?.[currentDay] || 0}
                                  </div>
                                  <Button
                                    variant={stockValues[article.id] ? "default" : "outline"}
                                    size="sm"
                                    className={cn(
                                      stockValues[article.id] 
                                        ? "bg-emerald-600 hover:bg-emerald-700 gap-2" 
                                        : "border-gray-600 text-gray-400 hover:bg-gray-700 hover:border-gray-500",
                                      "min-h-[44px] text-xs sm:text-sm whitespace-nowrap touch-manipulation"
                                    )}
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
                                    className="w-10 h-10 sm:w-8 sm:h-8 rounded bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg active:scale-95 transition-transform touch-manipulation"
                                  >
                                    -
                                  </button>
                                  <div className="w-14 h-10 sm:w-12 sm:h-8 flex items-center justify-center bg-gray-800 border border-gray-600 text-white font-semibold rounded text-sm sm:text-base">
                                    {stockValues[article.id] ?? article.safety_stock?.[currentDay] ?? 0}
                                  </div>
                                  <button
                                    onClick={() => {
                                      const currentValue = stockValues[article.id] ?? article.safety_stock?.[currentDay] ?? 0;
                                      handleStockChange(article.id, currentValue + 1, article);
                                    }}
                                    className="w-10 h-10 sm:w-8 sm:h-8 rounded bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg active:scale-95 transition-transform touch-manipulation"
                                  >
                                    +
                                  </button>
                                  <button
                                    onClick={() => {
                                      const resetValue = { ...stockValues };
                                      delete resetValue[article.id];
                                      setStockValues(resetValue);
                                    }}
                                    className="p-2 sm:p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors ml-1 touch-manipulation"
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
                                className="px-3 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
                              >
                                <Check className="w-4 h-4 sm:w-5 sm:h-5" />
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
            <>
              <div className="space-y-3 sm:space-y-4">
                {Object.values(cart).map(({ article, quantity, initialQuantity }) => {
                  const totalPrice = quantity * (article.unit_price || 0);
                  
                  return (
                    <div 
                      key={article.id}
                      className="bg-white rounded-lg border-2 border-gray-300 p-3 sm:p-4 flex flex-col gap-3"
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        {article.image_url && (
                          <img 
                            src={article.image_url} 
                            alt={article.name}
                            className="w-10 h-10 sm:w-12 sm:h-12 rounded object-cover flex-shrink-0"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <h4 className="font-semibold text-gray-900 text-sm sm:text-base truncate">{article.name}</h4>
                          <div className="flex gap-2 text-[11px] sm:text-xs mt-1 flex-wrap">
                            <span className="text-gray-600 truncate">{article.supplier_name}</span>
                            {article.category && (
                              <span className="text-gray-600 truncate">• {article.category}</span>
                            )}
                            {article.unit_price > 0 && (
                              <span className="text-gray-600 truncate">• {article.unit_price.toFixed(2)} €/{article.unit}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 w-full justify-between">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              if (quantity > 1) {
                                setCart(prev => ({
                                  ...prev,
                                  [article.id]: { article, quantity: quantity - 1, initialQuantity }
                                }));
                              } else {
                                // Retirer du panier
                                setCart(prev => {
                                  const newCart = { ...prev };
                                  delete newCart[article.id];
                                  return newCart;
                                });
                                // Réinitialiser l'état dans les stocks
                                setStockValues(prev => {
                                  const newValues = { ...prev };
                                  delete newValues[article.id];
                                  return newValues;
                                });
                                // Retirer des articles complétés
                                setCompletedArticles(prev => {
                                  const newCompleted = new Set(prev);
                                  newCompleted.delete(article.id);
                                  return newCompleted;
                                });
                              }
                            }}
                            className="w-10 h-10 sm:w-8 sm:h-8 rounded bg-gray-200 hover:bg-gray-300 text-gray-900 font-bold text-lg active:scale-95 transition-transform touch-manipulation"
                          >
                            -
                          </button>
                          <div className="w-16 h-10 sm:w-16 sm:h-8 flex items-center justify-center bg-white border-2 border-orange-600 text-gray-900 font-bold rounded text-sm sm:text-base">
                            {quantity}
                          </div>
                          <button
                            onClick={() => {
                              setCart(prev => ({
                                ...prev,
                                [article.id]: { article, quantity: quantity + 1, initialQuantity }
                              }));
                            }}
                            className="w-10 h-10 sm:w-8 sm:h-8 rounded bg-gray-200 hover:bg-gray-300 text-gray-900 font-bold text-lg active:scale-95 transition-transform touch-manipulation"
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
                            className="p-2 sm:p-1.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-900 transition-colors ml-1 touch-manipulation"
                            title="Réinitialiser"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-[11px] sm:text-xs text-gray-500 whitespace-nowrap">
                            {article.unit || 'unités'}
                          </div>
                          {article.unit_price > 0 && (
                            <div className="font-bold text-gray-900 text-sm sm:text-base whitespace-nowrap">
                              {totalPrice.toFixed(2)} €
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Total du panier */}
              <div className="mt-6 bg-orange-50 border-2 border-orange-600 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="text-base sm:text-lg font-semibold text-gray-900 uppercase">
                    Total Estimé HT
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-orange-600">
                    {Object.values(cart).reduce((sum, { article, quantity }) => {
                      return sum + (quantity * (article.unit_price || 0));
                    }, 0).toFixed(2)} €
                  </div>
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Bouton Valider Commande - visible sur tous les onglets */}
      <div className="flex justify-center pt-4 sm:pt-6">
        <Button 
          className="bg-emerald-600 hover:bg-emerald-700 px-6 sm:px-8 w-full sm:w-auto min-h-[52px] text-sm sm:text-base font-semibold touch-manipulation"
          onClick={handleValidateOrder}
          disabled={Object.keys(cart).length === 0}
        >
          <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
          Valider Commande
        </Button>
      </div>

      {/* Free Add Modal */}
      <FreeAddModal
        isOpen={showFreeAddModal}
        onClose={() => setShowFreeAddModal(false)}
        onAdd={handleFreeAdd}
        suppliers={suppliers}
      />

      {/* Exceptional Order Modal */}
      <ExceptionalOrderModal
        isOpen={showExceptionalOrderModal}
        onClose={() => setShowExceptionalOrderModal(false)}
        articles={articles}
        todayArticles={todayArticles}
        onAddToCart={handleExceptionalAdd}
      />

      {/* Order Conflict Modal */}
      {conflictInfo && (
        <OrderConflictModal
          isOpen={true}
          supplierName={conflictInfo.supplierName}
          onReplace={handleConflictReplace}
          onMerge={handleConflictMerge}
          onCancel={handleConflictCancel}
        />
      )}
    </div>
  );
}