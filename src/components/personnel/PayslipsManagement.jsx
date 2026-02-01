import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Upload, Download, Trash2, Search, Calendar, FileText, Loader2, CheckCircle, XCircle, Pencil } from 'lucide-react';
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

  const normalizeText = (text) => {
    if (!text) return '';
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setProcessing(true);
    const newQueue = [];

    for (const file of files) {
      try {
        // Upload file
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        
        // Use AI to extract employee info with web search
        const aiResponse = await base44.integrations.Core.InvokeLLM({
          prompt: `Analyse ce bulletin de paie français et extrait les données suivantes.

IDENTITÉ: Nom et prénom du salarié (pas l'employeur), période au format YYYY-MM.

MONTANTS EN EUROS (enlève le symbole €):
- Salaire brut: montant total avant cotisations
- Net à payer: montant final versé au salarié (en bas du bulletin)
- Part salariale: TOTAL de la colonne cotisations salariales
- Part patronale: TOTAL de la colonne charges patronales

CONGÉS EN JOURS (enlève "j" ou "jours"):
- Cherche la section congés payés
- ADDITIONNE tous les soldes de congés (N-1 + N ou toutes lignes de solde)
- Retourne le TOTAL en jours dans le champ total_leave

Retourne uniquement le JSON sans texte supplémentaire.`,
          file_urls: [file_url],
          add_context_from_internet: false,
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
              total_leave: { type: "number" }
            },
            required: ["first_name", "last_name"]
          }
        });

        // Find matching employee (with accent normalization)
        const normalizedAIFirstName = normalizeText(aiResponse.first_name);
        const normalizedAILastName = normalizeText(aiResponse.last_name);
        
        const matchedEmployee = employees.find(emp => {
          const normalizedEmpFirstName = normalizeText(emp.first_name);
          const normalizedEmpLastName = normalizeText(emp.last_name);
          
          const firstNameMatch = normalizedEmpFirstName.includes(normalizedAIFirstName) ||
                                normalizedAIFirstName.includes(normalizedEmpFirstName);
          const lastNameMatch = normalizedEmpLastName.includes(normalizedAILastName) ||
                               normalizedAILastName.includes(normalizedEmpLastName);
          
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

      const newPayslip = {
        month: extractedData.month || new Date().toISOString().slice(0, 7),
        file_url,
        uploaded_at: new Date().toISOString(),
        uploaded_by: (await base44.auth.me()).email,
        gross_salary: parseFloat(extractedData.gross_salary) || null,
        net_salary: parseFloat(extractedData.net_salary) || null,
        employee_contributions: parseFloat(extractedData.employee_contributions) || null,
        employer_contributions: parseFloat(extractedData.employer_contributions) || null,
        total_leave: parseFloat(extractedData.total_leave) || 0
      };

      console.log('Saving payslip:', newPayslip);

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

  const handleEditQueueItem = (id, field, value) => {
    setUploadQueue(prev => prev.map(item => {
      if (item.id === id) {
        const updatedInfo = { ...item.extracted_info };
        updatedInfo[field] = field === 'month' ? value : parseFloat(value) || 0;
        return { ...item, extracted_info: updatedInfo };
      }
      return item;
    }));
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
                {item.editing && item.status === 'matched' && (
                  <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="text-sm font-semibold text-blue-900 mb-3">Modifier les données extraites</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-700 block mb-1">Mois (YYYY-MM)</label>
                        <Input
                          type="text"
                          value={item.extracted_info.month || ''}
                          onChange={(e) => handleEditQueueItem(item.id, 'month', e.target.value)}
                          className="text-sm"
                          placeholder="2025-05"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-700 block mb-1">Salaire brut (€)</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.extracted_info.gross_salary || ''}
                          onChange={(e) => handleEditQueueItem(item.id, 'gross_salary', e.target.value)}
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-700 block mb-1">Net à payer (€)</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.extracted_info.net_salary || ''}
                          onChange={(e) => handleEditQueueItem(item.id, 'net_salary', e.target.value)}
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-700 block mb-1">Cotisations salariales (€)</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.extracted_info.employee_contributions || ''}
                          onChange={(e) => handleEditQueueItem(item.id, 'employee_contributions', e.target.value)}
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-700 block mb-1">Charges patronales (€)</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.extracted_info.employer_contributions || ''}
                          onChange={(e) => handleEditQueueItem(item.id, 'employer_contributions', e.target.value)}
                          className="text-sm"
                        />
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-blue-200">
                      <h5 className="text-xs font-semibold text-gray-700 mb-2">Congés totaux (jours)</h5>
                      <Input
                        type="number"
                        step="0.5"
                        placeholder="Total des congés"
                        value={item.extracted_info.total_leave || ''}
                        onChange={(e) => handleEditQueueItem(item.id, 'total_leave', e.target.value)}
                        className="text-sm"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        const newQueue = [...uploadQueue];
                        const idx = newQueue.findIndex(i => i.id === item.id);
                        if (idx !== -1) {
                          newQueue[idx].editing = false;
                          setUploadQueue(newQueue);
                        }
                      }}
                      className="mt-3 bg-blue-600 hover:bg-blue-700"
                    >
                      Terminé
                    </Button>
                  </div>
                )}
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
                      <div className="text-sm space-y-2">
                        <p className="text-green-700">
                          ✓ Employé trouvé: <strong>{item.matched_employee.first_name} {item.matched_employee.last_name}</strong>
                        </p>
                        {item.extracted_info?.month && (
                          <p className="text-gray-600">Mois: {item.extracted_info.month}</p>
                        )}
                        
                        {/* Données extraites à vérifier */}
                        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mt-2">
                          <p className="text-xs text-yellow-800 font-semibold mb-2">⚠️ VÉRIFIER LES DONNÉES EXTRAITES:</p>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-gray-600">Brut:</span>
                              <span className="ml-1 font-semibold">{item.extracted_info.gross_salary ? `${item.extracted_info.gross_salary}€` : 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Net:</span>
                              <span className="ml-1 font-semibold">{item.extracted_info.net_salary ? `${item.extracted_info.net_salary}€` : 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Cotis. salariales:</span>
                              <span className="ml-1 font-semibold">{item.extracted_info.employee_contributions ? `${item.extracted_info.employee_contributions}€` : 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Charges patronales:</span>
                              <span className="ml-1 font-semibold">{item.extracted_info.employer_contributions ? `${item.extracted_info.employer_contributions}€` : 'N/A'}</span>
                            </div>
                          </div>
                          {item.extracted_info.total_leave && (
                            <div className="mt-2 pt-2 border-t border-yellow-200">
                              <span className="text-gray-600 text-xs">Congés:</span>
                              <span className="ml-1 text-xs font-semibold">{item.extracted_info.total_leave}j</span>
                            </div>
                          )}
                          <button
                            onClick={() => {
                              const newQueue = [...uploadQueue];
                              const idx = newQueue.findIndex(i => i.id === item.id);
                              if (idx !== -1) {
                                newQueue[idx].editing = true;
                                setUploadQueue(newQueue);
                              }
                            }}
                            className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline"
                          >
                            Modifier les données
                          </button>
                        </div>
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
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState('data'); // 'data' or 'preview'
  const [editedData, setEditedData] = useState({
    gross_salary: payslip.gross_salary || 0,
    net_salary: payslip.net_salary || 0,
    employee_contributions: payslip.employee_contributions || 0,
    employer_contributions: payslip.employer_contributions || 0,
    total_leave: payslip.total_leave || 0
  });
  const queryClient = useQueryClient();

  const updatePayslipMutation = useMutation({
    mutationFn: async () => {
      const payslipIndex = employee.payslips.findIndex(p => p.month === payslip.month && p.uploaded_at === payslip.uploaded_at);
      if (payslipIndex === -1) throw new Error('Fiche de paie non trouvée');

      const updatedPayslips = [...employee.payslips];
      updatedPayslips[payslipIndex] = {
        ...updatedPayslips[payslipIndex],
        ...editedData
      };

      await base44.entities.Employee.update(employee.id, { payslips: updatedPayslips });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Fiche de paie mise à jour');
      setIsEditing(false);
      onClose();
    },
    onError: (error) => {
      toast.error('Erreur lors de la mise à jour');
      console.error(error);
    }
  });

  const handleSave = () => {
    updatePayslipMutation.mutate();
  };
  
  const formatMonth = (monthStr) => {
    if (!monthStr) return 'N/A';
    const [year, month] = monthStr.split('-');
    const monthNames = ['JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 
                        'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'];
    const monthIndex = parseInt(month, 10) - 1;
    return `${year}-${monthNames[monthIndex] || month}`;
  };
  
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto bg-white">
        <div className="sticky top-0 bg-white border-b border-gray-200">
          <div className="p-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Fiche de paie - {formatMonth(payslip.month)}
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

          {/* Tabs */}
          <div className="flex border-t border-gray-200">
            <button
              onClick={() => setActiveTab('data')}
              className={cn(
                "flex-1 px-6 py-3 text-sm font-medium transition-colors",
                activeTab === 'data'
                  ? "bg-orange-50 text-orange-900 border-b-2 border-orange-600"
                  : "text-gray-600 hover:bg-gray-50"
              )}
            >
              Données extraites
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={cn(
                "flex-1 px-6 py-3 text-sm font-medium transition-colors",
                activeTab === 'preview'
                  ? "bg-orange-50 text-orange-900 border-b-2 border-orange-600"
                  : "text-gray-600 hover:bg-gray-50"
              )}
            >
              Aperçu PDF
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {activeTab === 'data' ? (
            <>
          {/* Salaires */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wide">
              Rémunération
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <p className="text-xs text-blue-600 mb-1">Salaire brut</p>
                {isEditing ? (
                  <Input
                    type="number"
                    step="0.01"
                    value={editedData.gross_salary}
                    onChange={(e) => setEditedData({...editedData, gross_salary: parseFloat(e.target.value) || 0})}
                    className="text-xl font-bold text-blue-900 mt-1"
                  />
                ) : (
                  <p className="text-2xl font-bold text-blue-900">
                    {payslip.gross_salary != null ? payslip.gross_salary.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : 'N/A'}
                  </p>
                )}
              </div>
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <p className="text-xs text-green-600 mb-1">Salaire net payé</p>
                {isEditing ? (
                  <Input
                    type="number"
                    step="0.01"
                    value={editedData.net_salary}
                    onChange={(e) => setEditedData({...editedData, net_salary: parseFloat(e.target.value) || 0})}
                    className="text-xl font-bold text-green-900 mt-1"
                  />
                ) : (
                  <p className="text-2xl font-bold text-green-900">
                    {payslip.net_salary != null ? payslip.net_salary.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : 'N/A'}
                  </p>
                )}
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
                {isEditing ? (
                  <Input
                    type="number"
                    step="0.01"
                    value={editedData.employee_contributions}
                    onChange={(e) => setEditedData({...editedData, employee_contributions: parseFloat(e.target.value) || 0})}
                    className="text-lg font-bold text-orange-900 mt-1"
                  />
                ) : (
                  <p className="text-xl font-bold text-orange-900">
                    {payslip.employee_contributions != null ? payslip.employee_contributions.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : 'N/A'}
                  </p>
                )}
              </div>
              <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                <p className="text-xs text-purple-600 mb-1">Part patronale</p>
                {isEditing ? (
                  <Input
                    type="number"
                    step="0.01"
                    value={editedData.employer_contributions}
                    onChange={(e) => setEditedData({...editedData, employer_contributions: parseFloat(e.target.value) || 0})}
                    className="text-lg font-bold text-purple-900 mt-1"
                  />
                ) : (
                  <p className="text-xl font-bold text-purple-900">
                    {payslip.employer_contributions != null ? payslip.employer_contributions.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : 'N/A'}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-600">Total des cotisations</p>
              <p className="text-lg font-bold text-gray-900">
                {isEditing 
                  ? ((editedData.employee_contributions || 0) + (editedData.employer_contributions || 0)).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
                  : ((payslip.employee_contributions || 0) + (payslip.employer_contributions || 0)).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
                }
              </p>
            </div>
          </div>

          {/* Congés */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wide">
              Compteur de congés
            </h3>
            <div className="bg-green-50 p-4 rounded-lg border-2 border-green-300">
              <p className="text-xs text-green-600 mb-1 font-medium">Congés</p>
              {isEditing ? (
                <Input
                  type="number"
                  step="0.5"
                  value={editedData.total_leave}
                  onChange={(e) => setEditedData({...editedData, total_leave: parseFloat(e.target.value) || 0})}
                  className="text-2xl font-bold text-green-900 mt-1"
                />
              ) : (
                <p className="text-3xl font-bold text-green-900">
                  {payslip.total_leave || 0} jours
                </p>
              )}
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
            {isEditing ? (
              <>
                <Button
                  onClick={handleSave}
                  disabled={updatePayslipMutation.isPending}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {updatePayslipMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Enregistrement...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Enregistrer
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditing(false);
                    setEditedData({
                      gross_salary: payslip.gross_salary || 0,
                      net_salary: payslip.net_salary || 0,
                      employee_contributions: payslip.employee_contributions || 0,
                      employer_contributions: payslip.employer_contributions || 0,
                      total_leave: payslip.total_leave || 0
                    });
                  }}
                  className="flex-1 border-gray-300"
                >
                  Annuler
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={() => setIsEditing(true)}
                  className="flex-1 bg-orange-600 hover:bg-orange-700"
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  Modifier
                </Button>
                <a
                  href={payslip.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1"
                >
                  <Button className="w-full bg-blue-600 hover:bg-blue-700">
                    <Download className="w-4 h-4 mr-2" />
                    Télécharger
                  </Button>
                </a>
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="border-gray-300"
                >
                  Fermer
                </Button>
              </>
              )}
              </div>
              </>
              ) : (
              /* PDF Preview */
              <div className="h-[600px] w-full bg-gray-100 rounded-lg overflow-hidden">
              <iframe
                src={payslip.file_url}
                className="w-full h-full"
                title="Aperçu fiche de paie"
              />
              </div>
              )}
              </div>
              </Card>
              </div>
              );
              }