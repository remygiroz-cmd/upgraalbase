import React from 'react';
import { cn } from '@/lib/utils';

export default function TypingIndicator({ employees }) {
  if (!employees || employees.length === 0) return null;
  
  const names = employees.map(e => e.first_name).join(', ');
  
  return (
    <div className="flex gap-2 items-end mb-2 animate-in fade-in duration-200">
      <div className="w-8 h-8 rounded-full bg-gray-300 flex-shrink-0 flex items-center justify-center text-white text-xs font-semibold overflow-hidden">
        {employees[0]?.photo_url ? (
          <img src={employees[0].photo_url} alt={employees[0].first_name} className="w-full h-full object-cover" />
        ) : (
          <span>{employees[0]?.first_name?.charAt(0)}{employees[0]?.last_name?.charAt(0)}</span>
        )}
      </div>
      
      <div className="bg-white rounded-2xl rounded-bl-sm shadow-sm px-4 py-3">
        <div className="flex gap-1 items-center">
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}