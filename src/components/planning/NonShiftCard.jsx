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
        "relative rounded-md p-2 text-xs transition-all group border-2 h-full",
        "flex items-center gap-2",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:shadow-md"
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
          if (disabled) {
            toast.error('Lecture seule — vous n\'avez pas la permission de modifier le planning', {
              duration: 3000,
              icon: '🔒'
            });
            return;
          }
          onDelete(nonShift);
        }}
        disabled={disabled}
        className={cn(
          "p-1 rounded transition-all",
          disabled
            ? "opacity-30 cursor-not-allowed"
            : "opacity-0 group-hover:opacity-100 hover:bg-red-100"
        )}
      >
        <Trash2 className="w-3 h-3 text-red-600" />
      </button>
    </div>
  );
});

export default NonShiftCard;