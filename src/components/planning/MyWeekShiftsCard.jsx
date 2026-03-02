import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { parseLocalDate, formatLocalDate } from '@/components/planning/dateUtils';
import { Calendar } from 'lucide-react';

const DAY_NAMES_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function getWeekBounds() {
  const today = new Date();
  const jsDay = today.getDay(); // 0=dim, 1=lun...
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return {
    start: formatLocalDate(monday),
    end: formatLocalDate(sunday),
    monday,
    sunday,
  };
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  return timeStr.slice(0, 5);
}

function calcDuration(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

function formatDuration(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

function formatDateFR(dateStr) {
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function getDayShort(dateStr) {
  const d = parseLocalDate(dateStr);
  return DAY_NAMES_SHORT[d.getDay()];
}

export default function MyWeekShiftsCard({ currentEmployee, resetVersion, monthKey }) {
  const { start, end, monday, sunday } = useMemo(() => getWeekBounds(), []);

  // Fetch shifts de la semaine ciblés par employee + date range
  const { data: weekShifts = [], isLoading } = useQuery({
    queryKey: ['myWeekShifts', currentEmployee?.id, start, end, resetVersion],
    queryFn: async () => {
      if (!currentEmployee?.id) return [];
      const shifts = await base44.entities.Shift.filter({
        employee_id: currentEmployee.id,
        date: { $gte: start, $lte: end },
      });
      // Exclure archivés et respecter reset_version si dispo
      return shifts.filter(s => {
        if (s.status === 'archived') return false;
        if (resetVersion !== undefined && s.reset_version !== undefined && s.reset_version !== resetVersion) return false;
        return true;
      });
    },
    enabled: !!currentEmployee?.id,
    staleTime: 60 * 1000,
  });

  // Grouper par date, trié
  const groupedByDay = useMemo(() => {
    const sorted = [...weekShifts].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.start_time.localeCompare(b.start_time);
    });
    const groups = {};
    for (const s of sorted) {
      if (!groups[s.date]) groups[s.date] = [];
      groups[s.date].push(s);
    }
    return groups;
  }, [weekShifts]);

  const totalMinutes = useMemo(() => {
    return weekShifts.reduce((sum, s) => sum + calcDuration(s.start_time, s.end_time), 0);
  }, [weekShifts]);

  const mondayFR = monday.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  const sundayFR = sunday.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <Calendar className="w-4 h-4 text-blue-600" />
        <div>
          <h2 className="text-base font-semibold text-gray-900">Mes shifts cette semaine</h2>
          <p className="text-xs text-gray-500">Semaine du {mondayFR} au {sundayFR}</p>
        </div>
      </div>

      <div className="px-4 py-3">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse h-6 bg-gray-100 rounded" />
            ))}
          </div>
        ) : weekShifts.length === 0 ? (
          <p className="text-sm text-gray-500 py-2">➡️ Aucun shift prévu cette semaine.</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(groupedByDay).map(([date, shifts]) => (
              <div key={date}>
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                  {getDayShort(date)} {formatDateFR(date)}
                </div>
                <div className="space-y-1 pl-2 border-l-2 border-blue-100">
                  {shifts.map(s => (
                    <div key={s.id} className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-gray-800 font-medium">
                        {formatTime(s.start_time)} → {formatTime(s.end_time)}
                      </span>
                      {s.position && (
                        <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100">
                          {s.position}
                        </span>
                      )}
                      {s.status && s.status !== 'planned' && s.status !== 'confirmed' && (
                        <span className="text-xs px-2 py-0.5 bg-orange-50 text-orange-600 rounded-full border border-orange-100">
                          {s.status}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {totalMinutes > 0 && (
              <div className="pt-2 border-t border-gray-100 text-sm text-gray-600">
                Total semaine : <span className="font-semibold text-gray-800">{formatDuration(totalMinutes)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}