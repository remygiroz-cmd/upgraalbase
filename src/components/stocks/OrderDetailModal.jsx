import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Mail, Printer, Edit, Trash2, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function OrderDetailModal({ order, isOpen, onClose }) {
  const [status, setStatus] = useState(order?.status || 'sent');
  const queryClient = useQueryClient();

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

  const totalAmount = order.items?.reduce((sum, item) => {
    return sum + (item.quantity * (item.unit_price || 0));
  }, 0) || 0;

  const handleStatusChange = (newStatus) => {
    setStatus(newStatus);
    updateOrderMutation.mutate({
      id: order.id,
      data: { status: newStatus }
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
    toast.info('Envoi par email en cours...');
    // TODO: Implémenter l'envoi d'email
  };

  const getStatusBadge = (status) => {
    const styles = {
      draft: 'bg-gray-100 text-gray-800',
      sent: 'bg-orange-100 text-orange-800',
      received: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800'
    };
    const labels = {
      draft: 'BROUILLON',
      sent: 'EN COURS',
      received: 'REÇUE',
      cancelled: 'ANNULÉE'
    };
    return { style: styles[status], label: labels[status] };
  };

  const badge = getStatusBadge(status);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white border-gray-300 max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-gray-900 text-xl">
            COMMANDE {order.supplier_name?.toUpperCase()}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Informations de commande */}
          <div className="flex flex-wrap items-center gap-4 pb-4 border-b border-gray-300">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-900">
                Date: {format(new Date(order.date), 'dd-MM-yy', { locale: fr })}
              </span>
            </div>
            <Select value={status} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-[160px]">
                <SelectValue>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${badge.style}`}>
                    {badge.label}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Brouillon</SelectItem>
                <SelectItem value="sent">En cours</SelectItem>
                <SelectItem value="received">Reçue</SelectItem>
                <SelectItem value="cancelled">Annulée</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Liste des articles */}
          <div>
            <div className="grid grid-cols-[1fr,auto,auto] gap-4 pb-2 text-xs font-semibold text-gray-600 uppercase border-b border-gray-300">
              <div>Désignation</div>
              <div className="text-center">Quantité</div>
              <div className="text-right">Total HT</div>
            </div>
            <div className="divide-y divide-gray-200">
              {order.items?.map((item, idx) => (
                <div key={idx} className="grid grid-cols-[1fr,auto,auto] gap-4 py-3 text-sm">
                  <div>
                    <div className="font-semibold text-gray-900">{item.product_name}</div>
                    {item.supplier_reference && (
                      <div className="text-xs text-gray-500">Réf: {item.supplier_reference}</div>
                    )}
                  </div>
                  <div className="text-center text-gray-900 whitespace-nowrap">
                    {item.unit === 'pièce' ? `${item.quantity} pièce` : 
                     item.unit === 'sac' ? `${item.quantity} sac ${item.weight || ''}` : 
                     item.unit === 'bidon' ? `${item.quantity} bidon ${item.volume || ''}` :
                     `${item.quantity} ${item.unit || ''}`}
                  </div>
                  <div className="text-right text-gray-900 font-semibold">
                    {item.unit_price ? `${(item.quantity * item.unit_price).toFixed(2)} €` : '-'}
                  </div>
                </div>
              ))}
              {(!order.items || order.items.length === 0) && (
                <div className="py-8 text-center text-gray-500">
                  Aucun article dans cette commande
                </div>
              )}
            </div>
          </div>

          {/* Total */}
          <div className="border-t-2 border-gray-300 pt-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900 uppercase">
                Total Estimé HT
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {totalAmount.toFixed(2)} €
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex flex-wrap gap-2 pt-4 border-t border-gray-300">
          <Button
            onClick={handleSendEmail}
            className="bg-orange-600 hover:bg-orange-700 text-white gap-2"
          >
            <Mail className="w-4 h-4" />
            ENVOYER
          </Button>
          <Button
            onClick={handlePrint}
            variant="outline"
            className="border-gray-300 gap-2"
          >
            <Printer className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            className="border-blue-600 text-blue-600 hover:bg-blue-50 gap-2"
          >
            <Edit className="w-4 h-4" />
          </Button>
          <Button
            onClick={handleDelete}
            variant="outline"
            className="border-red-600 text-red-600 hover:bg-red-50 gap-2 ml-auto"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}