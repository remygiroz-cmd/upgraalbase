/**
 * Bloc "Offres de shifts" affiché sur la Home des managers/admins.
 * - Offres actives (date >= aujourd'hui, status open) : affichées directement
 * - Offres passées (date < aujourd'hui) : auto-supprimées si status open, sinon dans un accordéon repliable
 */
import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, XCircle } from 'lucide-react';

const STATUS_LABELS = {
  open: { label: 'En attente', className: 'bg-orange-100 text-orange-700' },
  filled: { label: 'Accepté', className: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Annulée', className: 'bg-gray-100 text-gray-500' },
  expired: { label: 'Expirée', className: 'bg-gray-100 text-gray-500' },
};

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

function getTodayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function ShiftOffersManagerBlock() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState(null);
  const [showPast, setShowPast] = useState(false);

  const { data: offers = [], isLoading } = useQuery({
    queryKey: ['shiftOffers', 'recent'],
    queryFn: () => base44.entities.ShiftOffer.list('-date', 50),
    staleTime: 60 * 1000,
  });

  const { data: allRecipients = [] } = useQuery({
    queryKey: ['shiftOfferRecipients', 'all'],
    queryFn: () => base44.entities.ShiftOfferRecipient.list('-created_date', 200),
    staleTime: 30 * 1000,
  });

  const today = getTodayStr();

  // Auto-delete past open offers
  useEffect(() => {
    if (!offers.length) return;
    const pastOpenOffers = offers.filter(o => o.date < today && o.status === 'open');
    if (pastOpenOffers.length === 0) return;

    const cleanup = async () => {
      for (const offer of pastOpenOffers) {
        try {
          await base44.entities.ShiftOffer.update(offer.id, { status: 'expired' });
          const recipients = allRecipients.filter(r => r.offer_id === offer.id && r.status === 'pending');
          await Promise.all(recipients.map(r => base44.entities.ShiftOfferRecipient.update(r.id, { status: 'cancelled' })));
        } catch (e) {
          // silent
        }
      }
      queryClient.invalidateQueries({ queryKey: ['shiftOffers', 'recent'] });
      queryClient.invalidateQueries({ queryKey: ['shiftOfferRecipients', 'all'] });
    };
    cleanup();
  }, [offers, allRecipients, today]);

  const handleCancel = async (offer) => {
    if (!window.confirm('Annuler cette offre ?')) return;
    try {
      await base44.entities.ShiftOffer.update(offer.id, { status: 'cancelled' });
      const recipients = allRecipients.filter(r => r.offer_id === offer.id && r.status === 'pending');
      await Promise.all(recipients.map(r => base44.entities.ShiftOfferRecipient.update(r.id, { status: 'cancelled' })));
      queryClient.invalidateQueries({ queryKey: ['shiftOffers', 'recent'] });
      queryClient.invalidateQueries({ queryKey: ['shiftOfferRecipients', 'all'] });
      toast.success('Offre annulée');
    } catch (err) {
      toast.error('Erreur : ' + err.message);
    }
  };

  if (isLoading) return null;
  if (offers.length === 0) return null;

  // Separate active vs past
  const activeOffers = offers.filter(o => o.date >= today);
  const pastOffers = offers.filter(o => o.date < today && o.status !== 'open'); // open ones are being auto-expired

  if (activeOffers.length === 0 && pastOffers.length === 0) return null;

  const renderOffer = (offer) => {
    const recipients = allRecipients.filter(r => r.offer_id === offer.id);
    const accepted = recipients.filter(r => r.status === 'accepted').length;
    const refused = recipients.filter(r => r.status === 'refused').length;
    const pending = recipients.filter(r => r.status === 'pending').length;
    const statusInfo = STATUS_LABELS[offer.status] || STATUS_LABELS.open;
    const isExpanded = expandedId === offer.id;

    return (
      <div key={offer.id} className="px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-gray-900">{offer.position}</span>
              <span className="text-gray-500 text-xs">{formatDate(offer.date)}</span>
              <span className="text-gray-500 text-xs">{offer.start_time}–{offer.end_time}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusInfo.className}`}>
                {statusInfo.label}
                {offer.status === 'filled' && offer.accepted_by_employee_name && ` par ${offer.accepted_by_employee_name}`}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
              <span>✅ {accepted}</span>
              <span>❌ {refused}</span>
              <span>⏳ {pending}</span>
              <button
                onClick={() => setExpandedId(isExpanded ? null : offer.id)}
                className="flex items-center gap-0.5 text-blue-500 hover:text-blue-700"
              >
                Détails {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
          </div>
          {offer.status === 'open' && (
            <button
              onClick={() => handleCancel(offer)}
              className="flex-shrink-0 text-xs text-red-400 hover:text-red-600 flex items-center gap-1"
            >
              <XCircle className="w-4 h-4" />
            </button>
          )}
        </div>
        {isExpanded && recipients.length > 0 && (
          <div className="mt-2 bg-gray-50 rounded-lg p-2 space-y-1">
            {recipients.map(r => (
              <div key={r.id} className="flex items-center justify-between text-xs">
                <span className="text-gray-700">{r.employee_name}</span>
                <span className={`px-1.5 py-0.5 rounded ${
                  r.status === 'accepted' ? 'bg-green-100 text-green-700' :
                  r.status === 'refused' ? 'bg-red-100 text-red-600' :
                  r.status === 'cancelled' ? 'bg-gray-100 text-gray-400' :
                  'bg-orange-100 text-orange-600'
                }`}>
                  {r.status === 'accepted' ? 'Accepté' : r.status === 'refused' ? 'Refusé' : r.status === 'cancelled' ? 'Annulé' : 'En attente'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-orange-50 to-amber-50 border-b border-orange-100">
        <div className="flex items-center gap-2">
          <span className="text-lg">📋</span>
          <span className="font-bold text-gray-900 text-sm">Offres de shifts</span>
          {activeOffers.filter(o => o.status === 'open').length > 0 && (
            <span className="bg-orange-200 text-orange-800 text-xs font-semibold px-2 py-0.5 rounded-full">
              {activeOffers.filter(o => o.status === 'open').length} en attente
            </span>
          )}
        </div>
      </div>

      {/* Active offers */}
      {activeOffers.length > 0 ? (
        <div className="divide-y divide-gray-100">
          {activeOffers.map(renderOffer)}
        </div>
      ) : (
        <div className="px-4 py-3 text-sm text-gray-400 italic">Aucune offre active en cours</div>
      )}

      {/* Past offers collapsible */}
      {pastOffers.length > 0 && (
        <div className="border-t border-gray-100">
          <button
            onClick={() => setShowPast(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <span>{showPast ? 'Masquer' : 'Voir'} les offres passées ({pastOffers.length})</span>
            {showPast ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showPast && (
            <div className="divide-y divide-gray-100 bg-gray-50/50">
              {pastOffers.map(renderOffer)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}