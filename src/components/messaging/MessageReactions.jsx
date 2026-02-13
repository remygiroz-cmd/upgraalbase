import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Smile, Plus } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉'];

/**
 * Picker d'emoji rapide
 */
function EmojiPicker({ onSelect }) {
  return (
    <div className="grid grid-cols-4 gap-2 p-2">
      {QUICK_EMOJIS.map(emoji => (
        <button
          key={emoji}
          onClick={() => onSelect(emoji)}
          className="text-2xl p-2 hover:bg-gray-100 rounded transition-colors"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

/**
 * Affichage des réactions sous un message
 */
export function ReactionsDisplay({ 
  reactions, 
  currentEmployeeId, 
  employees,
  onToggle,
  onShowDetails 
}) {
  const [showPicker, setShowPicker] = useState(false);
  
  // Grouper par emoji
  const grouped = useMemo(() => {
    const groups = {};
    reactions.forEach(r => {
      if (!groups[r.emoji]) {
        groups[r.emoji] = {
          emoji: r.emoji,
          count: 0,
          employees: [],
          hasCurrentUser: false
        };
      }
      groups[r.emoji].count++;
      groups[r.emoji].employees.push(r.employee_id);
      if (r.employee_id === currentEmployeeId) {
        groups[r.emoji].hasCurrentUser = true;
      }
    });
    return Object.values(groups);
  }, [reactions, currentEmployeeId]);
  
  if (grouped.length === 0 && !showPicker) {
    return (
      <Popover open={showPicker} onOpenChange={setShowPicker}>
        <PopoverTrigger asChild>
          <button className="opacity-0 group-hover/message:opacity-100 transition-opacity p-1 hover:bg-gray-100 rounded-full">
            <Smile className="w-4 h-4 text-gray-400" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <EmojiPicker onSelect={(emoji) => {
            onToggle(emoji);
            setShowPicker(false);
          }} />
        </PopoverContent>
      </Popover>
    );
  }
  
  return (
    <div className="flex items-center gap-1 mt-1 flex-wrap">
      {grouped.map(group => (
        <button
          key={group.emoji}
          onClick={() => onToggle(group.emoji)}
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all",
            "border",
            group.hasCurrentUser 
              ? "bg-blue-100 border-blue-300 text-blue-900" 
              : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
          )}
        >
          <span>{group.emoji}</span>
          <span>{group.count}</span>
        </button>
      ))}
      
      <Popover open={showPicker} onOpenChange={setShowPicker}>
        <PopoverTrigger asChild>
          <button className="p-1 hover:bg-gray-100 rounded-full transition-colors">
            <Plus className="w-3 h-3 text-gray-400" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <EmojiPicker onSelect={(emoji) => {
            onToggle(emoji);
            setShowPicker(false);
          }} />
        </PopoverContent>
      </Popover>
      
      {grouped.length > 0 && (
        <button
          onClick={onShowDetails}
          className="text-xs text-gray-400 hover:text-gray-600 ml-1"
        >
          •••
        </button>
      )}
    </div>
  );
}

/**
 * Modal de détails des réactions
 */
export function ReactionsDetailModal({ open, onOpenChange, reactions, employees }) {
  // Grouper par emoji
  const grouped = useMemo(() => {
    const groups = {};
    reactions.forEach(r => {
      if (!groups[r.emoji]) {
        groups[r.emoji] = [];
      }
      const employee = employees.find(e => e.id === r.employee_id);
      if (employee) {
        groups[r.emoji].push({
          ...employee,
          reacted_at: r.created_date
        });
      }
    });
    return groups;
  }, [reactions, employees]);
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Réactions</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {Object.entries(grouped).map(([emoji, emps]) => (
            <div key={emoji}>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <span className="text-2xl">{emoji}</span>
                <span className="text-gray-600">({emps.length})</span>
              </h3>
              <div className="space-y-2">
                {emps.map(emp => (
                  <div key={emp.id} className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold overflow-hidden">
                      {emp.photo_url ? (
                        <img src={emp.photo_url} alt={emp.first_name} className="w-full h-full object-cover" />
                      ) : (
                        <span>{emp.first_name?.charAt(0)}{emp.last_name?.charAt(0)}</span>
                      )}
                    </div>
                    <span className="text-sm text-gray-700">
                      {emp.first_name} {emp.last_name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}