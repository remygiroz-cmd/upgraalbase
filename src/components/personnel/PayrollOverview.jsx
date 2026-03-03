import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { DollarSign, Users, TrendingUp, Calendar, TrendingDown, Award } from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';

const MONTH_NAMES = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin',
  'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
const MONTH_NAMES_FULL = ['JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN',
  'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'];

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

const fmt = (v) => `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€`;
const fmtShort = (v) => `${Math.round(v / 1000 * 10) / 10}k€`;

function formatMonthLabel(monthStr) {
  if (!monthStr) return 'N/A';
  const [year, month] = monthStr.split('-');
  const idx = parseInt(month, 10) - 1;
  return `${year}-${MONTH_NAMES_FULL[idx] || month}`;
}

function formatMonthShort(monthStr) {
  const [, month] = monthStr.split('-');
  return MONTH_NAMES[parseInt(month, 10) - 1] || month;
}

export default function PayrollOverview() {
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');

  const { data: establishments = [] } = useQuery({
    queryKey: ['establishment'],
    queryFn: () => base44.entities.Establishment.list()
  });

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list()
  });

  if (isLoading) return <LoadingSpinner />;

  const managerEmails = establishments[0]?.managers?.map(m => m.email?.toLowerCase()) || [];
  const allEmployees = employees.filter(emp => !managerEmails.includes(emp.email?.toLowerCase()));

  // Build monthly aggregations
  const payslipsByMonth = {};
  allEmployees.forEach(emp => {
    (emp.payslips || []).forEach(payslip => {
      if (!payslip.month) return;
      if (!payslipsByMonth[payslip.month]) {
        payslipsByMonth[payslip.month] = {
          month: payslip.month,
          employees: [],
          totalGross: 0,
          totalNet: 0,
          totalEmployeeContributions: 0,
          totalEmployerContributions: 0,
          totalLeave: 0,
          totalAdvancePayment: 0
        };
      }
      const d = payslipsByMonth[payslip.month];
      d.employees.push({ ...emp, payslip });
      d.totalGross += payslip.gross_salary || 0;
      d.totalNet += payslip.net_salary || 0;
      d.totalEmployeeContributions += payslip.employee_contributions || 0;
      d.totalEmployerContributions += payslip.employer_contributions || 0;
      d.totalLeave += payslip.total_leave || 0;
      d.totalAdvancePayment += payslip.advance_payment || 0;
    });
  });

  const allMonthlyData = Object.values(payslipsByMonth).sort((a, b) => b.month.localeCompare(a.month));

  // Available years
  const availableYears = [...new Set(allMonthlyData.map(d => d.month.split('-')[0]))].sort((a, b) => b - a);

  // Filter by year
  const monthlyData = selectedYear
    ? allMonthlyData.filter(d => d.month.startsWith(selectedYear))
    : allMonthlyData;

  const activeEmployees = allEmployees.filter(emp => emp.is_active);
  const lastMonth = allMonthlyData[0];

  // Annual totals for selected year (or overall if no year selected)
  const annualData = monthlyData;
  const annualGross = annualData.reduce((s, d) => s + d.totalGross, 0);
  const annualNet = annualData.reduce((s, d) => s + d.totalNet, 0);
  const annualCost = annualData.reduce((s, d) => s + d.totalGross + d.totalEmployerContributions, 0);
  const annualEmployerContrib = annualData.reduce((s, d) => s + d.totalEmployerContributions, 0);

  // Chart data (chronological order for charts)
  const chartData = [...monthlyData].reverse().map(d => ({
    name: formatMonthShort(d.month),
    Brut: Math.round(d.totalGross),
    Net: Math.round(d.totalNet),
    'Coût total': Math.round(d.totalGross + d.totalEmployerContributions),
    Charges: Math.round(d.totalEmployeeContributions + d.totalEmployerContributions),
  }));

  // Pie data for last visible month
  const pieSource = selectedMonth
    ? monthlyData.find(d => d.month === selectedMonth)
    : monthlyData[0];
  const pieData = pieSource ? [
    { name: 'Net payé', value: Math.round(pieSource.totalNet) },
    { name: 'Cotis. salariales', value: Math.round(pieSource.totalEmployeeContributions) },
    { name: 'Charges patronales', value: Math.round(pieSource.totalEmployerContributions) },
    { name: 'Acomptes', value: Math.round(pieSource.totalAdvancePayment) },
  ].filter(p => p.value > 0) : [];

  const stats = [
    {
      label: 'Employés actifs',
      value: activeEmployees.length,
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-50'
    },
    {
      label: selectedYear ? `Masse brute ${selectedYear}` : 'Masse brute (dernier mois)',
      value: selectedYear ? fmt(annualGross) : (lastMonth ? fmt(lastMonth.totalGross) : '0€'),
      icon: DollarSign,
      color: 'text-green-600',
      bg: 'bg-green-50'
    },
    {
      label: selectedYear ? `Coût total employeur ${selectedYear}` : 'Coût total (dernier mois)',
      value: selectedYear ? fmt(annualCost) : (lastMonth ? fmt(lastMonth.totalGross + lastMonth.totalEmployerContributions) : '0€'),
      icon: TrendingUp,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50'
    },
    {
      label: selectedYear ? `Mois de données ${selectedYear}` : 'Mois enregistrés',
      value: `${monthlyData.length} mois`,
      icon: Calendar,
      color: 'text-purple-600',
      bg: 'bg-purple-50'
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <Card key={idx} className={`border border-gray-200 p-4 ${stat.bg}`}>
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-gray-600 text-xs font-medium truncate">{stat.label}</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">{stat.value}</p>
                </div>
                <Icon className={`w-8 h-8 ${stat.color} opacity-30 flex-shrink-0`} />
              </div>
            </Card>
          );
        })}
      </div>

      {allMonthlyData.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="Aucune fiche de paie"
          description="Aucune fiche de paie n'a été uploadée. Rendez-vous dans l'onglet Fiches de paie pour en ajouter."
        />
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Année :</span>
              <select
                value={selectedYear}
                onChange={(e) => { setSelectedYear(e.target.value); setSelectedMonth(''); }}
                className="px-3 py-1.5 border border-gray-300 rounded-lg bg-white text-sm text-gray-900 focus:ring-2 focus:ring-orange-300"
              >
                <option value="">Toutes</option>
                {availableYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Mois :</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg bg-white text-sm text-gray-900 focus:ring-2 focus:ring-orange-300"
              >
                <option value="">Tous</option>
                {monthlyData.map(d => (
                  <option key={d.month} value={d.month}>{formatMonthLabel(d.month)}</option>
                ))}
              </select>
            </div>
            {(selectedYear || selectedMonth) && (
              <button
                onClick={() => { setSelectedYear(''); setSelectedMonth(''); }}
                className="text-xs text-orange-600 hover:text-orange-800 underline"
              >
                Réinitialiser filtres
              </button>
            )}
          </div>

          {/* Charts */}
          {chartData.length > 1 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Bar chart — évolution mensuelle */}
              <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Évolution mensuelle de la masse salariale</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => fmt(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Brut" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Net" fill="#10b981" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Coût total" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Pie chart — répartition du dernier mois affiché */}
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-1">
                  Répartition brute
                </h3>
                <p className="text-xs text-gray-400 mb-3">
                  {pieSource ? formatMonthLabel(pieSource.month) : ''}
                </p>
                {pieData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={65} label={false}>
                          {pieData.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => fmt(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1 mt-2">
                      {pieData.map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <span className="text-gray-600">{item.name}</span>
                          </div>
                          <span className="font-semibold text-gray-800">{fmt(item.value)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-gray-400 text-center py-8">Pas de données</p>
                )}
              </div>
            </div>
          )}

          {/* Charges line chart */}
          {chartData.length > 1 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Évolution des charges sociales totales</h3>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => fmt(v)} />
                  <Line type="monotone" dataKey="Charges" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Annual summary if year selected */}
          {selectedYear && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: `Masse brute ${selectedYear}`, value: fmt(annualGross), color: 'border-blue-300 bg-blue-50', textColor: 'text-blue-800' },
                { label: `Net versé ${selectedYear}`, value: fmt(annualNet), color: 'border-green-300 bg-green-50', textColor: 'text-green-800' },
                { label: `Charges patronales ${selectedYear}`, value: fmt(annualEmployerContrib), color: 'border-purple-300 bg-purple-50', textColor: 'text-purple-800' },
                { label: `Coût employeur ${selectedYear}`, value: fmt(annualCost), color: 'border-amber-300 bg-amber-50', textColor: 'text-amber-800' },
              ].map((item, i) => (
                <div key={i} className={`rounded-xl border-2 p-3 ${item.color}`}>
                  <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                  <p className={`text-lg font-bold ${item.textColor}`}>{item.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Monthly table */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Récapitulatif mensuel</h2>
            <div className="bg-white border border-gray-300 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-100 border-b border-gray-300">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900">Mois</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-900">Employés</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Salaire brut</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Net payé</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Acomptes</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Net + Acomptes</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Cotis. salariales</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Charges patronales</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Coût de revient</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Total cotisations</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Congés totaux</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedMonth ? monthlyData.filter(d => d.month === selectedMonth) : monthlyData).map((data, idx) => (
                      <tr
                        key={data.month}
                        onClick={() => setSelectedMonth(selectedMonth === data.month ? '' : data.month)}
                        className={`cursor-pointer transition-colors ${
                          selectedMonth === data.month
                            ? 'bg-orange-50 hover:bg-orange-100'
                            : idx % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 hover:bg-gray-100'
                        }`}
                      >
                        <td className="px-4 py-3 text-sm font-bold text-gray-900">{formatMonthLabel(data.month)}</td>
                        <td className="px-4 py-3 text-sm text-center text-gray-700">{data.employees.length}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-blue-900">{data.totalGross.toFixed(2)}€</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-green-900">{data.totalNet.toFixed(2)}€</td>
                        <td className="px-4 py-3 text-sm text-right text-purple-700">
                          {data.totalAdvancePayment > 0 ? `${data.totalAdvancePayment.toFixed(2)}€` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-bold text-green-900">
                          {(data.totalNet + data.totalAdvancePayment).toFixed(2)}€
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-orange-700">{data.totalEmployeeContributions.toFixed(2)}€</td>
                        <td className="px-4 py-3 text-sm text-right text-purple-700">{data.totalEmployerContributions.toFixed(2)}€</td>
                        <td className="px-4 py-3 text-sm text-right font-bold text-indigo-900">
                          {(data.totalGross + data.totalEmployerContributions).toFixed(2)}€
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-bold text-gray-900">
                          {(data.totalEmployeeContributions + data.totalEmployerContributions).toFixed(2)}€
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-green-700">{data.totalLeave.toFixed(1)}j</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Detail for selected month */}
          {selectedMonth && monthlyData.find(d => d.month === selectedMonth) && (
            <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">Détail — {formatMonthLabel(selectedMonth)}</h3>
                <button onClick={() => setSelectedMonth('')} className="text-sm text-gray-600 hover:text-gray-900 underline">
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
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Acompte</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Cotis. sal.</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Ch. patron.</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Coût de revient</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Congés</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.find(d => d.month === selectedMonth).employees.map((emp, idx) => (
                      <tr key={emp.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{emp.first_name} {emp.last_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{emp.position || '-'}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900">
                          {emp.payslip.gross_salary ? `${emp.payslip.gross_salary.toFixed(2)}€` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900">
                          {emp.payslip.net_salary ? `${emp.payslip.net_salary.toFixed(2)}€` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-purple-700">
                          {emp.payslip.advance_payment > 0 ? `${emp.payslip.advance_payment.toFixed(2)}€` : '-'}
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
        </>
      )}
    </div>
  );
}