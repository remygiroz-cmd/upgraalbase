import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { User, Plus, Search, Mail, Phone, MapPin, Archive, Lock, MessageSquare, Wifi, WifiOff, Clock, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmployeeFormModal from './EmployeeFormModal';
import EmployeeDetailModal from './EmployeeDetailModal';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function EmployeeList() {
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [viewingEmployee, setViewingEmployee] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: establishments = [] } = useQuery({
    queryKey: ['establishment'],
    queryFn: () => base44.entities.Establishment.list()
  });

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list('last_name')
  });

  // Check if current user is a manager/admin
  const isManager = React.useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    
    const establishment = establishments[0];
    if (!establishment?.managers) return false;
    
    return establishment.managers.some(m => m.email?.toLowerCase() === currentUser.email?.toLowerCase());
  }, [currentUser, establishments]);

  const { data: allUsers = [] } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.asServiceRole.entities.User.list(),
    enabled: isManager,
    refetchInterval: 10000 // Refresh every 10 seconds
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
    if (!isManager && emp.email !== currentUser?.email) {
      toast.error('Vous pouvez uniquement modifier votre propre fiche');
      return;
    }
    setEditingEmployee(emp);
    setShowForm(true);
  };

  const handleView = (emp) => {
    if (!isManager && emp.email !== currentUser?.email) {
      toast.error('Vous pouvez uniquement consulter votre propre fiche');
      return;
    }
    setViewingEmployee(emp);
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
        {isManager && (
          <>
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
          </>
        )}
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
          {filteredEmployees.map(emp => {
            const userInfo = isManager ? allUsers.find(u => u.id === emp.user_id || u.email === emp.email) : null;
            return (
              <EmployeeCard
                key={emp.id}
                employee={emp}
                onClick={() => handleView(emp)}
                canView={isManager || emp.email === currentUser?.email}
                userInfo={userInfo}
                isManager={isManager}
              />
            );
          })}
        </div>
      )}

      {/* Form Modal */}
      <EmployeeFormModal
        open={showForm}
        onClose={handleCloseForm}
        employee={editingEmployee}
        isManager={isManager}
      />

      {/* Detail Modal */}
      <EmployeeDetailModal
        employee={viewingEmployee}
        open={!!viewingEmployee}
        onOpenChange={(open) => !open && setViewingEmployee(null)}
        onEdit={handleEdit}
        isManager={isManager}
      />
    </div>
  );
}

function EmployeeCard({ employee, onClick, canView = true, userInfo, isManager }) {
        const isCDD = employee.contract_type === 'cdd';
        const endDate = isCDD && employee.end_date ? new Date(employee.end_date) : null;
        const today = new Date();
        const isEndingSoon = endDate && (endDate.getTime() - today.getTime()) < (30 * 24 * 60 * 60 * 1000) && endDate > today;
        const isExpired = endDate && endDate < today;

        // Récupérer le solde de congés de la dernière fiche de paie
        const latestPayslip = employee.payslips?.length > 0 
          ? employee.payslips.sort((a, b) => (b.month || '').localeCompare(a.month || ''))[0]
          : null;
        const remainingLeave = latestPayslip?.total_leave;

        // Connection status logic (only for managers)
        const isOnline = isManager && userInfo?.is_online;
        const lastActiveAt = isManager && userInfo?.last_active_at ? new Date(userInfo.last_active_at) : null;
        const formatLastActive = (date) => {
          if (!date) return 'Jamais';
          const now = new Date();
          const diffMs = now - date;
          const diffMins = Math.floor(diffMs / 60000);
          const diffHours = Math.floor(diffMs / 3600000);
          const diffDays = Math.floor(diffMs / 86400000);
          
          if (diffMins < 1) return 'À l\'instant';
          if (diffMins < 60) return `Il y a ${diffMins} min`;
          if (diffHours < 24) return `Il y a ${diffHours}h`;
          if (diffDays < 7) return `Il y a ${diffDays}j`;
          return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
        };

        return (
          <button
            onClick={onClick}
            className={cn(
              "w-full p-4 rounded-xl border-2 text-left transition-all active:scale-[0.98] relative",
              canView 
                ? "bg-white border-gray-300 hover:border-orange-400 hover:shadow-lg" 
                : "bg-white border-gray-300 hover:border-gray-400 hover:shadow-md",
              isExpired && "border-red-400 bg-red-50",
              isEndingSoon && !isExpired && "border-amber-400 bg-amber-50"
            )}
          >
            {/* Badge CDD Alert */}
            {isCDD && endDate && (
              <div className={cn(
                "absolute -top-3 -right-3 px-3 py-1 rounded-full text-xs font-bold text-white shadow-md",
                isExpired ? "bg-red-600" : isEndingSoon ? "bg-amber-600" : "bg-blue-600"
              )}>
                {isExpired ? "EXPIRÉ" : isEndingSoon ? "⚠️ FIN PROCHE" : "CDD"}
              </div>
            )}

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
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900 truncate flex items-center gap-2">
                    {employee.first_name} {employee.last_name}
                    {!canView && <Lock className="w-3 h-3 text-gray-400" />}
                  </h3>
                  {isManager && (
                    <div className="flex items-center gap-1 ml-auto flex-shrink-0">
                      {isOnline ? (
                        <div className="flex items-center gap-1 text-green-600" title="En ligne">
                          <Wifi className="w-3 h-3" />
                          <span className="text-[10px] font-semibold">En ligne</span>
                        </div>
                      ) : lastActiveAt ? (
                        <div className="flex items-center gap-1 text-gray-500" title={`Dernière connexion: ${lastActiveAt.toLocaleString('fr-FR')}`}>
                          <Clock className="w-3 h-3" />
                          <span className="text-[10px]">{formatLastActive(lastActiveAt)}</span>
                        </div>
                      ) : userInfo ? (
                       <div className="flex items-center gap-1 text-gray-400" title="Jamais connecté">
                         <WifiOff className="w-3 h-3" />
                         <span className="text-[10px]">Jamais</span>
                       </div>
                      ) : null}
                    </div>
                  )}
                </div>
                {employee.nickname && (
                  <p className="text-xs text-gray-500 italic truncate">"{employee.nickname}"</p>
                )}
                {employee.position && (
                  <p className="text-xs text-orange-600 truncate">{employee.position}</p>
                )}
                {employee.team && (
                  <p className="text-xs text-gray-600 truncate">{employee.team}</p>
                )}
                {isCDD && endDate && (
                  <p className={cn(
                    "text-xs font-semibold mt-1",
                    isExpired ? "text-red-700" : isEndingSoon ? "text-amber-700" : "text-blue-700"
                  )}>
                    Fin contrat: {endDate.toLocaleDateString('fr-FR')}
                  </p>
                )}
              </div>
            </div>

      <div className="space-y-1.5 text-xs text-gray-600">
        {(canView || employee.show_phone_in_directory) && employee.phone && (
          <div className="flex items-center gap-2 truncate">
            <Phone className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{employee.phone}</span>
          </div>
        )}
        {canView && employee.email && (
          <div className="flex items-center gap-2 truncate">
            <Mail className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{employee.email}</span>
          </div>
        )}
        {canView && employee.address && (
          <div className="flex items-center gap-2 truncate">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{employee.address}</span>
          </div>
        )}
        {canView && remainingLeave != null && (
          <div className="flex items-center gap-2 truncate text-green-700 font-medium">
            <Calendar className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">Congés restants: {remainingLeave} jours</span>
          </div>
        )}
      </div>

      {/* Contact Actions */}
      {(employee.email || (employee.phone && employee.show_phone_in_directory)) && (
        <div className="grid grid-cols-2 gap-2 pt-3 mt-3 border-t border-gray-200">
          {employee.email && (
            <a
              href={`mailto:${employee.email}`}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white border-2 border-gray-300 hover:border-blue-500 hover:bg-blue-50 text-gray-700 hover:text-blue-700 rounded-lg text-xs font-medium transition-all active:scale-95"
              onClick={(e) => e.stopPropagation()}
            >
              <Mail className="w-4 h-4" />
              <span>Email</span>
            </a>
          )}
          {employee.phone && employee.show_phone_in_directory && (
            <>
              <a
                href={`tel:${employee.phone}`}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white border-2 border-gray-300 hover:border-green-500 hover:bg-green-50 text-gray-700 hover:text-green-700 rounded-lg text-xs font-medium transition-all active:scale-95"
                onClick={(e) => e.stopPropagation()}
              >
                <Phone className="w-4 h-4" />
                <span>Appel</span>
              </a>
              <a
                href={`sms:${employee.phone}`}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white border-2 border-gray-300 hover:border-purple-500 hover:bg-purple-50 text-gray-700 hover:text-purple-700 rounded-lg text-xs font-medium transition-all active:scale-95"
                onClick={(e) => e.stopPropagation()}
              >
                <MessageSquare className="w-4 h-4" />
                <span>SMS</span>
              </a>
              <a
                href={`https://wa.me/${employee.phone.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white border-2 border-gray-300 hover:border-emerald-500 hover:bg-emerald-50 text-gray-700 hover:text-emerald-700 rounded-lg text-xs font-medium transition-all active:scale-95"
                onClick={(e) => e.stopPropagation()}
              >
                <MessageSquare className="w-4 h-4" />
                <span>WhatsApp</span>
              </a>
            </>
          )}
        </div>
      )}
    </button>
  );
}