import React from 'react';
import { Calendar, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function HolidayBadge({ holiday, position = 'top' }) {
  if (!holiday) return null;

  const isMay1 = holiday.is_may_first;

  return (
    <div 
      className={cn(
        "absolute z-10 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold shadow-lg",
        position === 'top' ? 'top-1 right-1' : 'bottom-1 right-1',
        isMay1 
          ? 'bg-red-600 text-white animate-pulse' 
          : 'bg-purple-600 text-white'
      )}
      title={`${holiday.name}${isMay1 ? ' - Doublement obligatoire' : ''}`}
    >
      {isMay1 && <AlertTriangle className="w-3 h-3" />}
      <Calendar className="w-3 h-3" />
      <span>{holiday.name}</span>
    </div>
  );
}