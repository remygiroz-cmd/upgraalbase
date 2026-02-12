import React from 'react';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const NonShiftCard = React.memo(function NonShiftCard({ nonShift, nonShiftType, onClick, onDelete, disabled = false }) {
  if (!nonShiftType) return null;

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative rounded-md p-2 text-xs cursor-pointer transition-all hover:shadow-md group border-2 h-full",
        "flex items-center gap-2"
      )}
      style={{ 
        backgroundColor: nonShiftType.color + '20',
        borderColor: nonShiftType.color
      }}
    >
      <span className="text-base">{nonShiftType.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate" style={{ color: nonShiftType.color }}>
          {nonShiftType.label}
        </p>
        {nonShift.notes && (
          <p className="text-[10px] text-gray-600 truncate">{nonShift.notes}</p>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(nonShift);
        }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 transition-all"
      >
        <Trash2 className="w-3 h-3 text-red-600" />
      </button>
    </div>
  );
});

export default NonShiftCard;