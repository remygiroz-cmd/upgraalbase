/**
 * Carte affichée sur la Home d'un employé pour une offre de shift pending.
 */
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Check, X, Clock, Briefcase } from 'lucide-react';
import { getActiveMonthContext } from '@/components/planning/monthContext';
import { shiftsQueryKey } from '@/components/planning/shiftService';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

export default function ShiftOfferCard({ recipient, offer, employee, onHandled }) {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const handleRefuse = async () => {
    setLoading(true);
    try {
      await base44.entities.ShiftOfferRecipient.update(recipient.id, {
        status: 'refused',
        responded_at: new Date().toISOString(),
      });
      toast.success('Offre refusée');
      onHandled(recipient.id);
    } catch (err) {
      toast.error('Erreur : ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    setLoading(true);
    try {
      // 1. Re-fetch offer to check it's still open
      const offers = await base44.entities.ShiftOffer.filter({ id: offer.id });
      const freshOffer = offers[0];
      if (!freshOffer || freshOffer.status !== 'open') {
        toast.error('Trop tard, ce shift a déjà été pris.');
        onHandled(recipient.id);
        return;
      }

      // 2. Check employee doesn't already have a shift that day
      const existingShifts = await base44.entities.Shift.filter({
        employee_id: employee.id,
        date: offer.date,
      });
      const activeShifts = existingShifts.filter(s => s.status !== 'archived');
      if (activeShifts.length > 0) {
        toast.error('Vous avez déjà un shift prévu ce jour-là.');
        onHandled(recipient.id);
        return;
      }

      // 3. Get month context for versioning
      const monthKey = offer.date.substring(0, 7); // YYYY-MM
      const ctx = await getActiveMonthContext(monthKey);

      // 4. Create the shift
      await base44.entities.Shift.create({
        employee_id: employee.id,
        employee_name: `${employee.first_name} ${employee.last_name}`,
        date: offer.date,
        start_time: offer.start_time,
        end_time: offer.end_time,
        break_minutes: 0,
        position: offer.position,
        status: 'planned',
        month_key: ctx.month_key,
        reset_version: ctx.reset_version,
        notes: offer.notes || '',
        dedupe_key: `${employee.id}|${offer.date}|${offer.start_time}|${offer.end_time}|${ctx.month_key}|${ctx.reset_version}`,
      });

      // 5. Mark offer as filled
      await base44.entities.ShiftOffer.update(offer.id, {
        status: 'filled',
        accepted_by_employee_id: employee.id,
        accepted_by_employee_name: `${employee.first_name} ${employee.last_name}`,
        accepted_at: new Date().toISOString(),
      });

      // 6. Update recipients: this one accepted, others pending → cancelled
      const allRecipients = await base44.entities.ShiftOfferRecipient.filter({ offer_id: offer.id });
      await Promise.all(allRecipients.map(r => {
        if (r.id === recipient.id) {
          return base44.entities.ShiftOfferRecipient.update(r.id, {
            status: 'accepted',
            responded_at: new Date().toISOString(),
          });
        }
        if (r.status === 'pending') {
          return base44.entities.ShiftOfferRecipient.update(r.id, { status: 'cancelled' });
        }
        return Promise.resolve();
      }));

      // 7. Invalidate planning queries
      const [yearStr, monthStr] = ctx.month_key.split('-');
      queryClient.invalidateQueries({ queryKey: shiftsQueryKey(parseInt(yearStr), parseInt(monthStr) - 1, ctx.reset_version) });
      queryClient.invalidateQueries({ queryKey: ['shifts'] });

      toast.success('Shift accepté ! Il apparaît dans votre planning. ✅');
      onHandled(recipient.id);
    } catch (err) {
      toast.error('Erreur : ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Briefcase className="w-4 h-4 text-orange-500" />
            <span className="font-bold text-orange-700 text-sm">Shift supplémentaire proposé</span>
          </div>
          <div className="text-base font-semibold text-gray-900">{offer.position}</div>
          <div className="text-sm text-gray-600 mt-0.5">{formatDate(offer.date)}</div>
          <div className="flex items-center gap-1 text-sm text-gray-600 mt-0.5">
            <Clock className="w-3.5 h-3.5" />
            {offer.start_time} – {offer.end_time}
          </div>
          {offer.notes && <div className="text-xs text-gray-500 mt-1 italic">{offer.notes}</div>}
          <div className="text-xs text-gray-400 mt-1">Proposé par {offer.created_by_name}</div>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleRefuse}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-red-200 text-red-600 bg-white hover:bg-red-50 text-sm font-medium transition-colors"
        >
          <X className="w-4 h-4" /> Refuser
        </button>
        <button
          onClick={handleAccept}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-medium transition-colors"
        >
          <Check className="w-4 h-4" /> Accepter
        </button>
      </div>
    </div>
  );
}