import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { DollarSign, Users, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';

export default function PayrollOverview() {
  const { data: establishments = [] } = useQuery({
    queryKey: ['establishment'],
    queryFn: () => base44.entities.Establishment.list()
  });

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list()
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  const managerEmails = establishments[0]?.managers?.map(m => m.email?.toLowerCase()) || [];
  const activeEmployees = employees.filter(emp => 
    emp.is_active && !managerEmails.includes(emp.email?.toLowerCase())
  );
  const totalGrossSalary = activeEmployees.reduce((sum, emp) => sum + (emp.gross_salary || 0), 0);
  const totalHourlyRate = activeEmployees.reduce((sum, emp) => sum + (emp.gross_hourly_rate || 0), 0);

  const stats = [
    {
      label: 'Employés actifs',
      value: activeEmployees.length,
      icon: Users,
      color: 'text-blue-600'
    },
    {
      label: 'Masse salariale mensuelle',
      value: `${totalGrossSalary.toFixed(2)}€`,
      icon: DollarSign,
      color: 'text-green-600'
    },
    {
      label: 'Taux horaire moyen',
      value: activeEmployees.length > 0 ? `${(totalHourlyRate / activeEmployees.length).toFixed(2)}€/h` : '0€',
      icon: TrendingUp,
      color: 'text-orange-600'
    }
  ];

  return (
    <div className="space-y-8">
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <Card key={idx} className="border border-gray-300 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{stat.value}</p>
                </div>
                <Icon className={`w-8 h-8 ${stat.color} opacity-30`} />
              </div>
            </Card>
          );
        })}
      </div>

      {activeEmployees.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Aucun employé"
          description="Aucun employé actif trouvé. Ajoutez des employés dans l'onglet Personnel."
        />
      ) : (
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Détail par employé</h2>
          <div className="bg-white border border-gray-300 rounded-lg overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-300">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900">Nom</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900">Poste</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900">Type contrat</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Salaire brut mensuel</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Taux horaire brut</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Heures mensuelles</th>
                </tr>
              </thead>
              <tbody>
                {activeEmployees.map((emp, idx) => (
                  <tr key={emp.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {emp.first_name} {emp.last_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{emp.position || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                        {emp.contract_type ? emp.contract_type.toUpperCase() : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                      {emp.gross_salary ? `${emp.gross_salary.toFixed(2)}€` : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">
                      {emp.gross_hourly_rate ? `${emp.gross_hourly_rate.toFixed(2)}€/h` : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">
                      {emp.contract_hours || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}