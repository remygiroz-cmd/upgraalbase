import React, { useMemo } from 'react';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const TYPE_BG = {
  INDISPO: 'bg-red-500',
  RDV: 'bg-blue-500',
  FORMATION: 'bg-purple-500',
  CONGE: 'bg-green-500',
  RAPPEL: 'bg-yellow-500',
  PERSO: 'bg-gray-500',
  AUTRE: 'bg-orange-500',
};

export default function AgendaMonthView({ currentDate, events, onEventClick, onDayClick }) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = useMemo(() => {
    const result = [];
    let d = calStart;
    while (d <= calEnd) {
      result.push(d);
      d = addDays(d, 1);
    }
    return result;
  }, [currentDate]);

  const weeks = useMemo(() => {
    const result = [];
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7));
    }
    return result;
  }, [days]);

  const eventsByDay = useMemo(() => {
    const map = {};
    events.forEach(ev => {
      if (ev.status === 'CANCELLED') return;
      const dayKey = format(new Date(ev.start_at), 'yyyy-MM-dd');
      if (!map[dayKey]) map[dayKey] = [];
      map[dayKey].push(ev);
    });
    return map;
  }, [events]);

  const today = new Date();

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header jours */}
      <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
        {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => (
          <div key={d} className="p-2 text-center text-xs font-semibold text-gray-500">{d}</div>
        ))}
      </div>

      {/* Semaines */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b border-gray-100 last:border-0">
          {week.map((day, di) => {
            const dayKey = format(day, 'yyyy-MM-dd');
            const dayEvents = eventsByDay[dayKey] || [];
            const isToday = isSameDay(day, today);
            const isCurrentMonth = isSameMonth(day, currentDate);

            return (
              <div
                key={di}
                onClick={() => onDayClick(day)}
                className={cn(
                  'min-h-[80px] p-1 border-r border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 transition-colors',
                  !isCurrentMonth && 'bg-gray-50/50'
                )}
              >
                <div className={cn(
                  'w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium mb-1',
                  isToday ? 'bg-blue-600 text-white' : isCurrentMonth ? 'text-gray-900' : 'text-gray-400'
                )}>
                  {format(day, 'd')}
                </div>

                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map(ev => (
                    <div
                      key={ev.id}
                      onClick={e => { e.stopPropagation(); onEventClick(ev); }}
                      className={cn(
                        'text-xs px-1 py-0.5 rounded text-white truncate cursor-pointer hover:opacity-80',
                        TYPE_BG[ev.type] || 'bg-gray-400',
                        ev.importance === 'URGENT' && 'ring-1 ring-red-400'
                      )}
                    >
                      {ev.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="text-xs text-gray-500 px-1">+{dayEvents.length - 3}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}