import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ScrollToBottom({ visible, count, onClick }) {
  if (!visible) return null;
  
  return (
    <button
      onClick={onClick}
      className={cn(
        "fixed bottom-24 right-8 z-40",
        "bg-blue-600 hover:bg-blue-700 text-white",
        "rounded-full shadow-lg",
        "w-12 h-12 flex items-center justify-center",
        "transition-all duration-200 hover:scale-110",
        "active:scale-95"
      )}
    >
      <ChevronDown className="w-6 h-6" />
      {count > 0 && (
        <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
          {count > 9 ? '9+' : count}
        </div>
      )}
    </button>
  );
}