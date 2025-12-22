import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Users, Plus, Search, Calendar, User, Phone, Mail, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/ui/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import EmployeeFormModal from '@/components/gestion/EmployeeFormModal';
import EmployeeDetailModal from '@/components/gestion/EmployeeDetailModal';
import ShiftManager from '@/components/gestion/ShiftManager';
import { cn } from '@/lib/utils';
import { format, addDays, startOfWeek, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

const CONTRACT_LABELS = {
  cdi: 'CDI',
  cdd: 'CDD',
  extra: 'Extra',
  apprenti: 'Apprenti',
  stage: 'Stage'
};

export default function Equipe() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('planning');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('active');
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [viewingEmployee, setViewingEmployee] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 });

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list('last_name')
  });

  const filteredEmployees = employees.filter(emp => {
    if (filterStatus === 'active' && !emp.is_active) return false;
    if (filterStatus === 'inactive' && emp.is_active) return false;
    if (searchQuery) {
      const fullName = `${emp.first_name} ${emp.last_name}`.toLowerCase();
      if (!fullName.includes(searchQuery.toLowerCase())) return false;
    }
    return true;
  });

  const handleEditEmployee = (emp) => {
    setEditingEmployee(emp);
    setShowEmployeeForm(true);
  };

  const handleCloseForm = () => {
    setShowEmployeeForm(false);
    setEditingEmployee(null);
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <PageHeader
        icon={Users}
        title="Équipe & Shifts"
        subtitle="Gestion du personnel et planning"
        actions={
          <Button
            onClick={() => setShowEmployeeForm(true)}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nouvel employé
          </Button>
        }
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList className="bg-slate-800 p-1">
          <TabsTrigger value="planning" className="data-[state=active]:bg-slate-700">
            <Calendar className="w-4 h-4 mr-2" />
            Planning
          </TabsTrigger>
          <TabsTrigger value="annuaire" className="data-[state=active]:bg-slate-700">
            <Users className="w-4 h-4 mr-2" />
            Annuaire
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === 'planning' ? (
        <div>
          {/* Week navigation */}
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="outline"
              onClick={() => setWeekOffset(prev => prev - 1)}
              className="border-slate-600"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="text-center">
              <p className="font-medium">
                Semaine du {format(weekStart, "d MMMM yyyy", { locale: fr })}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setWeekOffset(prev => prev + 1)}
              className="border-slate-600"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <ShiftManager 
            employees={filteredEmployees.filter(e => e.is_active)} 
            weekStart={weekStart}
          />
        </div>
      ) : (
        <div>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-6">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher..."
                className="pl-10 bg-slate-800 border-slate-700"
              />
            </div>
            
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-36 bg-slate-800 border-slate-600">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="active">Actifs</SelectItem>
                <SelectItem value="inactive">Inactifs</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Employee list */}
          {filteredEmployees.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Aucun employé"
              description={searchQuery ? "Aucun résultat" : "Ajoutez votre premier employé"}
              action={
                !searchQuery && (
                  <Button
                    onClick={() => setShowEmployeeForm(true)}
                    className="bg-emerald-600 hover:bg-emerald-700"
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
        </div>
      )}

      {/* Employee Form Modal */}
      <EmployeeFormModal
        open={showEmployeeForm}
        onClose={handleCloseForm}
        employee={editingEmployee}
      />

      {/* Employee Detail Modal */}
      {viewingEmployee && (
        <EmployeeDetailModal
          employee={viewingEmployee}
          onClose={() => setViewingEmployee(null)}
          onEdit={() => {
            setViewingEmployee(null);
            handleEditEmployee(viewingEmployee);
          }}
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
        "w-full p-4 rounded-2xl border text-left transition-all",
        "bg-slate-800/50 border-slate-700/50",
        "hover:bg-slate-800 hover:border-slate-600/50",
        !employee.is_active && "opacity-60"
      )}
    >
      <div className="flex items-center gap-4">
        {employee.photo_url ? (
          <img
            src={employee.photo_url}
            alt={`${employee.first_name} ${employee.last_name}`}
            className="w-14 h-14 rounded-full object-cover"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-slate-700 flex items-center justify-center">
            <User className="w-6 h-6 text-slate-400" />
          </div>
        )}
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium truncate">
              {employee.first_name} {employee.last_name}
            </h3>
            {!employee.is_active && (
              <Badge variant="outline" className="border-slate-600 text-slate-400">
                Inactif
              </Badge>
            )}
          </div>
          
          <p className="text-sm text-slate-400 truncate">{employee.position || 'Non défini'}</p>
          
          <div className="flex items-center gap-3 mt-2">
            {employee.contract_type && (
              <Badge variant="outline" className="border-indigo-600/50 text-indigo-400">
                {CONTRACT_LABELS[employee.contract_type] || employee.contract_type}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-700/50 flex gap-4 text-xs text-slate-500">
        {employee.phone && (
          <span className="flex items-center gap-1">
            <Phone className="w-3 h-3" />
            {employee.phone}
          </span>
        )}
        {employee.email && (
          <span className="flex items-center gap-1 truncate">
            <Mail className="w-3 h-3" />
            {employee.email}
          </span>
        )}
      </div>
    </button>
  );
}