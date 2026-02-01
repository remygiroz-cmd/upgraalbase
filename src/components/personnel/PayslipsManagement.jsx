import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Upload, Download, Trash2, Search, Calendar, FileText, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';

export default function PayslipsManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [uploadQueue, setUploadQueue] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [selectedPayslips, setSelectedPayslips] = useState(new Set());
  const [viewingPayslip, setViewingPayslip] = useState(null);
  const queryClient = useQueryClient();

  const { data: employees = [], isLoading: loadingEmployees } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list()
  });

  const { data: establishments = [] } = useQuery({
    queryKey: ['establishment'],
    queryFn: () => base44.entities.Establishment.list()
  });

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setProcessing(true);
    const newQueue = [];

    for (const file of files) {
      try {
        // Upload file
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        
        // Use AI to extract employee info
        const aiResponse = await base44.integrations.Core.InvokeLLM({
          prompt: `Tu es un expert en analyse de bulletins de paie français. Examine attentivement ce bulletin de salaire et extrait les informations EXACTES suivantes:

**IDENTITÉ DU SALARIÉ:**
- Prénom (first_name): cherche dans l'en-tête, section "Salarié" ou "Employé"
- Nom (last_name): cherche dans l'en-tête, section "Salarié" ou "Employé"
- Période (month): format YYYY-MM (exemple: "2025-05" pour mai 2025)

**SALAIRE BRUT (gross_salary):**
- Cherche dans le tableau des rémunérations la ligne qui contient "Salaire brut" ou "Brut"
- C'est le montant AVANT les cotisations salariales
- Souvent affiché dans la colonne "Base" ou directement visible
- Valeur en euros (nombre décimal)

**NET À PAYER (net_salary):**
- Cherche en BAS du bulletin la mention "Net à payer" ou "Net payé" ou "Net à payer avant impôt"
- C'est le montant final que le salarié reçoit
- Souvent mis en évidence en gros caractères
- Valeur en euros (nombre décimal)

**COTISATIONS SALARIALES (employee_contributions):**
- Dans le tableau des cotisations, cherche la COLONNE intitulée "Part salariale" ou "Salarié" ou "Retenue salariale"
- ADDITIONNE TOUS les montants de cette colonne (tous les chiffres de la colonne salariale)
- C'est ce qui est déduit du salaire brut
- Valeur totale en euros (nombre décimal)

**CHARGES PATRONALES (employer_contributions):**
- Dans le tableau des cotisations, cherche la COLONNE intitulée "Charges patronales" ou "Part patronale" ou "Employeur"
- ADDITIONNE TOUS les montants de cette colonne (tous les chiffres de la colonne patronale)
- C'est ce que l'employeur paie en plus
- Valeur totale en euros (nombre décimal)

**CONGÉS N-1 (année précédente - leave_n_minus_1):**
- Cherche dans la section "Congés payés" ou "CP" la ligne marquée "N-1" ou "Solde N-1" ou "Année précédente"
- Extrait:
  * acquired (acquis): nombre de jours acquis l'année N-1
  * taken (pris): nombre de jours pris de N-1
  * balance (solde): nombre de jours restants de N-1
- Valeurs en jours (nombres décimaux)
- Si cette section n'existe pas, retourne null

**CONGÉS N (année en cours - leave_n):**
- Cherche dans la section "Congés payés" ou "CP" la ligne marquée "N" ou "Congés N" ou "Année en cours"
- Extrait:
  * acquired (acquis): nombre de jours acquis cette année
  * taken (pris): nombre de jours pris cette année
  * balance (solde): nombre de jours restants cette année
- Valeurs en jours (nombres décimaux)
- Si cette section n'existe pas, retourne null

**INSTRUCTIONS IMPORTANTES:**
- Enlève tous les symboles (€, j, jours) des valeurs
- Convertis les valeurs en nombres décimaux
- Si une information est absente, utilise null
- Ne retourne QUE le JSON, aucun texte supplémentaire
- Sois TRÈS PRÉCIS dans l'extraction des montants`,
          file_urls: [file_url],
          response_json_schema: {
            type: "object",
            properties: {
              first_name: { type: "string" },
              last_name: { type: "string" },
              month: { type: "string" },
              gross_salary: { type: "number" },
              net_salary: { type: "number" },
              employee_contributions: { type: "number" },
              employer_contributions: { type: "number" },
              leave_n_minus_1: {
                type: "object",
                properties: {
                  acquired: { type: "number" },
                  taken: { type: "number" },
                  balance: { type: "number" }
                }
              },
              leave_n: {
                type: "object",
                properties: {
                  acquired: { type: "number" },
                  taken: { type: "number" },
                  balance: { type: "number" }
                }
              }
            },
            required: ["first_name", "last_name"]
          }
        });

        // Find matching employee
        const matchedEmployee = employees.find(emp => {
          const firstNameMatch = emp.first_name?.toLowerCase().includes(aiResponse.first_name?.toLowerCase()) ||
                                aiResponse.first_name?.toLowerCase().includes(emp.first_name?.toLowerCase());
          const lastNameMatch = emp.last_name?.toLowerCase().includes(aiResponse.last_name?.toLowerCase()) ||
                               aiResponse.last_name?.toLowerCase().includes(emp.last_name?.toLowerCase());
          return firstNameMatch && lastNameMatch;
        });

        newQueue.push({
          id: Math.random().toString(36).substr(2, 9),
          file_name: file.name,
          file_url,
          extracted_info: aiResponse,
          matched_employee: matchedEmployee,
          status: matchedEmployee ? 'matched' : 'no_match'
        });

      } catch (error) {
        console.error('Error processing file:', error);
        newQueue.push({
          id: Math.random().toString(36).substr(2, 9),
          file_name: file.name,
          status: 'error',
          error: error.message
        });
      }
    }

    setUploadQueue(prev => [...prev, ...newQueue]);
    setProcessing(false);
  };

  const savePayslipMutation = useMutation({
    mutationFn: async ({ employeeId, file_url, extractedData }) => {
      const emp = employees.find(e => e.id === employeeId);
      if (!emp) throw new Error('Employé non trouvé');

      const totalLeave = (extractedData.leave_n_minus_1?.balance || 0) + (extractedData.leave_n?.balance || 0);

      const newPayslip = {
        month: extractedData.month || new Date().toISOString().slice(0, 7),
        file_url,
        uploaded_at: new Date().toISOString(),
        uploaded_by: (await base44.auth.me()).email,
        gross_salary: extractedData.gross_salary,
        net_salary: extractedData.net_salary,
        employee_contributions: extractedData.employee_contributions,
        employer_contributions: extractedData.employer_contributions,
        leave_n_minus_1: extractedData.leave_n_minus_1,
        leave_n: extractedData.leave_n,
        total_leave: totalLeave
      };

      const updatedPayslips = [...(emp.payslips || []), newPayslip];
      await base44.entities.Employee.update(employeeId, { payslips: updatedPayslips });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Fiche de paie enregistrée');
    }
  });

  const handleSavePayslip = async (queueItem) => {
    if (!queueItem.matched_employee) return;
    
    await savePayslipMutation.mutateAsync({
      employeeId: queueItem.matched_employee.id,
      file_url: queueItem.file_url,
      extractedData: queueItem.extracted_info
    });

    setUploadQueue(prev => prev.filter(item => item.id !== queueItem.id));
  };

  const handleRemoveFromQueue = (id) => {
    setUploadQueue(prev => prev.filter(item => item.id !== id));
  };

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

  const employeesWithPayslips = filteredEmployees.filter(emp => {
    const payslips = (emp.payslips || []).filter(p => !selectedMonth || p.month === selectedMonth);
    return payslips.length > 0;
  });

  const allPayslipIds = employeesWithPayslips.flatMap(emp => 
    (emp.payslips || [])
      .filter(p => !selectedMonth || p.month === selectedMonth)
      .map((_, idx) => `${emp.id}-${idx}`)
  );

  const handleTogglePayslip = (payslipId) => {
    const newSelected = new Set(selectedPayslips);
    if (newSelected.has(payslipId)) {
      newSelected.delete(payslipId);
    } else {
      newSelected.add(payslipId);
    }
    setSelectedPayslips(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedPayslips.size === allPayslipIds.length) {
      setSelectedPayslips(new Set());
    } else {
      setSelectedPayslips(new Set(allPayslipIds));
    }
  };

  if (loadingEmployees) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <Card className="border-2 border-dashed border-gray-300 p-6">
        <div className="text-center">
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Uploader des fiches de paie
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            L'IA analysera automatiquement chaque fiche et l'associera à l'employé correspondant
          </p>
          <input
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={handleFileSelect}
            className="hidden"
            id="payslip-upload"
            disabled={processing}
          />
          <Button
            onClick={() => document.getElementById('payslip-upload').click()}
            className="bg-orange-600 hover:bg-orange-700"
            disabled={processing}
          >
            {processing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyse en cours...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Sélectionner des fichiers
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Upload Queue */}
      {uploadQueue.length > 0 && (
        <Card className="border border-orange-300 bg-orange-50 p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Files en attente de validation
          </h3>
          <div className="space-y-3">
            {uploadQueue.map(item => (
              <div key={item.id} className="bg-white p-4 rounded-lg border border-gray-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-medium text-gray-900">{item.file_name}</span>
                      {item.status === 'matched' && (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      )}
                      {item.status === 'no_match' && (
                        <XCircle className="w-4 h-4 text-orange-600" />
                      )}
                      {item.status === 'error' && (
                        <XCircle className="w-4 h-4 text-red-600" />
                      )}
                    </div>
                    
                    {item.status === 'matched' && (
                      <div className="text-sm space-y-1">
                        <p className="text-green-700">
                          ✓ Employé trouvé: <strong>{item.matched_employee.first_name} {item.matched_employee.last_name}</strong>
                        </p>
                        {item.extracted_info?.month && (
                          <p className="text-gray-600">Mois détecté: {item.extracted_info.month}</p>
                        )}
                      </div>
                    )}
                    
                    {item.status === 'no_match' && (
                      <p className="text-sm text-orange-700">
                        ⚠ Aucun employé trouvé pour: {item.extracted_info?.first_name} {item.extracted_info?.last_name}
                      </p>
                    )}
                    
                    {item.status === 'error' && (
                      <p className="text-sm text-red-700">
                        ✗ Erreur: {item.error}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex gap-2 ml-4">
                    {item.status === 'matched' && (
                      <Button
                        size="sm"
                        onClick={() => handleSavePayslip(item)}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        Valider
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveFromQueue(item.id)}
                      className="text-gray-600 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Selection Bar */}
      {selectedPayslips.size > 0 && (
        <Card className="border-2 border-orange-600 bg-orange-50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-gray-900">
                {selectedPayslips.size} fiche{selectedPayslips.size > 1 ? 's' : ''} sélectionnée{selectedPayslips.size > 1 ? 's' : ''}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedPayslips(new Set())}
                className="text-gray-600 hover:bg-white"
              >
                Tout désélectionner
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-gray-300"
              >
                Actions groupées
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Filters */}
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

      {/* Payslips List */}
      {employeesWithPayslips.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="Aucune fiche de paie"
          description={searchTerm || selectedMonth 
            ? "Aucune fiche de paie ne correspond à vos filtres"
            : "Aucune fiche de paie uploadée. Commencez par ajouter des fiches de paie."
          }
        />
      ) : (
        <div className="space-y-4">
          {allPayslipIds.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg">
              <input
                type="checkbox"
                checked={selectedPayslips.size === allPayslipIds.length}
                onChange={handleSelectAll}
                className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Tout sélectionner ({allPayslipIds.length})
              </span>
            </div>
          )}

          {employeesWithPayslips.map(emp => {
            const employeePayslips = (emp.payslips || [])
              .filter(p => !selectedMonth || p.month === selectedMonth)
              .sort((a, b) => (b.month || '').localeCompare(a.month || ''));

            return (
              <Card key={emp.id} className="border border-gray-300 p-6">
                <div className="mb-4">
                  <h3 className="font-bold text-gray-900">{emp.first_name} {emp.last_name}</h3>
                  <p className="text-sm text-gray-600">{emp.email}</p>
                  {emp.position && <p className="text-sm text-gray-600">{emp.position}</p>}
                </div>

                <div className="space-y-2">
                  {employeePayslips.map((payslip, idx) => {
                    const payslipId = `${emp.id}-${(emp.payslips || []).indexOf(payslip)}`;
                    const isSelected = selectedPayslips.has(payslipId);
                    
                    return (
                      <div 
                        key={idx} 
                        className={cn(
                          "flex items-center gap-3 bg-gray-50 p-3 rounded-lg border transition-colors",
                          isSelected ? "border-orange-600 bg-orange-50" : "border-gray-200"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleTogglePayslip(payslipId)}
                          className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">{payslip.month || 'N/A'}</p>
                          <p className="text-xs text-gray-500">
                            Ajouté le {new Date(payslip.uploaded_at).toLocaleDateString('fr-FR')}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setViewingPayslip({ employee: emp, payslip })}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Voir les détails"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                          <a
                            href={payslip.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
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
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Payslip Detail Modal */}
      {viewingPayslip && (
        <PayslipDetailModal
          employee={viewingPayslip.employee}
          payslip={viewingPayslip.payslip}
          onClose={() => setViewingPayslip(null)}
        />
      )}
    </div>
  );
}

function PayslipDetailModal({ employee, payslip, onClose }) {
  const totalLeave = payslip.total_leave || 0;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto bg-white">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Fiche de paie - {payslip.month}
            </h2>
            <p className="text-sm text-gray-600">
              {employee.first_name} {employee.last_name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XCircle className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Salaires */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wide">
              Rémunération
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <p className="text-xs text-blue-600 mb-1">Salaire brut</p>
                <p className="text-2xl font-bold text-blue-900">
                  {payslip.gross_salary?.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) || 'N/A'}
                </p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <p className="text-xs text-green-600 mb-1">Salaire net payé</p>
                <p className="text-2xl font-bold text-green-900">
                  {payslip.net_salary?.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) || 'N/A'}
                </p>
              </div>
            </div>
          </div>

          {/* Cotisations */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wide">
              Cotisations et contributions
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                <p className="text-xs text-orange-600 mb-1">Part salariale</p>
                <p className="text-xl font-bold text-orange-900">
                  {payslip.employee_contributions?.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) || 'N/A'}
                </p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                <p className="text-xs text-purple-600 mb-1">Part patronale</p>
                <p className="text-xl font-bold text-purple-900">
                  {payslip.employer_contributions?.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) || 'N/A'}
                </p>
              </div>
            </div>
            <div className="mt-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-600">Total des cotisations</p>
              <p className="text-lg font-bold text-gray-900">
                {((payslip.employee_contributions || 0) + (payslip.employer_contributions || 0)).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
              </p>
            </div>
          </div>

          {/* Congés */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wide">
              Compteur de congés
            </h3>
            
            {/* Congés N-1 */}
            {payslip.leave_n_minus_1 && (
              <div className="mb-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <p className="text-xs text-slate-600 mb-2 font-medium">Congés N-1</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-slate-500">Acquis</p>
                    <p className="text-lg font-bold text-slate-900">
                      {payslip.leave_n_minus_1.acquired || 0} j
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Pris</p>
                    <p className="text-lg font-bold text-slate-900">
                      {payslip.leave_n_minus_1.taken || 0} j
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Solde</p>
                    <p className="text-lg font-bold text-blue-600">
                      {payslip.leave_n_minus_1.balance || 0} j
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Congés N */}
            {payslip.leave_n && (
              <div className="mb-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <p className="text-xs text-slate-600 mb-2 font-medium">Congés N (année en cours)</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-slate-500">Acquis</p>
                    <p className="text-lg font-bold text-slate-900">
                      {payslip.leave_n.acquired || 0} j
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Pris</p>
                    <p className="text-lg font-bold text-slate-900">
                      {payslip.leave_n.taken || 0} j
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Solde</p>
                    <p className="text-lg font-bold text-blue-600">
                      {payslip.leave_n.balance || 0} j
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Total des congés */}
            <div className="bg-green-50 p-4 rounded-lg border-2 border-green-300">
              <p className="text-xs text-green-600 mb-1 font-medium">Total des congés disponibles</p>
              <p className="text-3xl font-bold text-green-900">
                {totalLeave} jours
              </p>
              <p className="text-xs text-green-600 mt-1">
                Solde N-1 + Solde N
              </p>
            </div>
          </div>

          {/* Métadonnées */}
          <div className="pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              Ajouté le {new Date(payslip.uploaded_at).toLocaleDateString('fr-FR')} par {payslip.uploaded_by}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <a
              href={payslip.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1"
            >
              <Button className="w-full bg-blue-600 hover:bg-blue-700">
                <Download className="w-4 h-4 mr-2" />
                Télécharger le PDF
              </Button>
            </a>
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 border-gray-300"
            >
              Fermer
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}