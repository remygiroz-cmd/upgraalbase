import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Upload, Download, Trash2, Search, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export default function PayslipsManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadingEmployee, setUploadingEmployee] = useState(null);
  const queryClient = useQueryClient();

  const { data: employees = [], isLoading: loadingEmployees } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list()
  });

  const { data: establishments = [] } = useQuery({
    queryKey: ['establishment'],
    queryFn: () => base44.entities.Establishment.list()
  });

  const deletePayslipMutation = useMutation({
    mutationFn: async ({ employeeId, payslipIndex }) => {
      const emp = employees.find(e => e.id === employeeId);
      if (!emp) throw new Error('Employé non trouvé');
      
      const updatedPayslips = emp.payslips?.filter((_, idx) => idx !== payslipIndex) || [];
      await base44.entities.Employee.update(employeeId, { payslips: updatedPayslips });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Fiche de paie supprimée');
    }
  });

  const uploadPayslipMutation = useMutation({
    mutationFn: async ({ employeeId, file, month }) => {
      const emp = employees.find(e => e.id === employeeId);
      if (!emp) throw new Error('Employé non trouvé');

      const uploadedFile = await base44.integrations.Core.UploadFile({ file });
      
      const newPayslip = {
        month,
        file_url: uploadedFile.file_url,
        uploaded_at: new Date().toISOString(),
        uploaded_by: (await base44.auth.me()).email
      };

      const updatedPayslips = [...(emp.payslips || []), newPayslip];
      await base44.entities.Employee.update(employeeId, { payslips: updatedPayslips });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setShowUploadModal(false);
      setUploadingEmployee(null);
      toast.success('Fiche de paie ajoutée');
    }
  });

  const managerEmails = establishments[0]?.managers?.map(m => m.email?.toLowerCase()) || [];
  const activeEmployees = employees.filter(emp => 
    emp.is_active && !managerEmails.includes(emp.email?.toLowerCase())
  );

  const filteredEmployees = activeEmployees.filter(emp => {
    const fullName = `${emp.first_name} ${emp.last_name}`.toLowerCase();
    const matchesSearch = fullName.includes(searchTerm.toLowerCase()) || 
                         emp.email?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const allPayslips = filteredEmployees.flatMap(emp => 
    (emp.payslips || []).map(payslip => ({
      ...payslip,
      employeeId: emp.id,
      employeeName: `${emp.first_name} ${emp.last_name}`,
      employeeEmail: emp.email
    }))
  ).filter(p => !selectedMonth || p.month === selectedMonth)
   .sort((a, b) => (b.month || '').localeCompare(a.month || ''));

  if (loadingEmployees) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[250px]">
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Rechercher un employé..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-white border-gray-300"
              />
            </div>
          </div>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          {(searchTerm || selectedMonth) && (
            <Button
              onClick={() => {
                setSearchTerm('');
                setSelectedMonth('');
              }}
              variant="outline"
              className="border-gray-300"
            >
              Réinitialiser
            </Button>
          )}
        </div>
      </div>

      {allPayslips.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="Aucune fiche de paie"
          description={filteredEmployees.length === 0 
            ? "Aucun employé ne correspond à votre recherche"
            : "Aucune fiche de paie uploadée. Commencez par ajouter des fiches de paie."
          }
        />
      ) : (
        <div className="space-y-4">
          {filteredEmployees.map(emp => {
            const employeePayslips = (emp.payslips || [])
              .filter(p => !selectedMonth || p.month === selectedMonth)
              .sort((a, b) => (b.month || '').localeCompare(a.month || ''));

            if (employeePayslips.length === 0) return null;

            return (
              <Card key={emp.id} className="border border-gray-300 p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-gray-900">{emp.first_name} {emp.last_name}</h3>
                    <p className="text-sm text-gray-600">{emp.email}</p>
                    {emp.position && <p className="text-sm text-gray-600">{emp.position}</p>}
                  </div>
                  <Button
                    onClick={() => setUploadingEmployee(emp)}
                    className="bg-orange-600 hover:bg-orange-700"
                    size="sm"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Ajouter
                  </Button>
                </div>

                <div className="space-y-2">
                  {employeePayslips.map((payslip, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-200">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{payslip.month || 'N/A'}</p>
                        <p className="text-xs text-gray-500">
                          Ajouté le {new Date(payslip.uploaded_at).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <a
                          href={payslip.file_url}
                          download
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Télécharger"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => {
                            if (confirm('Êtes-vous sûr de vouloir supprimer cette fiche de paie ?')) {
                              deletePayslipMutation.mutate({ 
                                employeeId: emp.id, 
                                payslipIndex: (emp.payslips || []).indexOf(payslip)
                              });
                            }
                          }}
                          className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <PayslipUploadModal
        open={!!uploadingEmployee}
        employee={uploadingEmployee}
        onClose={() => setUploadingEmployee(null)}
        onUpload={(file, month) => {
          uploadPayslipMutation.mutate({
            employeeId: uploadingEmployee.id,
            file,
            month
          });
        }}
        isLoading={uploadPayslipMutation.isPending}
      />
    </div>
  );
}

function PayslipUploadModal({ open, employee, onClose, onUpload, isLoading }) {
  const [file, setFile] = useState(null);
  const [month, setMonth] = useState('');
  const fileInputRef = React.useRef(null);

  const handleSubmit = async () => {
    if (!file) {
      toast.error('Veuillez sélectionner un fichier');
      return;
    }
    if (!month) {
      toast.error('Veuillez sélectionner un mois');
      return;
    }

    onUpload(file, month);
    setFile(null);
    setMonth('');
  };

  React.useEffect(() => {
    if (!open) {
      setFile(null);
      setMonth('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white border-gray-300 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-gray-900">
            Ajouter une fiche de paie - {employee?.first_name} {employee?.last_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-gray-900 mb-2 block">Mois *</Label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <Label className="text-gray-900 mb-2 block">Fichier (PDF, PNG, JPG) *</Label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-orange-500 hover:bg-orange-50 transition-colors"
            >
              <Upload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-900">
                {file ? file.name : 'Cliquez pour sélectionner un fichier'}
              </p>
              <p className="text-xs text-gray-500 mt-1">PDF, PNG ou JPG acceptés</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="hidden"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1 border-gray-300"
              disabled={isLoading}
            >
              Annuler
            </Button>
            <Button
              onClick={handleSubmit}
              className="flex-1 bg-orange-600 hover:bg-orange-700"
              disabled={isLoading || !file || !month}
            >
              {isLoading ? 'Chargement...' : 'Ajouter'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}