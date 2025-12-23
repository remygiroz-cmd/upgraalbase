import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Package, Plus, Search, ShoppingCart, FileText, Truck, AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/ui/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const DAYS_MAP = {
  0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday',
  4: 'thursday', 5: 'friday', 6: 'saturday'
};

export default function Stocks() {
  const queryClient = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');
  const dayOfWeek = DAYS_MAP[new Date().getDay()];
  
  const [activeTab, setActiveTab] = useState('inventory');
  const [searchQuery, setSearchQuery] = useState('');
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }, 'name')
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.filter({ is_active: true }, 'name')
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () => base44.entities.Order.list('-date', 20)
  });

  const updateProductMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Product.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] })
  });

  const saveProductMutation = useMutation({
    mutationFn: (data) => {
      if (editingProduct?.id) {
        return base44.entities.Product.update(editingProduct.id, data);
      }
      return base44.entities.Product.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowProductForm(false);
      setEditingProduct(null);
    }
  });

  const saveSupplierMutation = useMutation({
    mutationFn: (data) => base44.entities.Supplier.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setShowSupplierForm(false);
    }
  });

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate needs (par_level - current_stock)
  const getProductNeed = (product) => {
    const parLevel = product.par_levels?.[dayOfWeek] || 0;
    const currentStock = product.current_stock || 0;
    return Math.max(0, parLevel - currentStock);
  };

  const productsWithNeeds = filteredProducts.map(p => ({
    ...p,
    need: getProductNeed(p),
    parLevel: p.par_levels?.[dayOfWeek] || 0
  }));

  const handleEditProduct = (product) => {
    setEditingProduct(product);
    setShowProductForm(true);
  };

  const handleStockChange = (product, delta) => {
    const newStock = Math.max(0, (product.current_stock || 0) + delta);
    updateProductMutation.mutate({
      id: product.id,
      data: { current_stock: newStock }
    });
  };

  const handleGenerateOrder = (supplier) => {
    setSelectedSupplier(supplier);
    setShowOrderModal(true);
  };

  if (loadingProducts) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <PageHeader
        icon={Package}
        title="Inventaires & Commandes"
        subtitle="Gestion des stocks et fournisseurs"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => setShowSupplierForm(true)}
              className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700"
            >
              <Truck className="w-4 h-4 mr-2" />
              Fournisseur
            </Button>
            <Button
              onClick={() => setShowProductForm(true)}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Produit
            </Button>
          </>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList className="bg-slate-800 p-1">
          <TabsTrigger value="inventory" className="data-[state=active]:bg-slate-700">
            <Package className="w-4 h-4 mr-2" />
            Inventaire
          </TabsTrigger>
          <TabsTrigger value="orders" className="data-[state=active]:bg-slate-700">
            <ShoppingCart className="w-4 h-4 mr-2" />
            Commandes
          </TabsTrigger>
          <TabsTrigger value="suppliers" className="data-[state=active]:bg-slate-700">
            <Truck className="w-4 h-4 mr-2" />
            Fournisseurs
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === 'inventory' && (
        <div>
          <div className="relative mb-6">
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
              icon={Package}
              title="Aucun produit"
              description="Ajoutez des produits pour gérer vos stocks"
              action={
                <Button
                  onClick={() => setShowProductForm(true)}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter un produit
                </Button>
              }
            />
          ) : (
            <div className="space-y-2">
              {productsWithNeeds.map(product => (
                <div
                  key={product.id}
                  className={cn(
                    "p-4 rounded-xl border-2 flex items-center gap-4 transition-all",
                    product.need > 0
                      ? "bg-amber-50 border-amber-400"
                      : "bg-white border-gray-300"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 truncate">{product.name}</h3>
                      {product.need > 0 && (
                        <Badge className="bg-amber-600/20 text-amber-400 border-amber-600/30">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          À commander
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-700">
                      Par-level: {product.parLevel} {product.unit} • Besoin: {product.need} {product.unit}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleStockChange(product, -1)}
                      className="w-10 h-10 rounded-lg bg-gray-300 hover:bg-gray-400 flex items-center justify-center text-lg font-bold text-gray-900"
                    >
                      -
                    </button>
                    <div className="w-16 text-center">
                      <p className="text-xl font-bold text-gray-900">{product.current_stock || 0}</p>
                      <p className="text-xs text-gray-700">{product.unit}</p>
                    </div>
                    <button
                      onClick={() => handleStockChange(product, 1)}
                      className="w-10 h-10 rounded-lg bg-gray-300 hover:bg-gray-400 flex items-center justify-center text-lg font-bold text-gray-900"
                    >
                      +
                    </button>
                  </div>

                  <button
                    onClick={() => handleEditProduct(product)}
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'orders' && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {suppliers.map(supplier => (
              <button
                key={supplier.id}
                onClick={() => handleGenerateOrder(supplier)}
                className={cn(
                  "p-4 rounded-xl border-2 text-left transition-all",
                  "bg-white border-gray-300",
                  "hover:bg-gray-50 hover:border-gray-400"
                )}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Truck className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-semibold text-gray-900">{supplier.name}</h3>
                </div>
                <p className="text-sm text-orange-600 font-medium">
                  Générer bon de commande →
                </p>
              </button>
            ))}
          </div>

          <h3 className="text-sm font-semibold text-gray-700 mb-3">Commandes récentes</h3>
          {orders.length === 0 ? (
            <p className="text-center text-gray-600 py-8">Aucune commande</p>
          ) : (
            <div className="space-y-2">
              {orders.map(order => (
                <div
                  key={order.id}
                  className="p-4 bg-white rounded-xl border-2 border-gray-300"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-semibold text-gray-900">{order.supplier_name}</p>
                      <p className="text-sm text-gray-600">
                        {format(new Date(order.date), "d MMMM yyyy", { locale: fr })}
                      </p>
                    </div>
                    <Badge className={cn(
                      order.status === 'sent' && "bg-amber-600/20 text-amber-400",
                      order.status === 'received' && "bg-orange-600/20 text-orange-400",
                      order.status === 'draft' && "bg-slate-600/20 text-slate-400"
                    )}>
                      {order.status === 'sent' ? 'Envoyé' : 
                       order.status === 'received' ? 'Reçu' : 'Brouillon'}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-700">
                    {order.items?.length || 0} article(s)
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'suppliers' && (
        <div>
          {suppliers.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="Aucun fournisseur"
              description="Ajoutez vos fournisseurs pour gérer les commandes"
              action={
                <Button
                  onClick={() => setShowSupplierForm(true)}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter un fournisseur
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {suppliers.map(supplier => (
                <div
                  key={supplier.id}
                  className="p-4 bg-white rounded-xl border-2 border-gray-300"
                >
                  <h3 className="font-semibold text-gray-900 mb-2">{supplier.name}</h3>
                  {supplier.contact_name && (
                    <p className="text-sm text-gray-700">Contact: {supplier.contact_name}</p>
                  )}
                  {supplier.email && (
                    <p className="text-sm text-gray-700">{supplier.email}</p>
                  )}
                  {supplier.phone && (
                    <p className="text-sm text-gray-700">{supplier.phone}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Product Form Modal */}
      <ProductFormModal
        open={showProductForm}
        onClose={() => {
          setShowProductForm(false);
          setEditingProduct(null);
        }}
        product={editingProduct}
        suppliers={suppliers}
        onSave={(data) => saveProductMutation.mutate(data)}
        isSaving={saveProductMutation.isPending}
      />

      {/* Supplier Form Modal */}
      <SupplierFormModal
        open={showSupplierForm}
        onClose={() => setShowSupplierForm(false)}
        onSave={(data) => saveSupplierMutation.mutate(data)}
        isSaving={saveSupplierMutation.isPending}
      />

      {/* Order Modal */}
      {showOrderModal && selectedSupplier && (
        <OrderModal
          supplier={selectedSupplier}
          products={productsWithNeeds.filter(p => p.supplier_id === selectedSupplier.id || !p.supplier_id)}
          onClose={() => {
            setShowOrderModal(false);
            setSelectedSupplier(null);
          }}
        />
      )}
    </div>
  );
}

function ProductFormModal({ open, onClose, product, suppliers, onSave, isSaving }) {
  const [form, setForm] = useState({
    name: '',
    category: '',
    unit: 'unité',
    unit_price: 0,
    supplier_id: '',
    par_levels: {
      monday: 0, tuesday: 0, wednesday: 0, thursday: 0,
      friday: 0, saturday: 0, sunday: 0
    },
    current_stock: 0
  });

  React.useEffect(() => {
    if (product) {
      setForm({
        name: product.name || '',
        category: product.category || '',
        unit: product.unit || 'unité',
        unit_price: product.unit_price || 0,
        supplier_id: product.supplier_id || '',
        par_levels: product.par_levels || {
          monday: 0, tuesday: 0, wednesday: 0, thursday: 0,
          friday: 0, saturday: 0, sunday: 0
        },
        current_stock: product.current_stock || 0
      });
    } else {
      setForm({
        name: '',
        category: '',
        unit: 'unité',
        unit_price: 0,
        supplier_id: '',
        par_levels: {
          monday: 0, tuesday: 0, wednesday: 0, thursday: 0,
          friday: 0, saturday: 0, sunday: 0
        },
        current_stock: 0
      });
    }
  }, [product, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  const DAYS = [
    { key: 'monday', label: 'Lun' },
    { key: 'tuesday', label: 'Mar' },
    { key: 'wednesday', label: 'Mer' },
    { key: 'thursday', label: 'Jeu' },
    { key: 'friday', label: 'Ven' },
    { key: 'saturday', label: 'Sam' },
    { key: 'sunday', label: 'Dim' },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? 'Modifier' : 'Nouveau'} produit</DialogTitle>
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
            <Label>Fournisseur</Label>
            <Select
              value={form.supplier_id}
              onValueChange={(value) => setForm(prev => ({ ...prev, supplier_id: value }))}
            >
              <SelectTrigger className="bg-slate-700 border-slate-600 mt-1">
                <SelectValue placeholder="Sélectionner..." />
              </SelectTrigger>
              <SelectContent className="bg-slate-700 border-slate-600">
                {suppliers.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Par-levels par jour</Label>
            <div className="grid grid-cols-7 gap-2 mt-2">
              {DAYS.map(day => (
                <div key={day.key} className="text-center">
                  <p className="text-xs text-slate-400 mb-1">{day.label}</p>
                  <Input
                    type="number"
                    min="0"
                    value={form.par_levels[day.key]}
                    onChange={(e) => setForm(prev => ({
                      ...prev,
                      par_levels: {
                        ...prev.par_levels,
                        [day.key]: parseInt(e.target.value) || 0
                      }
                    }))}
                    className="bg-slate-700 border-slate-600 text-center px-1"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700">
              Annuler
            </Button>
            <Button type="submit" disabled={isSaving} className="bg-orange-600 hover:bg-orange-700">
              {product ? 'Modifier' : 'Créer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SupplierFormModal({ open, onClose, onSave, isSaving }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    contact_name: '',
    address: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700">
        <DialogHeader>
          <DialogTitle>Nouveau fournisseur</DialogTitle>
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

          <div>
            <Label htmlFor="contact_name">Contact</Label>
            <Input
              id="contact_name"
              value={form.contact_name}
              onChange={(e) => setForm(prev => ({ ...prev, contact_name: e.target.value }))}
              className="bg-slate-700 border-slate-600 mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                className="bg-slate-700 border-slate-600 mt-1"
              />
            </div>
            <div>
              <Label htmlFor="phone">Téléphone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
                className="bg-slate-700 border-slate-600 mt-1"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700">
              Annuler
            </Button>
            <Button type="submit" disabled={isSaving} className="bg-orange-600 hover:bg-orange-700">
              Créer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OrderModal({ supplier, products, onClose }) {
  const queryClient = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');
  
  const productsWithNeeds = products.filter(p => p.need > 0);
  
  const [orderItems, setOrderItems] = useState(
    productsWithNeeds.map(p => ({
      product_id: p.id,
      product_name: p.name,
      quantity: p.need,
      unit: p.unit
    }))
  );

  const createOrderMutation = useMutation({
    mutationFn: (data) => base44.entities.Order.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onClose();
    }
  });

  const handleSave = () => {
    createOrderMutation.mutate({
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      date: today,
      items: orderItems.filter(item => item.quantity > 0),
      status: 'draft'
    });
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 max-w-lg">
        <DialogHeader>
          <DialogTitle>Bon de commande - {supplier.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {orderItems.length === 0 ? (
            <p className="text-center text-slate-500 py-4">Aucun besoin détecté</p>
          ) : (
            orderItems.map((item, index) => (
              <div key={item.product_id} className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg">
                <span className="flex-1 text-sm">{item.product_name}</span>
                <Input
                  type="number"
                  min="0"
                  value={item.quantity}
                  onChange={(e) => {
                    const newItems = [...orderItems];
                    newItems[index].quantity = parseInt(e.target.value) || 0;
                    setOrderItems(newItems);
                  }}
                  className="w-20 bg-slate-600 border-slate-500 text-center"
                />
                <span className="text-sm text-slate-400 w-16">{item.unit}</span>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={onClose} className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700">
            Annuler
          </Button>
          <Button 
            onClick={handleSave}
            disabled={createOrderMutation.isPending || orderItems.filter(i => i.quantity > 0).length === 0}
            className="bg-orange-600 hover:bg-orange-700"
          >
            Enregistrer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}