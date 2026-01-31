import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Upload, AlertCircle, CheckCircle2, Clock, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';

export default function PayslipExtraction() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState('');
  const fileInputRef = React.useRef(null);
  const queryClient = useQueryClient();

  const { data: employees = [], isLoading: loadingEmployees } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list()
  });

  const { data: payslips = [], isLoading: loadingPayslips, refetch: refetchPayslips } = useQuery({
    queryKey: ['payslips'],
    queryFn: () => base44.entities.Payslip.list()
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !selectedEmployee || !selectedMonth) {
        throw new Error('Sélectionnez un fichier, un employé et un mois');
      }

      const reader = new FileReader();
      return new Promise((resolve, reject) => {
        reader.onload = async () => {
          try {
            const base64 = reader.result.split(',')[1];
            const response = await base44.functions.invoke('uploadPayslip', {
              file_base64: base64,
              file_name: selectedFile.name,
              employee_id: selectedEmployee.id,
              month: selectedMonth
            });
            resolve(response.data);
          } catch (err) {
            reject(err);
          }
        };
        reader.readAsDataURL(selectedFile);
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['payslips'] });
      toast.success(`Fiche de paie uploadée pour ${data.employee_name}`);
      setSelectedFile(null);
      setSelectedEmployee(null);
      setSelectedMonth('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => refetchPayslips(), 2000);
    },
    onError: (err) => {
      toast.error(err.message);
    }
  });

  const getStatusIcon = (status) => {
    const icons = {
      pending: <Clock className="w-5 h-5 text-yellow-600" />,
      extracted: <CheckCircle2 className="w-5 h-5 text-green-600" />,
      needs_review: <AlertCircle className="w-5 h-5 text-orange-600" />,
      failed: <AlertCircle className="w-5 h-5 text-red-600" />
    };
    return icons[status] || icons.pending;
  };

  const getStatusLabel = (status) => {
    const labels = {
      pending: 'En cours',
      extracted: 'Validée',
      needs_review: 'À réviser',
      failed: 'Erreur'
    };
    return labels[status] || 'Inconnu';
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-yellow-50 border-yellow-200',
      extracted: 'bg-green-50 border-green-200',
      needs_review: 'bg-orange-50 border-orange-200',
      failed: 'bg-red-50 border-red-200'
    };
    return colors[status] || 'bg-gray-50 border-gray-200';
  };

  if (loadingEmployees || loadingPayslips) {
    return <LoadingSpinner />;
  }

  const activeEmployees = employees.filter(e => e.is_active);
  const groupedPayslips = {};
  
  payslips.forEach(p => {
    if (!groupedPayslips[p.employee_id]) {
      groupedPayslips[p.employee_id] = [];
    }
    groupedPayslips[p.employee_id].push(p);
  });

  const needsReview = payslips.filter(p => p.status_extraction === 'needs_review');

  return (
    <div className="space-y-8">
      {/* UPLOAD SECTION */}
      <Card className="border-2 border-gray-300 p-6">
        <h3 className="font-bold text-lg text-gray-900 mb-4">Importer une fiche de paie</h3>
        
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">Employé *</label>
              <select
                value={selectedEmployee?.id || ''}
                onChange={(e) => {
                  const emp = activeEmployees.find(e => e.id === event.target.value);
                  setSelectedEmployee(emp);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">Sélectionner...</option>
                {activeEmployees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">Mois *</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">Fichier PDF *</label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg px-3 py-2 text-center cursor-pointer hover:border-orange-500 transition-colors h-10 flex items-center justify-center"
              >
                <span className="text-xs sm:text-sm text-gray-700">
                  {selectedFile?.name || 'Cliquer...'}
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => uploadMutation.mutate()}
              disabled={uploadMutation.isPending || !selectedFile || !selectedEmployee || !selectedMonth}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <Upload className="w-4 h-4 mr-2" />
              {uploadMutation.isPending ? 'Chargement...' : 'Importer'}
            </Button>
          </div>
        </div>
      </Card>

      {/* NEEDS REVIEW SECTION */}
      {needsReview.length > 0 && (
        <Card className="border-2 border-orange-300 bg-orange-50 p-6">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-bold text-lg text-orange-900">{needsReview.length} fiche(s) à réviser</h3>
              <p className="text-sm text-orange-800 mt-1">L'extraction IA a détecté des anomalies. Validation humaine requise.</p>
            </div>
          </div>

          <div className="space-y-2">
            {needsReview.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-orange-200">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{p.employee_name}</p>
                  <p className="text-sm text-gray-600">{p.month}</p>
                  {p.extracted_data?.quality_issues && p.extracted_data.quality_issues.length > 0 && (
                    <ul className="text-xs text-orange-700 mt-1 space-y-1">
                      {p.extracted_data.quality_issues.map((issue, i) => (
                        <li key={i}>• {issue}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <Button
                  onClick={() => window.location.href = `#payslip-${p.id}`}
                  variant="outline"
                  size="sm"
                  className="border-orange-300"
                >
                  Réviser
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* PAYSLIPS BY EMPLOYEE */}
      {Object.keys(groupedPayslips).length === 0 ? (
        <EmptyState
          icon={Upload}
          title="Aucune fiche de paie"
          description="Importez des fiches de paie pour commencer l'analyse"
        />
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedPayslips).map(([empId, payslipsList]) => {
            const emp = employees.find(e => e.id === empId);
            return (
              <Card key={empId} className="border border-gray-300 p-6">
                <h4 className="font-bold text-gray-900 mb-4">
                  {emp?.first_name} {emp?.last_name}
                </h4>

                <div className="space-y-2">
                  {payslipsList
                    .sort((a, b) => (b.month || '').localeCompare(a.month || ''))
                    .map(p => (
                      <div
                        key={p.id}
                        className={cn(
                          'flex items-center justify-between p-4 rounded-lg border-2',
                          getStatusColor(p.status_extraction)
                        )}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          {getStatusIcon(p.status_extraction)}
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">{p.month}</p>
                            <p className="text-xs text-gray-600">
                              {getStatusLabel(p.status_extraction)}
                              {p.confidence_score && ` • Confiance: ${p.confidence_score}%`}
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <a
                            href={p.pdf_url}
                            download
                            className="px-3 py-2 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
                          >
                            Voir PDF
                          </a>
                          {p.status_extraction === 'needs_review' && (
                            <Button
                              onClick={() => window.location.href = `#payslip-${p.id}`}
                              size="sm"
                              className="bg-orange-600 hover:bg-orange-700"
                            >
                              Valider
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}