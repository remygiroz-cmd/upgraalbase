import React from 'react';

export default function DateSeparator({ date }) {
  const now = new Date();
  const msgDate = new Date(date);
  
  const isToday = now.toDateString() === msgDate.toDateString();
  const isYesterday = new Date(now.setDate(now.getDate() - 1)).toDateString() === msgDate.toDateString();
  
  let label;
  if (isToday) {
    label = "Aujourd'hui";
  } else if (isYesterday) {
    label = "Hier";
  } else {
    label = msgDate.toLocaleDateString('fr-FR', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long' 
    });
  }
  
  return (
    <div className="flex items-center justify-center my-4">
      <div className="bg-gray-100 text-gray-600 text-xs font-medium px-3 py-1 rounded-full">
        {label}
      </div>
    </div>
  );
}