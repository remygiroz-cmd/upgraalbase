import React from 'react';
import { format, isSameDay } from 'date-fns';
import { cn } from '@/lib/utils';

const TYPE_BG = {
  INDISPO: 'bg-red-100 border-red-400 text-red-900',
  RDV: 'bg-blue-100 border-blue-400 text-blue-900',
  FORMATION: 'bg-purple-100 border-purple-400 text-purple-900',
  CONGE: 'bg-green-100 border-green-400 text-green-900',
  RAPPEL: 'bg-yellow-100 border-yellow-400 text-yellow-900',
  PERSO: 'bg-gray-100 border-gray-400 text-gray-900',
  AUTRE: 'bg-orange-100 border-orange-400 text-orange-900',
};

const HOURS = Array.from({ length: 16 }, (_, i) => i + 7);

export default function AgendaDayView({ currentDate, events, onEventClick, currentEmployeeId, isPrivileged }) {
  const dayEvents = events.filter(ev => {
    if (ev.status === 'CANCELLED') return false;
    return isSameDay(new Date(ev.start_at), currentDate);
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
      <div className="grid grid-cols-[60px_1fr]">
        {/* Heures */}
        <div className="border-r border-gray-100">
          {HOURS.map(h => (
            <div key={h} className="h-16 border-b border-gray-50 pr-2 flex items-start justify-end pt-1">
              <span className="text-xs text-gray-400">{h}:00</span>
            </div>
          ))}
        </div>

        {/* Colonne journée */}
        <div className="relative">
          {HOURS.map(h => (
            <div key={h} className="h-16 border-b border-gray-50" />
          ))}

          {dayEvents.map(ev => {
            const isPrivate = ev.visibility === 'PRIVATE' && isPrivileged && ev.owner_employee_id !== currentEmployeeId;
            const startH = new Date(ev.start_at).getHours() + new Date(ev.start_at).getMinutes() / 60;
            const endH = new Date(ev.end_at).getHours() + new Date(ev.end_at).getMinutes() / 60;
            const top = Math.max(0, (startH - 7) * 64);
            const height = Math.max(32, (endH - startH) * 64);

            return (
              <div
                key={ev.id}
                onClick={() => onEventClick(ev)}
                style={{ top: `${top}px`, height: `${height}px` }}
                className={cn(
                  'absolute left-1 right-1 px-2 py-1 rounded border-l-4 text-sm cursor-pointer hover:opacity-80 z-10 overflow-hidden',
                  isPrivate ? 'bg-gray-100 border-gray-400 text-gray-600 italic' : (TYPE_BG[ev.type] || 'bg-gray-100 border-gray-400'),
                  ev.importance === 'URGENT' && 'ring-1 ring-red-500'
                )}
              >
                <div className="font-medium truncate">{isPrivate ? '🔒 Occupé' : ev.title}</div>
                {!isPrivate && (
                  <div className="text-xs opacity-70">
                    {format(new Date(ev.start_at), 'HH:mm')} – {format(new Date(ev.end_at), 'HH:mm')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}