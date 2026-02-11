import React, { useState } from 'react';
import { cn } from '@/lib/utils';

const EmployeeHeaderCell = React.memo(React.forwardRef(({
  employee,
  team,
  isDragging,
  dragHandleProps,
  displayMode,
  style,
  ...props
}, ref) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const fullName = `${employee.first_name} ${employee.last_name}`;
  
  const isNameTruncated = fullName.length > 20;

  return (
    <div
      ref={ref}
      {...props}
      style={style}
      className={cn(
        "border-r border-gray-200 px-2 py-2 text-center min-w-[150px] w-[150px] lg:min-w-[180px] lg:w-[180px] relative group flex-shrink-0",
        displayMode === 'compact' ? 'py-1' : 'py-3',
        isDragging && "bg-orange-100 shadow-2xl opacity-90"
      )}
    >
      {/* Drag handle - only on hover */}
      <div
        {...dragHandleProps}
        className="hidden group-hover:block absolute left-1 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing text-gray-400 hover:text-orange-600 transition-colors"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M8 5a2 2 0 11-4 0 2 2 0 014 0zM12 5a2 2 0 11-4 0 2 2 0 014 0zM8 13a2 2 0 11-4 0 2 2 0 014 0zM12 13a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      </div>



      {/* Employee name */}
      <div
        className={cn(
          "font-bold text-gray-900 truncate px-1 relative",
          displayMode === 'compact' ? 'text-xs' : 'text-sm'
        )}
        onMouseEnter={() => isNameTruncated && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {fullName}
        
        {/* Tooltip */}
        {showTooltip && isNameTruncated && (
          <div className="absolute left-0 top-full mt-1 z-50 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap shadow-lg">
            {fullName}
          </div>
        )}
      </div>

      {/* Team badge */}
      {team && (
        <div
          className={cn(
            "font-semibold text-white inline-block rounded-full mt-1 shadow-sm",
            displayMode === 'compact' ? 'text-[8px] px-1 py-0 py-0.5' : 'text-[9px] px-2 py-0.5'
          )}
          style={{ backgroundColor: team.color || '#3b82f6' }}
          title={team.name}
        >
          {team.name.substring(0, 3).toUpperCase()}
        </div>
      )}
    </div>
  );
}));

EmployeeHeaderCell.displayName = 'EmployeeHeaderCell';

export default EmployeeHeaderCell;