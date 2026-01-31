import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function PayrollDashboard() {
  const [selectedMonth, setSelectedMonth] = useState('');
  
  const { data: payslips = [], isLoading } = useQuery({
    queryKey: ['payslips'],
    queryFn: () => base44.entities.Payslip.filter({ status_extraction: 'extracted' })
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list()
  });

  // Obtenir les mois disponibles
  const availableMonths = useMemo(() => {
    const months = new Set(
      payslips
        .filter(p => p.extracted_data?.month)
        .map(p => p.extracted_data.month)
    );
    return Array.from(months).sort().reverse();
  }, [payslips]);

  // Initialiser le mois sélectionné
  const currentMonth = selectedMonth || (availableMonths[0] || '');

  // Filtrer et préparer les données pour le mois sélectionné
  const monthlyData = useMemo(() => {
    const data = payslips
      .filter(p => p.status_extraction === 'extracted' && p.extracted_data?.month === currentMonth)
      .map(p => ({
        id: p.id,
        employeeName: p.employee_name || p.extracted_data?.employee?.last_name || 'N/A',
        brut: p.extracted_data?.brut || 0,
        netAPayer: p.extracted_data?.net_a_payer || 0,
        chargesSalariales: p.extracted_data?.charges_salariales_total || 0,
        chargesPatronales: p.extracted_data?.charges_patronales_total || 0,
        chargesTotal: p.extracted_data?.charges_total || 0,
        coutRevient: p.extracted_data?.cout_de_revient || 0,
        cpN: p.extracted_data?.cp?.N || {},
        cpN_1: p.extracted_data?.cp?.N_1 || {}
      }));

    return data;
  }, [payslips, currentMonth]);

  // Calcul des totaux mensuels
  const monthlyTotals = useMemo(() => {
    if (monthlyData.length === 0) {
      return null;
    }

    return {
      brut: monthlyData.reduce((sum, d) => sum + d.brut, 0),
      netAPayer: monthlyData.reduce((sum, d) => sum + d.netAPayer, 0),
      chargesSalariales: monthlyData.reduce((sum, d) => sum + d.chargesSalariales, 0),
      chargesPatronales: monthlyData.reduce((sum, d) => sum + d.chargesPatronales, 0),
      chargesTotal: monthlyData.reduce((sum, d) => sum + d.chargesTotal, 0),
      coutRevient: monthlyData.reduce((sum, d) => sum + d.coutRevient, 0),
      effectif: monthlyData.length
    };
  }, [monthlyData]);

  // Données historiques mensuelles (évolution coût de revient)
  const historicalData = useMemo(() => {
    const monthMap = {};

    payslips.forEach(p => {
      if (p.status_extraction === 'extracted' && p.extracted_data?.month) {
        const m = p.extracted_data.month;
        if (!monthMap[m]) {
          monthMap[m] = { month: m, coutRevient: 0, effectif: 0 };
        }
        monthMap[m].coutRevient += p.extracted_data.cout_de_revient || 0;
        monthMap[m].effectif += 1;
      }
    });

    return Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));
  }, [payslips]);

  // Données répartition (Brut / Charges salariales / Charges patronales)
  const distributionData = useMemo(() => {
    if (!monthlyTotals) return [];
    
    return [
      { name: 'Salaires bruts', value: monthlyTotals.brut, color: '#f97316' },
      { name: 'Charges salariales', value: monthlyTotals.chargesSalariales, color: '#ef4444' },
      { name: 'Charges patronales', value: monthlyTotals.chargesPatronales, color: '#3b82f6' }
    ].filter(d => d.value > 0);
  }, [monthlyTotals]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (payslips.length === 0) {
    return (
      <EmptyState
        icon={DollarSign}
        title="Aucune donnée de paie"
        description="Importez et validez des fiches de paie pour accéder au tableau de bord"
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* FILTRE MOIS */}
      <div className="flex gap-3">
        <div className="min-w-[200px]">
          <label className="block text-sm font-medium text-gray-900 mb-2">Mois</label>
          <select
            value={currentMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            {availableMonths.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      {monthlyTotals && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Brut total', value: monthlyTotals.brut, color: 'orange' },
              { label: 'Net total', value: monthlyTotals.netAPayer, color: 'green' },
              { label: 'Charges totales', value: monthlyTotals.chargesTotal, color: 'red' },
              { label: 'Coût de revient', value: monthlyTotals.coutRevient, color: 'blue' }
            ].map((kpi, i) => (
              <Card key={i} className="border border-gray-300 p-4">
                <p className="text-xs font-semibold text-gray-600 uppercase">{kpi.label}</p>
                <p className={cn(
                  "text-2xl font-bold mt-2",
                  `text-${kpi.color}-600`
                )}>
                  {kpi.value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                </p>
                <p className="text-xs text-gray-600 mt-1">{monthlyTotals.effectif} salarié(s)</p>
              </Card>
            ))}
          </div>

          {/* GRAPHIQUES */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Répartition */}
            <Card className="border border-gray-300 p-6">
              <h3 className="font-bold text-gray-900 mb-4">Répartition des charges</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={distributionData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${(value / 1000).toFixed(1)}k€`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {distributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} />
                </PieChart>
              </ResponsiveContainer>
            </Card>

            {/* Évolution coût de revient */}
            <Card className="border border-gray-300 p-6">
              <h3 className="font-bold text-gray-900 mb-4">Évolution du coût de revient</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={historicalData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value) => value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="coutRevient"
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={{ fill: '#f97316', r: 5 }}
                    name="Coût de revient total"
                  />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* TABLEAU MENSUEL */}
          <Card className="border border-gray-300 p-6">
            <h3 className="font-bold text-gray-900 mb-4">Détail des salariés - {currentMonth}</h3>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100 border-b-2 border-gray-300">
                    <th className="px-4 py-3 text-left font-semibold text-gray-900">Employé</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-900">Brut</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-900">Net</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-900">Charges sal.</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-900">Charges patr.</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-900">Coût revient</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-900">CP N solde</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.map((row, i) => (
                    <tr key={row.id} className={cn(
                      "border-b border-gray-200",
                      i % 2 === 0 && "bg-white"
                    )}>
                      <td className="px-4 py-3 font-medium text-gray-900">{row.employeeName}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{row.brut.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{row.netAPayer.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{row.chargesSalariales.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{row.chargesPatronales.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</td>
                      <td className="px-4 py-3 text-right text-gray-900 font-semibold">{row.coutRevient.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{(row.cpN?.solde || 0).toFixed(1)}j</td>
                    </tr>
                  ))}
                  
                  {/* TOTAL */}
                  <tr className="bg-orange-50 border-t-2 border-b-2 border-gray-300 font-semibold">
                    <td className="px-4 py-3 text-gray-900">TOTAL</td>
                    <td className="px-4 py-3 text-right text-gray-900">{monthlyTotals.brut.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right text-gray-900">{monthlyTotals.netAPayer.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right text-gray-900">{monthlyTotals.chargesSalariales.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right text-gray-900">{monthlyTotals.chargesPatronales.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right text-gray-900">{monthlyTotals.coutRevient.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right" />
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}