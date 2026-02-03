import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';
import { Clock, Coffee, AlertTriangle, Trash2 } from 'lucide-react';

const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 59, g: 130, b: 246 };
};

const STATUS_ICONS = {
  planned: '📋',
  confirmed: '✅',
  completed: '✔️',
  cancelled: '❌'
};

export default function ShiftCard({ shift, onClick, onDelete, hasRestWarning, hasOvertimeWarning }) {
  const { data: positions = [] } = useQuery({
    queryKey: ['positions'],
    queryFn: async () => {
      const all = await base44.entities.Position.filter({ is_active: true });
      return all;
    }
  });

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

  const position = positions.find(p => p.label === shift.position);
  const positionColor = position?.color || '#3b82f6';
  const rgb = hexToRgb(positionColor);
  
  const colors = {
    bg: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`,
    border: positionColor,
    text: positionColor
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative rounded-lg border-2 p-2 cursor-pointer transition-all hover:shadow-md group h-full flex flex-col justify-center",
        shift.status === 'cancelled' && "opacity-50"
      )}
      style={{ 
        backgroundColor: colors.bg,
        borderColor: colors.border
      }}
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
      
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" style={{ color: colors.text }} />
          <span className="text-[11px] font-bold" style={{ color: colors.text }}>
            {shift.start_time} - {shift.end_time}
          </span>
        </div>
        <span className="text-xs">{STATUS_ICONS[shift.status] || '📋'}</span>
      </div>
      
      <div className="flex items-center justify-between text-[10px] mt-0.5">
        <span className="font-semibold uppercase tracking-wide" style={{ color: colors.text }}>
          {shift.position || 'Autre'}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="font-semibold" style={{ color: colors.text }}>
            {calculateDuration()}
          </span>
          {shift.break_minutes > 0 && (
            <span className="flex items-center gap-0.5" style={{ color: colors.text }}>
              <Coffee className="w-2.5 h-2.5" />
              {shift.break_minutes}min
            </span>
          )}
        </div>
      </div>
    </div>
  );
}