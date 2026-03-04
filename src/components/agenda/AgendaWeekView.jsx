import React, { useMemo } from 'react';
import { startOfWeek, endOfWeek, addDays, isSameDay, format } from 'date-fns';
import { fr } from 'date-fns/locale';
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

const HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 7h à 22h

export default function AgendaWeekView({ currentDate, events, onEventClick, onCellClick }) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  const eventsByDay = useMemo(() => {
    const map = {};
    days.forEach(d => {
      const key = format(d, 'yyyy-MM-dd');
      map[key] = events.filter(ev => {
        if (ev.status === 'CANCELLED') return false;
        return isSameDay(new Date(ev.start_at), d);
      });
    });
    return map;
  }, [events, currentDate]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
      {/* Header */}
      <div className="grid grid-cols-8 border-b border-gray-200 sticky top-0 bg-white z-10">
        <div className="p-2 text-xs text-gray-400 border-r border-gray-100" />
        {days.map((d, i) => {
          const isToday = isSameDay(d, today);
          return (
            <div key={i} className={cn(
              'p-2 text-center border-r border-gray-100 last:border-0',
              isToday && 'bg-blue-50'
            )}>
              <div className="text-xs text-gray-500">{format(d, 'EEE', { locale: fr })}</div>
              <div className={cn(
                'text-sm font-semibold mt-0.5',
                isToday ? 'text-blue-600' : 'text-gray-900'
              )}>
                {format(d, 'd')}
              </div>
            </div>
          );
        })}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-8">
        {/* Heures */}
        <div className="border-r border-gray-100">
          {HOURS.map(h => (
            <div key={h} className="h-14 border-b border-gray-50 pr-2 text-right">
              <span className="text-xs text-gray-400">{h}:00</span>
            </div>
          ))}
        </div>

        {/* Colonnes jours */}
        {days.map((d, di) => {
          const dayKey = format(d, 'yyyy-MM-dd');
          const dayEvents = eventsByDay[dayKey] || [];
          const isToday = isSameDay(d, today);

          return (
            <div key={di} className={cn('border-r border-gray-100 last:border-0 relative', isToday && 'bg-blue-50/30')}>
              {HOURS.map(h => (
                <div
                  key={h}
                  className="h-14 border-b border-gray-50 hover:bg-blue-50/40 cursor-pointer transition-colors"
                  onClick={() => {
                    const dt = new Date(d);
                    dt.setHours(h, 0, 0, 0);
                    onCellClick && onCellClick(dt);
                  }}
                />
              ))}

              {/* Événements positionnés */}
              {dayEvents.map(ev => {
                const startH = new Date(ev.start_at).getHours() + new Date(ev.start_at).getMinutes() / 60;
                const endH = new Date(ev.end_at).getHours() + new Date(ev.end_at).getMinutes() / 60;
                const top = Math.max(0, (startH - 7) * 56);
                const height = Math.max(28, (endH - startH) * 56);

                return (
                  <div
                    key={ev.id}
                    onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                    style={{ top: `${top}px`, height: `${height}px` }}
                    className={cn(
                      'absolute left-0.5 right-0.5 px-1 py-0.5 rounded border-l-2 text-xs cursor-pointer hover:opacity-80 overflow-hidden z-10',
                      TYPE_BG[ev.type] || 'bg-gray-100 border-gray-400 text-gray-900',
                      ev.importance === 'URGENT' && 'ring-1 ring-red-400'
                    )}
                  >
                    <div className="font-medium truncate">{ev.title}</div>
                    {!ev.all_day && (
                      <div className="text-[10px] opacity-70">
                        {format(new Date(ev.start_at), 'HH:mm')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}