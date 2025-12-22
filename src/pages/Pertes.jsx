import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { PackageMinus, Plus, Search, ShoppingCart, Trash2, Download, History, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import PageHeader from '@/components/ui/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function Pertes() {
  const queryClient = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [activeTab, setActiveTab] = useState('pos');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [showProductForm, setShowProductForm] = useState(false);

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }, 'name')
  });

  const { data: losses = [], isLoading: loadingLosses } = useQuery({
    queryKey: ['losses'],
    queryFn: () => base44.entities.Loss.list('-date', 50)
  });

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const saveLossMutation = useMutation({
    mutationFn: (data) => base44.entities.Loss.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['losses'] });
      setCart([]);
    }
  });

  const saveProductMutation = useMutation({
    mutationFn: (data) => base44.entities.Product.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowProductForm(false);
    }
  });

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const addToCart = (product) => {
    const existing = cart.find(item => item.product_id === product.id);
    if (existing) {
      setCart(cart.map(item => 
        item.product_id === product.id 
          ? { ...item, quantity: item.quantity + 1, total_price: (item.quantity + 1) * item.unit_price }
          : item
      ));
    } else {
      setCart([...cart, {
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        unit_price: product.unit_price || 0,
        total_price: product.unit_price || 0
      }]);
    }
  };

  const updateCartItem = (productId, quantity) => {
    if (quantity <= 0) {
      setCart(cart.filter(item => item.product_id !== productId));
    } else {
      setCart(cart.map(item => 
        item.product_id === productId 
          ? { ...item, quantity, total_price: quantity * item.unit_price }
          : item
      ));
    }
  };

  const getTotalAmount = () => cart.reduce((acc, item) => acc + item.total_price, 0);

  const handleValidate = () => {
    if (cart.length === 0) return;
    saveLossMutation.mutate({
      date: today,
      items: cart,
      total_amount: getTotalAmount(),
      recorded_by: currentUser?.email,
      recorded_by_name: currentUser?.full_name || currentUser?.email
    });
  };

  const handleExport = () => {
    const rows = [['Date', 'Produit', 'Quantité', 'Prix unitaire', 'Total', 'Enregistré par']];
    
    losses.forEach(loss => {
      loss.items?.forEach(item => {
        rows.push([
          format(parseISO(loss.date), 'dd/MM/yyyy'),
          item.product_name,
          item.quantity,
          item.unit_price?.toFixed(2) + ' €',
          item.total_price?.toFixed(2) + ' €',
          loss.recorded_by_name || ''
        ]);
      });
    });

    const csv = rows.map(r => r.join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `pertes_export.csv`;
    link.click();
  };

  if (loadingProducts || loadingLosses) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <PageHeader
        icon={PackageMinus}
        title="Invendus & Pertes"
        subtitle="Contrôle du Food Cost"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => setShowProductForm(true)}
              className="border-slate-600"
            >
              <Plus className="w-4 h-4 mr-2" />
              Produit
            </Button>
            <Button
              variant="outline"
              onClick={handleExport}
              className="border-slate-600"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList className="bg-slate-800 p-1">
          <TabsTrigger value="pos" className="data-[state=active]:bg-slate-700">
            <ShoppingCart className="w-4 h-4 mr-2" />
            Saisie POS
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-slate-700">
            <History className="w-4 h-4 mr-2" />
            Historique
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === 'pos' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Product catalog */}
          <div className="lg:col-span-2">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher un produit..."
                className="pl-10 bg-slate-800 border-slate-700"
              />
            </div>

            {products.length === 0 ? (
              <EmptyState
                icon={PackageMinus}
                title="Aucun produit"
                description="Ajoutez des produits pour commencer la saisie"
                action={
                  <Button
                    onClick={() => setShowProductForm(true)}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter un produit
                  </Button>
                }
              />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {filteredProducts.map(product => (
                  <motion.button
                    key={product.id}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => addToCart(product)}
                    className={cn(
                      "p-4 rounded-xl border text-left transition-all min-h-[80px]",
                      "bg-slate-800/50 border-slate-700/50",
                      "hover:bg-slate-700 hover:border-slate-600",
                      "active:bg-slate-600"
                    )}
                  >
                    <p className="font-medium text-sm line-clamp-2">{product.name}</p>
                    {product.unit_price > 0 && (
                      <p className="text-xs text-emerald-400 mt-1">
                        {product.unit_price.toFixed(2)} € / {product.unit}
                      </p>
                    )}
                  </motion.button>
                ))}
              </div>
            )}
          </div>

          {/* Cart */}
          <div className="lg:col-span-1">
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-4 sticky top-4">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                Ticket de pertes
              </h3>

              {cart.length === 0 ? (
                <p className="text-center text-slate-500 py-8">
                  Sélectionnez des produits
                </p>
              ) : (
                <div className="space-y-3 mb-4 max-h-[400px] overflow-y-auto">
                  <AnimatePresence>
                    {cart.map(item => (
                      <motion.div
                        key={item.product_id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{item.product_name}</p>
                          <p className="text-xs text-slate-400">
                            {item.unit_price.toFixed(2)} € × {item.quantity}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateCartItem(item.product_id, item.quantity - 1)}
                            className="w-8 h-8 rounded bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
                          >
                            -
                          </button>
                          <span className="w-8 text-center">{item.quantity}</span>
                          <button
                            onClick={() => updateCartItem(item.product_id, item.quantity + 1)}
                            className="w-8 h-8 rounded bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                        <p className="w-16 text-right font-medium text-red-400">
                          {item.total_price.toFixed(2)} €
                        </p>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {cart.length > 0 && (
                <>
                  <div className="border-t border-slate-600 pt-4 mb-4">
                    <div className="flex justify-between text-lg font-bold">
                      <span>Total pertes</span>
                      <span className="text-red-400">{getTotalAmount().toFixed(2)} €</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setCart([])}
                      className="border-slate-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={handleValidate}
                      disabled={saveLossMutation.isPending}
                      className="flex-1 bg-red-600 hover:bg-red-700"
                    >
                      Valider les pertes
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {losses.length === 0 ? (
            <EmptyState
              icon={History}
              title="Aucun historique"
              description="Les pertes enregistrées apparaîtront ici"
            />
          ) : (
            losses.map(loss => (
              <div
                key={loss.id}
                className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-medium">
                      {format(parseISO(loss.date), "EEEE d MMMM yyyy", { locale: fr })}
                    </p>
                    <p className="text-sm text-slate-400">
                      Par {loss.recorded_by_name}
                    </p>
                  </div>
                  <Badge className="bg-red-600/20 text-red-400 border-red-600/30 text-lg">
                    -{loss.total_amount?.toFixed(2)} €
                  </Badge>
                </div>

                <div className="space-y-1">
                  {loss.items?.map((item, index) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span className="text-slate-400">
                        {item.quantity}× {item.product_name}
                      </span>
                      <span>{item.total_price?.toFixed(2)} €</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Product Form Modal */}
      <ProductFormModal
        open={showProductForm}
        onClose={() => setShowProductForm(false)}
        onSave={(data) => saveProductMutation.mutate(data)}
        isSaving={saveProductMutation.isPending}
      />
    </div>
  );
}

function ProductFormModal({ open, onClose, onSave, isSaving }) {
  const [form, setForm] = useState({
    name: '',
    category: '',
    unit: 'unité',
    unit_price: 0
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700">
        <DialogHeader>
          <DialogTitle>Nouveau produit</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Nom *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              className="bg-slate-700 border-slate-600 mt-1"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="unit">Unité</Label>
              <Input
                id="unit"
                value={form.unit}
                onChange={(e) => setForm(prev => ({ ...prev, unit: e.target.value }))}
                className="bg-slate-700 border-slate-600 mt-1"
              />
            </div>
            <div>
              <Label htmlFor="unit_price">Prix unitaire (€)</Label>
              <Input
                id="unit_price"
                type="number"
                step="0.01"
                value={form.unit_price}
                onChange={(e) => setForm(prev => ({ ...prev, unit_price: parseFloat(e.target.value) || 0 }))}
                className="bg-slate-700 border-slate-600 mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="category">Catégorie</Label>
            <Input
              id="category"
              value={form.category}
              onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value }))}
              className="bg-slate-700 border-slate-600 mt-1"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="border-slate-600">
              Annuler
            </Button>
            <Button type="submit" disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-700">
              Créer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}