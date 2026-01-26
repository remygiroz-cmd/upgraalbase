import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Mail, Printer, Edit, Trash2, Calendar, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import EmailConfirmModal from './EmailConfirmModal';

export default function OrderDetailModal({ order, isOpen, onClose }) {
  const [status, setStatus] = useState(order?.status || 'en_cours');
  const [items, setItems] = useState([]);
  const [showEmailConfirm, setShowEmailConfirm] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState('');
  const queryClient = useQueryClient();

  const { data: supplier } = useQuery({
    queryKey: ['supplier', order?.supplier_id],
    queryFn: async () => {
      if (!order?.supplier_id) return null;
      return await base44.entities.Supplier.get(order.supplier_id);
    },
    enabled: !!order?.supplier_id
  });

  useEffect(() => {
    setItems(order?.items || []);
    setStatus(order?.status || 'en_cours');
  }, [order]);

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
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
      toast.success('Commande supprimée');
      onClose();
    }
  });

  if (!order) return null;

  const totalAmount = items.reduce((sum, item) => {
    return sum + (item.quantity * (item.unit_price || 0));
  }, 0);

  const handleQuantityChange = (idx, delta) => {
    const newItems = [...items];
    const newQuantity = Math.max(0, newItems[idx].quantity + delta);
    
    if (newQuantity === 0) {
      newItems.splice(idx, 1);
    } else {
      newItems[idx] = { ...newItems[idx], quantity: newQuantity };
    }
    
    setItems(newItems);
    
    updateOrderMutation.mutate({
      id: order.id,
      data: { items: newItems }
    });
  };

  const getStatusLabel = (statusValue) => {
    const labels = {
      en_cours: 'En cours',
      envoyee: 'Envoyée',
      terminee: 'Terminée',
      annulee: 'Annulée'
    };
    return labels[statusValue] || statusValue;
  };

  const handleStatusChange = (newStatus) => {
    const oldStatus = status;
    setStatus(newStatus);
    
    const currentHistory = order.history || [];
    currentHistory.push({
      timestamp: new Date().toISOString(),
      action: 'status_change',
      details: `Statut modifié: ${getStatusLabel(oldStatus)} → ${getStatusLabel(newStatus)}`,
      user_email: currentUser?.email || 'unknown',
      user_name: currentUser?.full_name || 'Utilisateur'
    });
    
    updateOrderMutation.mutate({
      id: order.id,
      data: { status: newStatus, history: currentHistory }
    });
  };

  const handleDelete = () => {
    if (confirm('Voulez-vous vraiment supprimer cette commande ?')) {
      deleteOrderMutation.mutate(order.id);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSendEmail = async () => {
    try {
      toast.info('Envoi par email en cours...');
      
      const response = await base44.functions.invoke('sendOrderEmail', {
        orderId: order.id
      });
      
      if (response.data.success) {
        handleStatusChange('envoyee');
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        setEmailRecipient(supplier?.email || '');
        setShowEmailConfirm(true);
      } else {
        toast.error(response.data.error || 'Erreur lors de l\'envoi de l\'email');
      }
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de l\'envoi de l\'email');
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      en_cours: 'bg-orange-100 text-orange-800',
      envoyee: 'bg-blue-100 text-blue-800',
      terminee: 'bg-green-100 text-green-800',
      annulee: 'bg-red-100 text-red-800'
    };
    const labels = {
      en_cours: 'EN COURS',
      envoyee: 'ENVOYÉE',
      terminee: 'TERMINÉE',
      annulee: 'ANNULÉE'
    };
    return { style: styles[status] || styles.en_cours, label: labels[status] || 'EN COURS' };
  };

  const badge = getStatusBadge(status);

  return (
    <>
      <EmailConfirmModal 
        isOpen={showEmailConfirm}
        onClose={() => setShowEmailConfirm(false)}
        supplierName={order?.supplier_name}
        recipientEmail={emailRecipient}
      />
      
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="bg-white border-gray-200 max-w-3xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="flex-shrink-0 px-4 sm:px-6 pt-5 pb-4 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-white">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <DialogTitle className="text-lg sm:text-xl font-bold text-gray-900">
                {order.supplier_name?.toUpperCase()}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                <Calendar className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-xs sm:text-sm text-gray-600">
                  {format(new Date(order.date), 'dd-MM-yy', { locale: fr })}
                </span>
              </div>
            </div>
            <Select value={status} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-full sm:w-[160px] border-gray-300">
                <SelectValue>
                  <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${badge.style}`}>
                    {badge.label}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en_cours">En cours</SelectItem>
                <SelectItem value="envoyee">Envoyée</SelectItem>
                <SelectItem value="terminee">Terminée</SelectItem>
                <SelectItem value="annulee">Annulée</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          {/* Header colonnes - Desktop only */}
          <div className="hidden sm:grid grid-cols-[2fr,1.5fr,1fr] gap-4 pb-3 mb-3 text-xs font-semibold text-gray-500 uppercase border-b border-gray-200">
            <div>Désignation</div>
            <div className="text-center">Quantité</div>
            <div className="text-right">Total HT</div>
          </div>

          {/* Liste des articles */}
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div 
                key={idx} 
                className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 hover:border-orange-300 hover:shadow-sm transition-all"
              >
                {/* Mobile Layout */}
                <div className="sm:hidden space-y-3">
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">{item.product_name}</div>
                    {item.supplier_reference && (
                      <div className="text-xs text-gray-500 mt-0.5">Réf: {item.supplier_reference}</div>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleQuantityChange(idx, -1)}
                        className="w-9 h-9 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-900 font-bold text-base active:scale-95 transition-all touch-manipulation"
                      >
                        -
                      </button>
                      <div className="min-w-[90px] text-center text-sm font-medium text-gray-900">
                        {item.unit === 'pièce' ? `${item.quantity} pièce` : 
                         item.unit === 'sac' ? `${item.quantity} sac` : 
                         item.unit === 'bidon' ? `${item.quantity} bidon` :
                         item.unit === 'SACHET' ? `${item.quantity} SACHET` :
                         item.unit === 'Sacs' ? `${item.quantity} Sacs` :
                         `${item.quantity} ${item.unit || ''}`}
                      </div>
                      <button
                        onClick={() => handleQuantityChange(idx, 1)}
                        className="w-9 h-9 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-900 font-bold text-base active:scale-95 transition-all touch-manipulation"
                      >
                        +
                      </button>
                    </div>
                    
                    {item.unit_price && item.unit_price > 0 && (
                      <div className="text-base font-bold text-orange-600">
                        {(item.quantity * item.unit_price).toFixed(2)} €
                      </div>
                    )}
                  </div>
                </div>

                {/* Desktop Layout */}
                <div className="hidden sm:grid grid-cols-[2fr,1.5fr,1fr] gap-4 items-center">
                  <div>
                    <div className="font-semibold text-gray-900">{item.product_name}</div>
                    {item.supplier_reference && (
                      <div className="text-xs text-gray-500 mt-0.5">Réf: {item.supplier_reference}</div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 justify-center">
                    <button
                      onClick={() => handleQuantityChange(idx, -1)}
                      className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-900 font-bold text-sm active:scale-95 transition-all"
                    >
                      -
                    </button>
                    <div className="min-w-[100px] text-center text-sm font-medium text-gray-900">
                      {item.unit === 'pièce' ? `${item.quantity} pièce` : 
                       item.unit === 'sac' ? `${item.quantity} sac` : 
                       item.unit === 'bidon' ? `${item.quantity} bidon` :
                       item.unit === 'SACHET' ? `${item.quantity} SACHET` :
                       item.unit === 'Sacs' ? `${item.quantity} Sacs` :
                       `${item.quantity} ${item.unit || ''}`}
                    </div>
                    <button
                      onClick={() => handleQuantityChange(idx, 1)}
                      className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-900 font-bold text-sm active:scale-95 transition-all"
                    >
                      +
                    </button>
                  </div>
                  
                  <div className="text-right text-base font-bold text-gray-900">
                    {(item.unit_price && item.unit_price > 0) ? `${(item.quantity * item.unit_price).toFixed(2)} €` : '-'}
                  </div>
                </div>
              </div>
            ))}
            
            {items.length === 0 && (
              <div className="py-12 text-center text-gray-400">
                <p className="text-sm">Aucun article dans cette commande</p>
              </div>
            )}
          </div>

          {/* Historique */}
          {order.history && order.history.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-200 print:hidden">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Historique des actions
              </h3>
              <div className="space-y-2">
                {[...order.history].reverse().map((entry, idx) => (
                  <div key={idx} className="flex items-start gap-3 text-xs bg-gray-50 p-3 rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{entry.details}</div>
                      <div className="text-gray-500 mt-1">
                        {entry.user_name} • {format(new Date(entry.timestamp), 'dd/MM/yyyy à HH:mm', { locale: fr })}
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex items-start gap-3 text-xs bg-gray-50 p-3 rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">Commande créée</div>
                    <div className="text-gray-500 mt-1">
                      {order.created_by} • {format(new Date(order.created_date), 'dd/MM/yyyy à HH:mm', { locale: fr })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-4 sm:px-6 py-4 border-t-2 border-gray-200 bg-gradient-to-r from-orange-50 to-white space-y-4">
          {/* Total */}
          <div className="flex items-center justify-between">
            <div className="text-sm sm:text-base font-semibold text-gray-700 uppercase">
              Total Estimé HT
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-orange-600">
              {totalAmount.toFixed(2)} €
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
            <Button
              onClick={handleSendEmail}
              className="bg-orange-600 hover:bg-orange-700 text-white gap-2 h-11 sm:h-10 touch-manipulation"
            >
              <Mail className="w-4 h-4" />
              <span className="hidden sm:inline">ENVOYER</span>
              <span className="sm:hidden">Envoyer</span>
            </Button>
            <Button
              onClick={handlePrint}
              variant="outline"
              className="border-gray-300 hover:bg-gray-50 gap-2 h-11 sm:h-10 touch-manipulation"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Imprimer</span>
            </Button>
            <Button
              variant="outline"
              className="border-blue-600 text-blue-600 hover:bg-blue-50 gap-2 h-11 sm:h-10 touch-manipulation"
            >
              <Edit className="w-4 h-4" />
              <span className="hidden sm:inline">Modifier</span>
            </Button>
            <Button
              onClick={handleDelete}
              variant="outline"
              className="border-red-600 text-red-600 hover:bg-red-50 gap-2 h-11 sm:h-10 sm:ml-auto touch-manipulation"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Supprimer</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}