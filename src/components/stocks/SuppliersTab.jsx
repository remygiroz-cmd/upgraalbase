import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, Mail, Phone, Trash2, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import SupplierFormModal from './SupplierFormModal';

export default function SuppliersTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);

  const { data: suppliers = [], isLoading: loadingSuppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.filter({ is_active: true }, 'name')
  });

  const saveSupplierMutation = useMutation({
    mutationFn: ({ id, data }) => {
      if (id) {
        return base44.entities.Supplier.update(id, data);
      }
      return base44.entities.Supplier.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setShowForm(false);
      setEditingSupplier(null);
    }
  });

  const deleteSupplierMutation = useMutation({
    mutationFn: (id) => base44.entities.Supplier.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    }
  });

  const handleSave = (data) => {
    saveSupplierMutation.mutate({ 
      id: editingSupplier?.id, 
      data 
    });
  };

  if (loadingSuppliers) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      {/* Header with Add Button */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Fournisseurs</h2>
        <Button
          onClick={() => {
            setEditingSupplier(null);
            setShowForm(true);
          }}
          className="bg-orange-600 hover:bg-orange-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Ajouter un Fournisseur
        </Button>
      </div>

      {/* Suppliers Grid */}
      {suppliers.length === 0 ? (
        <EmptyState
          icon={Phone}
          title="Aucun fournisseur"
          description="Créez votre premier fournisseur pour commencer"
          action={
            <Button
              onClick={() => {
                setEditingSupplier(null);
                setShowForm(true);
              }}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Ajouter un Fournisseur
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.map(supplier => (
            <div
              key={supplier.id}
              className="bg-white rounded-lg border-2 border-gray-300 p-4 hover:border-gray-400 transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900 text-lg">{supplier.name}</h3>
                  {supplier.contact_name && (
                    <p className="text-sm text-gray-600">{supplier.contact_name}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setEditingSupplier(supplier);
                      setShowForm(true);
                    }}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Supprimer ce fournisseur?')) {
                        deleteSupplierMutation.mutate(supplier.id);
                      }
                    }}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {supplier.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <a href={`mailto:${supplier.email}`} className="text-blue-600 hover:underline">
                      {supplier.email}
                    </a>
                  </div>
                )}
                {supplier.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <a href={`tel:${supplier.phone}`} className="text-blue-600 hover:underline">
                      {supplier.phone}
                    </a>
                  </div>
                )}
                {supplier.delivery_days && supplier.delivery_days.length > 0 && (
                  <div className="pt-2 border-t border-gray-200 space-y-2">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Jours d'envoi automatique {supplier.closing_time && `à ${supplier.closing_time}`}</p>
                      <div className="flex gap-1">
                        {supplier.delivery_days.map((day, idx) => (
                          <span
                            key={idx}
                            className="w-6 h-6 bg-orange-100 text-orange-700 rounded text-xs font-semibold flex items-center justify-center"
                          >
                            {day}
                          </span>
                        ))}
                      </div>
                    </div>
                    {supplier.preferred_delivery_days && supplier.preferred_delivery_days.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Jours de livraison souhaités</p>
                        <div className="flex gap-1">
                          {supplier.preferred_delivery_days.map((day, idx) => (
                            <span
                              key={idx}
                              className="w-6 h-6 bg-blue-100 text-blue-700 rounded text-xs font-semibold flex items-center justify-center"
                            >
                              {day}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      <SupplierFormModal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingSupplier(null);
        }}
        onSave={handleSave}
        isSaving={saveSupplierMutation.isPending}
        supplier={editingSupplier}
      />
    </div>
  );
}