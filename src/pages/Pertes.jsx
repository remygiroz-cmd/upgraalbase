import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { PackageMinus, Plus, Search, ShoppingCart, Trash2, Download, History, X, Upload, Sparkles, Loader2, Share2, Mail, MessageSquare, Send } from 'lucide-react';
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
import html2canvas from 'html2canvas';

export default function Pertes() {
  const queryClient = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [activeTab, setActiveTab] = useState('pos');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [customDate, setCustomDate] = useState('');
  const [startDate, setStartDate] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(today);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareMode, setShareMode] = useState('');
  const [shareDestination, setShareDestination] = useState('');
  const [isSharingLoading, setIsSharingLoading] = useState(false);
  const recapRef = useRef(null);

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }, 'name')
  });

  const { data: losses = [], isLoading: loadingLosses } = useQuery({
    queryKey: ['losses'],
    queryFn: () => base44.entities.Loss.list('-date')
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
      setCustomDate('');
    }
  });

  const saveProductMutation = useMutation({
    mutationFn: ({ id, data }) => {
      if (id) {
        return base44.entities.Product.update(id, data);
      }
      return base44.entities.Product.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowProductForm(false);
      setEditingProduct(null);
    }
  });

  const deleteProductMutation = useMutation({
    mutationFn: (id) => base44.entities.Product.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    }
  });

  const deleteLossMutation = useMutation({
    mutationFn: (id) => base44.entities.Loss.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['losses'] });
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
      date: customDate || today,
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

  const handleShare = async () => {
    if (!shareDestination) return;
    setIsSharingLoading(true);

    try {
      if (shareMode === 'email') {
        // Get filtered losses for the period
        const filteredLosses = losses.filter(loss => 
          loss.date >= startDate && loss.date <= endDate
        );

        // Calculate product summary
        const productSummary = {};
        filteredLosses.forEach(loss => {
          loss.items?.forEach(item => {
            if (!productSummary[item.product_name]) {
              productSummary[item.product_name] = {
                quantity: 0,
                total: 0
              };
            }
            productSummary[item.product_name].quantity += item.quantity;
            productSummary[item.product_name].total += item.total_price;
          });
        });

        const grandTotal = Object.values(productSummary).reduce((sum, p) => sum + p.total, 0);
        const sortedProducts = Object.entries(productSummary).sort((a, b) => b[1].total - a[1].total);

        // Generate CSV
        const csvRows = [['Date', 'Produit', 'Quantité', 'Prix unitaire', 'Total', 'Enregistré par']];
        filteredLosses.forEach(loss => {
          loss.items?.forEach(item => {
            csvRows.push([
              format(parseISO(loss.date), 'dd/MM/yyyy'),
              item.product_name,
              item.quantity,
              item.unit_price?.toFixed(2),
              item.total_price?.toFixed(2),
              loss.recorded_by_name || ''
            ]);
          });
        });
        const csvContent = csvRows.map(r => r.map(cell => `"${cell}"`).join(',')).join('\n');
        const csvBase64 = btoa(csvContent);

        // Generate HTML body
        const htmlBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <h2 style="color: #dc2626; margin-bottom: 10px;">Récapitulatif des Pertes</h2>
            <p style="margin: 5px 0; color: #666;">
              Période: Du <strong>${format(parseISO(startDate), "d MMMM yyyy", { locale: fr })}</strong> au <strong>${format(parseISO(endDate), "d MMMM yyyy", { locale: fr })}</strong>
            </p>
            
            <div style="background-color: #fee2e2; border: 2px solid #dc2626; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
              <p style="margin: 0; color: #666; font-size: 14px;">Total des pertes</p>
              <p style="margin: 10px 0 0 0; font-size: 32px; font-weight: bold; color: #dc2626;">${grandTotal.toFixed(2)} €</p>
            </div>

            <h3 style="color: #374151; margin-top: 20px; margin-bottom: 10px;">Détail par produit</h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <thead>
                <tr style="background-color: #f3f4f6; border-bottom: 2px solid #e5e7eb;">
                  <th style="padding: 10px; text-align: left; color: #374151;">Produit</th>
                  <th style="padding: 10px; text-align: center; color: #374151;">Quantité</th>
                  <th style="padding: 10px; text-align: right; color: #374151;">Montant</th>
                  <th style="padding: 10px; text-align: right; color: #374151;">%</th>
                </tr>
              </thead>
              <tbody>
                ${sortedProducts.map(([productName, data]) => `
                  <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 10px; color: #374151;">${productName}</td>
                    <td style="padding: 10px; text-align: center; color: #666;">${data.quantity}</td>
                    <td style="padding: 10px; text-align: right; color: #dc2626; font-weight: bold;">${data.total.toFixed(2)} €</td>
                    <td style="padding: 10px; text-align: right; color: #666;">${((data.total / grandTotal) * 100).toFixed(1)}%</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <p style="font-size: 12px; color: #999; text-align: center; margin-top: 30px;">
              Le fichier CSV détaillé est joint à cet email.
            </p>
          </div>
        `;

        // Send email via Resend with attachment
        await base44.functions.invoke('sendEmailWithResend', {
          to: shareDestination,
          subject: `Récapitulatif Pertes - ${format(parseISO(startDate), "d MMM yyyy", { locale: fr })} au ${format(parseISO(endDate), "d MMM yyyy", { locale: fr })}`,
          html: htmlBody,
          attachments: [
            {
              filename: `pertes_${format(parseISO(startDate), 'yyyy-MM-dd')}_${format(parseISO(endDate), 'yyyy-MM-dd')}.csv`,
              content: csvBase64
            }
          ]
        });
        alert('Email envoyé avec succès!');
      } else if (shareMode === 'whatsapp') {
        // For WhatsApp, we'll open the WhatsApp web/app with a text message
        const text = encodeURIComponent(`Récapitulatif des Pertes du ${format(parseISO(startDate), "d/MM/yyyy")} au ${format(parseISO(endDate), "d/MM/yyyy")}`);
        window.open(`https://wa.me/${shareDestination.replace(/\D/g, '')}?text=${text}`, '_blank');
        alert('Veuillez partager manuellement via WhatsApp. La fenêtre WhatsApp va s\'ouvrir.');
      } else if (shareMode === 'sms') {
        // For SMS, open the native SMS app
        const text = encodeURIComponent(`Récapitulatif des Pertes du ${format(parseISO(startDate), "d/MM/yyyy")} au ${format(parseISO(endDate), "d/MM/yyyy")}`);
        window.open(`sms:${shareDestination}?body=${text}`, '_blank');
        alert('Veuillez partager manuellement via SMS. L\'application SMS va s\'ouvrir.');
      }

      setShowShareModal(false);
      setShareDestination('');
      setShareMode('');
    } catch (error) {
      console.error('Erreur lors du partage:', error);
      
      // Better error messages
      let errorMessage = 'Erreur lors du partage: Veuillez réessayer.';
      
      if (error?.response?.data?.error) {
        errorMessage = `Erreur: ${error.response.data.error}`;
      } else if (error?.data?.error) {
        errorMessage = `Erreur: ${error.data.error}`;
      } else if (error?.message) {
        errorMessage = `Erreur: ${error.message}`;
      }
      
      alert(errorMessage);
    } finally {
      setIsSharingLoading(false);
    }
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
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setShowProductForm(true)}
              className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700 min-h-[44px]"
            >
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Produit</span>
            </Button>
            <Button
              variant="outline"
              onClick={handleExport}
              className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700 min-h-[44px]"
            >
              <Download className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList className="bg-slate-800 p-1 grid grid-cols-4">
          <TabsTrigger value="pos" className="data-[state=active]:bg-slate-700">
            <ShoppingCart className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Saisie POS</span>
            <span className="sm:hidden">POS</span>
          </TabsTrigger>
          <TabsTrigger value="recap" className="data-[state=active]:bg-slate-700">
            <Download className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Récapitulatif</span>
            <span className="sm:hidden">Récap</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-slate-700">
            <History className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Historique</span>
            <span className="sm:hidden">Histo</span>
          </TabsTrigger>
          <TabsTrigger value="products" className="data-[state=active]:bg-slate-700">
            <PackageMinus className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Produits</span>
            <span className="sm:hidden">Prods</span>
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
                className="pl-10 bg-slate-800 border-slate-700 min-h-[44px]"
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
                    className="bg-orange-600 hover:bg-orange-700"
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
                      "rounded-xl border-2 text-left transition-all overflow-hidden",
                      "bg-white border-gray-300",
                      "hover:bg-gray-50 hover:border-gray-400",
                      "active:bg-gray-100"
                    )}
                  >
                    {product.image_url && (
                      <div className="w-full h-24 sm:h-28 overflow-hidden bg-gray-100">
                        <img 
                          src={product.image_url} 
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="p-3 sm:p-4">
                      <p className="font-semibold text-gray-900 text-xs sm:text-sm line-clamp-2">{product.name}</p>
                      {product.unit_price > 0 && (
                        <p className="text-[10px] sm:text-xs text-orange-400 mt-1">
                          {product.unit_price.toFixed(2)} € / {product.unit}
                        </p>
                      )}
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </div>

          {/* Cart */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl border-2 border-gray-300 p-3 sm:p-4 lg:sticky lg:top-4 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                Ticket de pertes
              </h3>

              {cart.length === 0 ? (
                <p className="text-center text-gray-600 py-8">
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
                        className="flex items-center gap-3 p-3 bg-gray-100 rounded-lg border border-gray-300"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{item.product_name}</p>
                          <p className="text-xs text-gray-600">
                            {item.unit_price.toFixed(2)} € × {item.quantity}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateCartItem(item.product_id, item.quantity - 1)}
                            className="w-8 h-8 rounded bg-gray-300 hover:bg-gray-400 flex items-center justify-center font-bold text-gray-900"
                          >
                            -
                          </button>
                          <span className="w-8 text-center font-semibold text-gray-900">{item.quantity}</span>
                          <button
                            onClick={() => updateCartItem(item.product_id, item.quantity + 1)}
                            className="w-8 h-8 rounded bg-gray-300 hover:bg-gray-400 flex items-center justify-center font-bold text-gray-900"
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
                  <div className="border-t-2 border-gray-300 pt-4 mb-4">
                    <div className="flex justify-between text-lg font-bold text-gray-900">
                      <span>Total pertes</span>
                      <span className="text-red-400">{getTotalAmount().toFixed(2)} €</span>
                    </div>
                  </div>

                  <div className="mb-4">
                    <Label htmlFor="custom-date" className="text-gray-700 text-sm mb-2 block">
                      Date d'enregistrement
                    </Label>
                    <Input
                      id="custom-date"
                      type="date"
                      value={customDate || today}
                      onChange={(e) => setCustomDate(e.target.value)}
                      className="bg-white border-gray-300 text-gray-900"
                    />
                    {customDate && customDate !== today && (
                      <p className="text-xs text-orange-600 mt-1">
                        Sera enregistré à la date : {format(parseISO(customDate), "d MMMM yyyy", { locale: fr })}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setCart([]);
                        setCustomDate('');
                      }}
                      className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700 min-h-[44px]"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={handleValidate}
                      disabled={saveLossMutation.isPending}
                      className="flex-1 bg-red-600 hover:bg-red-700 min-h-[44px]"
                    >
                      Valider les pertes
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === 'recap' ? (
        <div className="space-y-6">
          {/* Date filters */}
          <div className="bg-white rounded-xl border-2 border-gray-300 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Période</h3>
              <Button
                variant="outline"
                onClick={() => setShowShareModal(true)}
                className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700"
              >
                <Share2 className="w-4 h-4 mr-2" />
                Partager
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="start-date" className="text-gray-700">Du</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-white border-gray-300 text-gray-900 mt-1"
                />
              </div>
              <div>
                <Label htmlFor="end-date" className="text-gray-700">Au</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-white border-gray-300 text-gray-900 mt-1"
                />
              </div>
            </div>
          </div>

          {/* Summary */}
          <div ref={recapRef}>
          {(() => {
            const filteredLosses = losses.filter(loss => 
              loss.date >= startDate && loss.date <= endDate
            );

            if (filteredLosses.length === 0) {
              return (
                <EmptyState
                  icon={PackageMinus}
                  title="Aucune perte sur cette période"
                  description="Essayez une autre période"
                />
              );
            }

            const productSummary = {};
            filteredLosses.forEach(loss => {
              loss.items?.forEach(item => {
                if (!productSummary[item.product_name]) {
                  productSummary[item.product_name] = {
                    quantity: 0,
                    total: 0
                  };
                }
                productSummary[item.product_name].quantity += item.quantity;
                productSummary[item.product_name].total += item.total_price;
              });
            });

            const grandTotal = Object.values(productSummary).reduce((sum, p) => sum + p.total, 0);
            const sortedProducts = Object.entries(productSummary).sort((a, b) => b[1].total - a[1].total);

            return (
              <div className="space-y-4">
                {/* Total card */}
                <div className="bg-gradient-to-r from-red-600 to-red-700 rounded-xl p-6 text-white">
                  <p className="text-sm opacity-90 mb-1">Total des pertes</p>
                  <p className="text-4xl font-bold">{grandTotal.toFixed(2)} €</p>
                  <p className="text-sm opacity-75 mt-2">
                    Du {format(parseISO(startDate), "d MMM yyyy", { locale: fr })} au {format(parseISO(endDate), "d MMM yyyy", { locale: fr })}
                  </p>
                </div>

                {/* Products breakdown */}
                <div className="bg-white rounded-xl border-2 border-gray-300 overflow-hidden">
                  <div className="p-4 border-b-2 border-gray-300">
                    <h3 className="font-semibold text-gray-900">Détail par produit</h3>
                  </div>
                  <div className="divide-y divide-gray-200">
                    {sortedProducts.map(([productName, data]) => (
                      <div key={productName} className="p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">{productName}</p>
                            <p className="text-sm text-gray-600">
                              {data.quantity} {data.quantity > 1 ? 'unités' : 'unité'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-red-600 text-lg">
                              {data.total.toFixed(2)} €
                            </p>
                            <p className="text-xs text-gray-500">
                              {((data.total / grandTotal) * 100).toFixed(1)}% du total
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
          </div>
        </div>
      ) : activeTab === 'products' ? (
        <div className="space-y-4">
          {products.length === 0 ? (
            <EmptyState
              icon={PackageMinus}
              title="Aucun produit"
              description="Ajoutez des produits pour commencer"
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map(product => (
                <div
                  key={product.id}
                  className="bg-white rounded-xl border-2 border-gray-300 overflow-hidden hover:border-gray-400 transition-all"
                >
                  {product.image_url && (
                    <div className="w-full h-40 overflow-hidden bg-gray-100">
                      <img 
                        src={product.image_url} 
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 mb-2">{product.name}</h3>
                    {product.category && (
                      <Badge className="mb-2 bg-blue-100 text-blue-900 border-blue-200">
                        {product.category}
                      </Badge>
                    )}
                    <div className="space-y-1 text-sm text-gray-700">
                      <p>Unité: {product.unit}</p>
                      <p className="text-orange-600 font-semibold">
                        Prix: {product.unit_price?.toFixed(2)} €
                      </p>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingProduct(product);
                          setShowProductForm(true);
                        }}
                        className="flex-1 border-gray-300 text-gray-900 hover:bg-gray-50"
                      >
                        Modifier
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm('Supprimer ce produit ?')) {
                            deleteProductMutation.mutate(product.id);
                          }
                        }}
                        className="border-red-300 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
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
                className="p-4 bg-white rounded-xl border-2 border-gray-300 relative"
              >
                <button
                  onClick={() => {
                    if (confirm('Supprimer cet enregistrement de pertes ?')) {
                      deleteLossMutation.mutate(loss.id);
                    }
                  }}
                  className="absolute top-3 right-3 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <div className="flex items-center justify-between mb-3 pr-10">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {format(parseISO(loss.date), "EEEE d MMMM yyyy", { locale: fr })}
                    </p>
                    <p className="text-sm text-gray-600">
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
                      <span className="text-gray-700">
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
        onClose={() => {
          setShowProductForm(false);
          setEditingProduct(null);
        }}
        onSave={(data) => saveProductMutation.mutate({ id: editingProduct?.id, data })}
        isSaving={saveProductMutation.isPending}
        product={editingProduct}
      />

      {/* Share Modal */}
      <Dialog open={showShareModal} onOpenChange={setShowShareModal}>
        <DialogContent className="bg-white border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Partager le récapitulatif</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {!shareMode ? (
              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={() => setShareMode('email')}
                  className="p-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl flex items-center gap-3 transition-colors"
                >
                  <Mail className="w-6 h-6 text-orange-600" />
                  <div className="text-left">
                    <p className="font-medium text-gray-900">Email</p>
                    <p className="text-xs text-gray-600">Envoyer par email</p>
                  </div>
                </button>
                <button
                  onClick={() => setShareMode('whatsapp')}
                  className="p-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl flex items-center gap-3 transition-colors"
                >
                  <MessageSquare className="w-6 h-6 text-green-600" />
                  <div className="text-left">
                    <p className="font-medium text-gray-900">WhatsApp</p>
                    <p className="text-xs text-gray-600">Partager via WhatsApp</p>
                  </div>
                </button>
                <button
                  onClick={() => setShareMode('sms')}
                  className="p-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl flex items-center gap-3 transition-colors"
                >
                  <Send className="w-6 h-6 text-blue-600" />
                  <div className="text-left">
                    <p className="font-medium text-gray-900">SMS</p>
                    <p className="text-xs text-gray-600">Envoyer par SMS</p>
                  </div>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="destination">
                    {shareMode === 'email' ? 'Adresse email' : 'Numéro de téléphone'}
                  </Label>
                  <Input
                    id="destination"
                    type={shareMode === 'email' ? 'email' : 'tel'}
                    value={shareDestination}
                    onChange={(e) => setShareDestination(e.target.value)}
                    placeholder={shareMode === 'email' ? 'exemple@email.com' : '+33612345678'}
                    className="bg-white border-gray-300 text-gray-900 mt-1"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShareMode('');
                      setShareDestination('');
                    }}
                    className="border-gray-300 text-gray-900 hover:bg-gray-50"
                  >
                    Retour
                  </Button>
                  <Button
                    onClick={handleShare}
                    disabled={!shareDestination || isSharingLoading}
                    className="flex-1 bg-orange-600 hover:bg-orange-700"
                  >
                    {isSharingLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Envoi...
                      </>
                    ) : (
                      <>
                        <Share2 className="w-4 h-4 mr-2" />
                        Partager
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProductFormModal({ open, onClose, onSave, isSaving, product }) {
  const [form, setForm] = useState({
    name: '',
    category: '',
    unit: 'unité',
    unit_price: 0,
    image_url: ''
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);

  React.useEffect(() => {
    if (product) {
      setForm({
        name: product.name || '',
        category: product.category || '',
        unit: product.unit || 'unité',
        unit_price: product.unit_price || 0,
        image_url: product.image_url || ''
      });
    } else {
      setForm({
        name: '',
        category: '',
        unit: 'unité',
        unit_price: 0,
        image_url: ''
      });
    }
  }, [product, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(prev => ({ ...prev, image_url: file_url }));
    } catch (error) {
      console.error('Error uploading image:', error);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!form.name) return;
    
    setGeneratingImage(true);
    try {
      const result = await base44.integrations.Core.GenerateImage({
        prompt: `Extreme close-up professional photograph of "${form.name}", macro shot, highly detailed, sharp focus on product, clean white or minimal background, commercial food photography, studio lighting, photorealistic, 8k quality, product clearly visible and centered`
      });
      if (result?.url) {
        setForm(prev => ({ ...prev, image_url: result.url }));
      }
    } catch (error) {
      console.error('Error generating image:', error);
    } finally {
      setGeneratingImage(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white border-gray-200 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gray-900">{product ? 'Modifier le produit' : 'Nouveau produit'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Nom *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              className="bg-white border-gray-300 text-gray-900 mt-1"
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
                className="bg-white border-gray-300 text-gray-900 mt-1"
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
                className="bg-white border-gray-300 text-gray-900 mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="category">Catégorie</Label>
            <Input
              id="category"
              value={form.category}
              onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value }))}
              className="bg-white border-gray-300 text-gray-900 mt-1"
            />
          </div>

          <div>
            <Label>Image du produit</Label>
            {form.image_url ? (
              <div className="mt-2 relative">
                <img 
                  src={form.image_url} 
                  alt="Aperçu" 
                  className="w-full h-40 object-cover rounded-lg border-2 border-gray-300"
                />
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, image_url: '' }))}
                  className="absolute top-2 right-2 p-1 bg-red-600 rounded-full hover:bg-red-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                <label className="block">
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-orange-500 hover:bg-orange-50 cursor-pointer transition-colors">
                    {uploadingImage ? (
                      <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin text-gray-500" />
                    ) : (
                      <Upload className="w-8 h-8 mx-auto mb-2 text-gray-500" />
                    )}
                    <p className="text-sm text-gray-700">
                      {uploadingImage ? 'Upload en cours...' : 'Cliquez pour uploader une image'}
                    </p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={uploadingImage}
                    className="hidden"
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGenerateImage}
                  disabled={!form.name || generatingImage}
                  className="w-full border-gray-300 text-gray-900 hover:bg-gray-50"
                >
                  {generatingImage ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Génération...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Générer avec IA
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="border-gray-300 text-gray-900 hover:bg-gray-50">
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