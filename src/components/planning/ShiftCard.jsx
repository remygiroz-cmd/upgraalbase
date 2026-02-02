import React from 'react';
import { cn } from '@/lib/utils';
import { Clock, Coffee, AlertTriangle, Trash2 } from 'lucide-react';

const POSITION_COLORS = {
  'cuisine': { bg: 'bg-red-50', border: 'border-red-400', text: 'text-red-900' },
  'caisse': { bg: 'bg-blue-50', border: 'border-blue-400', text: 'text-blue-900' },
  'livraison': { bg: 'bg-purple-50', border: 'border-purple-400', text: 'text-purple-900' },
  'service': { bg: 'bg-green-50', border: 'border-green-400', text: 'text-green-900' },
  'plonge': { bg: 'bg-gray-50', border: 'border-gray-400', text: 'text-gray-900' },
  'autre': { bg: 'bg-orange-50', border: 'border-orange-400', text: 'text-orange-900' }
};

const STATUS_ICONS = {
  planned: '📋',
  confirmed: '✅',
  completed: '✔️',
  cancelled: '❌'
};

export default function ShiftCard({ shift, onClick, onDelete, hasRestWarning, hasOvertimeWarning }) {
  const calculateDuration = () => {
    const [startH, startM] = shift.start_time.split(':').map(Number);
    const [endH, endM] = shift.end_time.split(':').map(Number);
    
    let totalMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    if (totalMinutes < 0) totalMinutes += 24 * 60;
    
    totalMinutes -= (shift.break_minutes || 0);
    
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h${minutes > 0 ? minutes.toString().padStart(2, '0') : ''}`;
  };

  const positionKey = shift.position?.toLowerCase() || 'autre';
  const colors = POSITION_COLORS[positionKey] || POSITION_COLORS.autre;

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative rounded-lg border-2 p-2 cursor-pointer transition-all hover:shadow-md group",
        colors.bg,
        colors.border,
        shift.status === 'cancelled' && "opacity-50"
      )}
    >
      {(hasRestWarning || hasOvertimeWarning) && (
        <div className="absolute -top-1 -right-1 bg-orange-500 text-white rounded-full p-0.5">
          <AlertTriangle className="w-3 h-3" />
        </div>
      )}
      
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(shift);
        }}
        className="absolute -top-2 -left-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-lg"
      >
        <Trash2 className="w-3 h-3" />
      </button>
      
      <div className="flex items-center justify-between mb-1">
        <span className={cn("text-[10px] font-bold uppercase tracking-wider", colors.text)}>
          {shift.position || 'Autre'}
        </span>
        <span className="text-xs">{STATUS_ICONS[shift.status] || '📋'}</span>
      </div>
      
      <div className={cn("text-xs font-bold mb-1 flex items-center gap-1", colors.text)}>
        <Clock className="w-3 h-3" />
        {shift.start_time} - {shift.end_time}
      </div>
      
      <div className="flex items-center justify-between text-[10px]">
        <span className={cn("font-semibold", colors.text)}>
          {calculateDuration()}
        </span>
        {shift.break_minutes > 0 && (
          <span className={cn("flex items-center gap-0.5", colors.text)}>
            <Coffee className="w-2.5 h-2.5" />
            {shift.break_minutes}min
          </span>
        )}
      </div>
    </div>
  );
}