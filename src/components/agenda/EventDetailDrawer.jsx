import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit2, Trash2, MapPin, FileText, User, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const TYPE_LABELS = {
  INDISPO: '🚫 Indisponibilité',
  RDV: '📅 Rendez-vous',
  FORMATION: '📚 Formation',
  CONGE: '🏖️ Congé',
  RAPPEL: '🔔 Rappel',
  PERSO: '👤 Personnel',
  AUTRE: '📌 Autre',
};

const TYPE_COLORS = {
  INDISPO: 'bg-red-100 text-red-800',
  RDV: 'bg-blue-100 text-blue-800',
  FORMATION: 'bg-purple-100 text-purple-800',
  CONGE: 'bg-green-100 text-green-800',
  RAPPEL: 'bg-yellow-100 text-yellow-800',
  PERSO: 'bg-gray-100 text-gray-800',
  AUTRE: 'bg-orange-100 text-orange-800',
};

function formatEventDates(event) {
  if (!event) return '';
  try {
    if (event.all_day) {
      const s = format(new Date(event.start_at), 'dd MMMM yyyy', { locale: fr });
      return `Toute la journée — ${s}`;
    }
    const s = format(new Date(event.start_at), 'dd MMM yyyy HH:mm', { locale: fr });
    const e = format(new Date(event.end_at), 'HH:mm', { locale: fr });
    return `${s} → ${e}`;
  } catch {
    return '';
  }
}

export default function EventDetailDrawer({ event, open, onClose, onEdit, onDelete, canEdit, ownerEmployee, isPrivate }) {
  if (!event) return null;

  const isCancelled = event.status === 'CANCELLED';

  return (
    <Sheet open={open} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-left">
            {isPrivate ? (
              <span className="text-gray-500 italic">🔒 Occupé</span>
            ) : (
              <span className={isCancelled ? 'line-through text-gray-400' : ''}>
                {event.title}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          {!isPrivate && (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge className={TYPE_COLORS[event.type] || 'bg-gray-100 text-gray-800'}>
                  {TYPE_LABELS[event.type] || event.type}
                </Badge>
                {event.importance === 'URGENT' && (
                  <Badge className="bg-red-600 text-white">🔴 URGENT</Badge>
                )}
                {isCancelled && (
                  <Badge className="bg-gray-200 text-gray-600">Annulé</Badge>
                )}
                <Badge variant="outline" className="text-xs">
                  {event.visibility === 'PRIVATE' ? '🔒 Privé' : event.visibility === 'TEAM' ? '👥 Équipe' : '🏢 Interne'}
                </Badge>
              </div>

              <div className="flex items-start gap-2 text-sm text-gray-700">
                <Clock className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0" />
                <span>{formatEventDates(event)}</span>
              </div>

              {ownerEmployee && (
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span>{ownerEmployee.first_name} {ownerEmployee.last_name}</span>
                </div>
              )}

              {event.location && (
                <div className="flex items-start gap-2 text-sm text-gray-700">
                  <MapPin className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0" />
                  <span>{event.location}</span>
                </div>
              )}

              {event.notes && (
                <div className="flex items-start gap-2 text-sm text-gray-700">
                  <FileText className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0" />
                  <p className="whitespace-pre-wrap">{event.notes}</p>
                </div>
              )}
            </>
          )}

          {isPrivate && (
            <div className="text-sm text-gray-500 italic">
              Les détails de cet événement sont privés.
            </div>
          )}

          {canEdit && !isPrivate && (
            <div className="flex gap-2 pt-4 border-t">
              <Button variant="outline" onClick={onEdit} className="flex-1">
                <Edit2 className="w-4 h-4 mr-2" /> Modifier
              </Button>
              <Button
                variant="outline"
                onClick={onDelete}
                className="border-red-300 text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}