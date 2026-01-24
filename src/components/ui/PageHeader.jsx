import React from 'react';
import { cn } from '@/lib/utils';

export default function PageHeader({ 
  title, 
  subtitle, 
  icon: Icon, 
  actions, 
  className 
}) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6", className)}>
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-orange-600/20 text-orange-400 flex items-center justify-center flex-shrink-0">
            <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">{title}</h1>
          {subtitle && <p className="text-gray-600 text-xs sm:text-sm truncate">{subtitle}</p>}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap">
          {actions}
        </div>
      )}
    </div>
  );
}