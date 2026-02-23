import React, { useState } from 'react';
import { cn } from '@/lib/utils';

const EmployeeHeaderCell = React.memo(({
  employee,
  team,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  displayMode,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const fullName = `${employee.first_name} ${employee.last_name}`;
  const isNameTruncated = fullName.length > 20;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', employee.id);
        onDragStart?.(employee.id);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOver?.(employee.id);
      }}
      onDrop={(e) => {
        e.preventDefault();
        const sourceId = e.dataTransfer.getData('text/plain');
        onDrop?.(sourceId, employee.id);
      }}
      onDragEnd={() => onDragEnd?.()}
      className={cn(
        "border-r border-gray-200 px-2 text-center min-w-[150px] w-[150px] lg:min-w-[180px] lg:w-[180px] relative group flex-shrink-0 select-none cursor-grab active:cursor-grabbing transition-all duration-100",
        displayMode === 'compact' ? 'py-1' : 'py-3',
        isDragging && "opacity-30 bg-orange-50",
        isDragOver && !isDragging && "bg-orange-100 border-l-4 border-l-orange-500 scale-[1.02]"
      )}
    >
      {/* Grip icon */}
      <div className="pointer-events-none hidden group-hover:flex absolute top-1 left-1 text-gray-400">
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
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