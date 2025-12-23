import React from 'react';
import { cn } from '@/lib/utils';

export default function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  action,
  className 
}) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center py-16 px-4 text-center",
      className
    )}>
      {Icon && (
        <div className="w-16 h-16 rounded-2xl bg-[rgb(var(--bg-tertiary))] flex items-center justify-center mb-4">
          <Icon className="w-8 h-8 text-[rgb(var(--text-tertiary))]" />
        </div>
      )}
      <h3 className="text-lg font-semibold mb-2 text-[rgb(var(--text-primary))]">{title}</h3>
      {description && (
        <p className="text-[rgb(var(--text-secondary))] text-sm max-w-md mb-6">{description}</p>
      )}
      {action}
    </div>
  );
}