import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { User } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function UserAvatar({ userEmail, userName, size = 'sm', showName = true, className }) {
  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list(),
    staleTime: 5 * 60 * 1000,
  });

  const employee = employees.find(emp => emp.email === userEmail);

  const sizeClasses = {
    xs: 'w-5 h-5',
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16'
  };

  const iconSizes = {
    xs: 'w-3 h-3',
    sm: 'w-3 h-3',
    md: 'w-5 h-5',
    lg: 'w-8 h-8'
  };

  const displayName = employee 
    ? (employee.nickname || `${employee.first_name} ${employee.last_name}`)
    : userName || userEmail;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn("rounded-full overflow-hidden bg-gray-200 flex-shrink-0", sizeClasses[size])}>
        {employee?.photo_url ? (
          <img 
            src={employee.photo_url} 
            alt={displayName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <User className={cn("text-gray-400", iconSizes[size])} />
          </div>
        )}
      </div>
      {showName && (
        <span className="text-sm">{displayName}</span>
      )}
    </div>
  );
}