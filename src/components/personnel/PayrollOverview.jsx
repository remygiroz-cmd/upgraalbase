import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { DollarSign, Users, TrendingUp, Calendar } from 'lucide-react';
import { Card } from '@/components/ui/card';

export default function PayrollOverview() {
  const [selectedMonth, setSelectedMonth] = useState('');

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
  const allEmployees = employees.filter(emp => !managerEmails.includes(emp.email?.toLowerCase()));

  // Agréger les données des fiches de paie par mois (incluant tous les employés, actifs et archivés)
  const payslipsByMonth = {};
  allEmployees.forEach(emp => {
    if (emp.payslips && emp.payslips.length > 0) {
      emp.payslips.forEach(payslip => {
        if (!payslip.month) return;
        
        if (!payslipsByMonth[payslip.month]) {
          payslipsByMonth[payslip.month] = {
            month: payslip.month,
            employees: [],
            totalGross: 0,
            totalNet: 0,
            totalEmployeeContributions: 0,
            totalEmployerContributions: 0,
            totalLeave: 0
          };
        }
        
        payslipsByMonth[payslip.month].employees.push({
          ...emp,
          payslip
        });
        payslipsByMonth[payslip.month].totalGross += payslip.gross_salary || 0;
        payslipsByMonth[payslip.month].totalNet += payslip.net_salary || 0;
        payslipsByMonth[payslip.month].totalEmployeeContributions += payslip.employee_contributions || 0;
        payslipsByMonth[payslip.month].totalEmployerContributions += payslip.employer_contributions || 0;
        payslipsByMonth[payslip.month].totalLeave += payslip.total_leave || 0;
      });
    }
  });

  const monthlyData = Object.values(payslipsByMonth).sort((a, b) => b.month.localeCompare(a.month));

  const formatMonth = (monthStr) => {
    if (!monthStr) return 'N/A';
    const [year, month] = monthStr.split('-');
    const monthNames = ['JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 
                        'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'];
    const monthIndex = parseInt(month, 10) - 1;
    return `${year}-${monthNames[monthIndex] || month}`;
  };

  const activeEmployees = allEmployees.filter(emp => emp.is_active);
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
      label: 'Fiches de paie enregistrées',
      value: monthlyData.length > 0 ? `${monthlyData.length} mois` : '0',
      icon: Calendar,
      color: 'text-purple-600'
    },
    {
      label: 'Masse salariale brute (dernier mois)',
      value: monthlyData.length > 0 ? `${monthlyData[0].totalGross.toFixed(2)}€` : '0€',
      icon: DollarSign,
      color: 'text-green-600'
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

      {monthlyData.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="Aucune fiche de paie"
          description="Aucune fiche de paie n'a été uploadée. Rendez-vous dans l'onglet Fiches de paie pour en ajouter."
        />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Récapitulatif mensuel</h2>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
            >
              <option value="">Tous les mois</option>
              {monthlyData.map(data => (
                <option key={data.month} value={data.month}>
                  {formatMonth(data.month)}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-white border border-gray-300 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-300">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900">Mois</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-900">Employés</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Salaire brut</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Net payé</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Cotis. salariales</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Charges patronales</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Coût de revient</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Total cotisations</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Congés totaux</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyData
                    .filter(data => !selectedMonth || data.month === selectedMonth)
                    .map((data, idx) => (
                    <tr 
                      key={data.month} 
                      onClick={() => setSelectedMonth(data.month)}
                      className={`cursor-pointer transition-colors ${
                        selectedMonth === data.month 
                          ? 'bg-orange-50 hover:bg-orange-100' 
                          : idx % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      <td className="px-4 py-3 text-sm font-bold text-gray-900">
                        {formatMonth(data.month)}
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-gray-700">
                        {data.employees.length}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-blue-900">
                        {data.totalGross.toFixed(2)}€
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-green-900">
                        {data.totalNet.toFixed(2)}€
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-orange-700">
                        {data.totalEmployeeContributions.toFixed(2)}€
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-purple-700">
                        {data.totalEmployerContributions.toFixed(2)}€
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-indigo-900">
                        {(data.totalGross + data.totalEmployerContributions).toFixed(2)}€
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-gray-900">
                        {(data.totalEmployeeContributions + data.totalEmployerContributions).toFixed(2)}€
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-green-700">
                        {data.totalLeave.toFixed(1)}j
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {selectedMonth && monthlyData.find(d => d.month === selectedMonth) && (
            <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">
                  Détail - {formatMonth(selectedMonth)}
                </h3>
                <button
                  onClick={() => setSelectedMonth('')}
                  className="text-sm text-gray-600 hover:text-gray-900 underline"
                >
                  Fermer
                </button>
              </div>
              <div className="bg-white border border-gray-300 rounded-lg overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-100 border-b border-gray-300">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900">Employé</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900">Poste</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Brut</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Net</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Cotis. sal.</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Ch. patron.</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Coût de revient</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Congés</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData
                      .find(d => d.month === selectedMonth)
                      .employees.map((emp, idx) => (
                      <tr key={emp.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {emp.first_name} {emp.last_name}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{emp.position || '-'}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900">
                          {emp.payslip.gross_salary ? `${emp.payslip.gross_salary.toFixed(2)}€` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900">
                          {emp.payslip.net_salary ? `${emp.payslip.net_salary.toFixed(2)}€` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-700">
                          {emp.payslip.employee_contributions ? `${emp.payslip.employee_contributions.toFixed(2)}€` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-700">
                          {emp.payslip.employer_contributions ? `${emp.payslip.employer_contributions.toFixed(2)}€` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-bold text-indigo-900">
                          {((emp.payslip.gross_salary || 0) + (emp.payslip.employer_contributions || 0)).toFixed(2)}€
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-700">
                          {emp.payslip.total_leave ? `${emp.payslip.total_leave.toFixed(1)}j` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}