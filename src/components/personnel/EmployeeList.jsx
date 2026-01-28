import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { User, Plus, Search, Mail, Phone, MapPin, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmployeeFormModal from './EmployeeFormModal';
import EmployeeDetailModal from './EmployeeDetailModal';
import { cn } from '@/lib/utils';

export default function EmployeeList() {
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [viewingEmployee, setViewingEmployee] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list('last_name')
  });

  const filteredEmployees = employees.filter(emp => {
    // Filter by active/archived status
    if (showArchived && emp.is_active) return false;
    if (!showArchived && !emp.is_active) return false;
    
    // Filter by search query
    if (!searchQuery) return true;
    const fullName = `${emp.first_name} ${emp.last_name}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase()) || 
           emp.email?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleEdit = (emp) => {
    setEditingEmployee(emp);
    setShowForm(true);
    setViewingEmployee(null);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingEmployee(null);
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      {/* Search and Add */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher un employé..."
            className="pl-10 bg-white border-gray-300 text-gray-900 min-h-[44px]"
          />
        </div>
        <Button
          variant={showArchived ? "outline" : "default"}
          onClick={() => setShowArchived(!showArchived)}
          className={cn(
            "min-h-[44px]",
            !showArchived && "border-gray-400 text-gray-700 hover:bg-gray-100"
          )}
        >
          <Archive className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">{showArchived ? 'Actifs' : 'Archives'}</span>
        </Button>
        <Button
          onClick={() => setShowForm(true)}
          className="bg-orange-600 hover:bg-orange-700 min-h-[44px]"
        >
          <Plus className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Ajouter</span>
        </Button>
      </div>

      {/* Employee list */}
      {filteredEmployees.length === 0 ? (
        <EmptyState
          icon={showArchived ? Archive : User}
          title={showArchived ? "Aucun employé archivé" : "Aucun employé"}
          description={
            searchQuery 
              ? "Aucun résultat trouvé" 
              : showArchived 
                ? "Aucun employé archivé pour le moment"
                : "Commencez par ajouter votre premier employé"
          }
          action={
            !searchQuery && !showArchived && (
              <Button
                onClick={() => setShowForm(true)}
                className="bg-orange-600 hover:bg-orange-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Ajouter un employé
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEmployees.map(emp => (
            <EmployeeCard
              key={emp.id}
              employee={emp}
              onClick={() => setViewingEmployee(emp)}
            />
          ))}
        </div>
      )}

      {/* Form Modal */}
      <EmployeeFormModal
        open={showForm}
        onClose={handleCloseForm}
        employee={editingEmployee}
      />

      {/* Detail Modal */}
      {viewingEmployee && (
        <EmployeeDetailModal
          employee={viewingEmployee}
          onClose={() => setViewingEmployee(null)}
          onEdit={() => handleEdit(viewingEmployee)}
        />
      )}
    </div>
  );
}

function EmployeeCard({ employee, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full p-4 rounded-xl border-2 text-left transition-all hover:shadow-lg active:scale-[0.98]",
        "bg-white border-gray-300 hover:border-orange-400"
      )}
    >
      <div className="flex items-center gap-3 mb-3">
        {employee.photo_url ? (
          <img
            src={employee.photo_url}
            alt={`${employee.first_name} ${employee.last_name}`}
            className="w-12 h-12 rounded-full object-cover"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
            <User className="w-6 h-6 text-orange-600" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">
            {employee.first_name} {employee.last_name}
          </h3>
          {employee.position && (
            <p className="text-xs text-gray-600 truncate">{employee.position}</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5 text-xs text-gray-600">
        {employee.email && (
          <div className="flex items-center gap-2 truncate">
            <Mail className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{employee.email}</span>
          </div>
        )}
        {employee.phone && (
          <div className="flex items-center gap-2 truncate">
            <Phone className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{employee.phone}</span>
          </div>
        )}
        {employee.address && (
          <div className="flex items-center gap-2 truncate">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{employee.address}</span>
          </div>
        )}
      </div>
    </button>
  );
}