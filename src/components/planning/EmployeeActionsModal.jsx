import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Calendar, Trash2, Loader2, CheckCircle, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { formatLocalDate, parseLocalDate } from './dateUtils';

export default function EmployeeActionsModal({ 
  open, 
  onOpenChange, 
  employee,
  onAddCP,
  onApplyTemplate,
  currentMonth,
  currentYear
}) {
  const [activeTab, setActiveTab] = useState('cleanup');
  const [deleteEmployeeId, setDeleteEmployeeId] = useState(employee?.id || '');
  const [startDate, setStartDate] = useState(formatLocalDate(new Date(currentYear, currentMonth, 1)));
  const [endDate, setEndDate] = useState(formatLocalDate(new Date(currentYear, currentMonth + 1, 0)));
  const [deleteShifts, setDeleteShifts] = useState(true);
  const [deleteNonShifts, setDeleteNonShifts] = useState(true);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const queryClient = useQueryClient();

  // Load preview when employee or dates change
  React.useEffect(() => {
    if (deleteEmployeeId && startDate && endDate) {
      loadPreview();
    }
  }, [deleteEmployeeId, startDate, endDate, deleteShifts, deleteNonShifts]);

  const loadPreview = async () => {
    if (!deleteEmployeeId || !startDate || !endDate) return;

    setIsLoadingPreview(true);
    try {
      const allShifts = await base44.entities.Shift.list();
      const allNonShifts = await base44.entities.NonShiftEvent.list();
      const nonShiftTypes = await base44.entities.NonShiftType.list();

      const shiftsToDelete = deleteShifts ? allShifts.filter(s => 
        s.employee_id === deleteEmployeeId &&
        s.date >= startDate &&
        s.date <= endDate
      ) : [];

      const nonShiftsToDelete = deleteNonShifts ? allNonShifts.filter(ns => 
        ns.employee_id === deleteEmployeeId &&
        ns.date >= startDate &&
        ns.date <= endDate
      ) : [];

      // Group non-shifts by type
      const nonShiftsByType = {};
      nonShiftsToDelete.forEach(ns => {
        const type = nonShiftTypes.find(t => t.id === ns.non_shift_type_id);
        const label = type?.label || 'Autre';
        nonShiftsByType[label] = (nonShiftsByType[label] || 0) + 1;
      });

      setPreviewData({
        shiftsCount: shiftsToDelete.length,
        nonShiftsCount: nonShiftsToDelete.length,
        nonShiftsByType
      });
    } catch (error) {
      console.error('Error loading preview:', error);
      toast.error('Erreur lors du chargement de l\'aperçu');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleDelete = async () => {
    if (confirmText !== 'SUPPRIMER') {
      toast.error('Veuillez taper "SUPPRIMER" pour confirmer');
      return;
    }

    if (!deleteEmployeeId) {
      toast.error('Veuillez sélectionner un employé');
      return;
    }

    setIsDeleting(true);
    try {
      const allShifts = await base44.entities.Shift.list();
      const allNonShifts = await base44.entities.NonShiftEvent.list();

      const shiftsToDelete = deleteShifts ? allShifts.filter(s => 
        s.employee_id === deleteEmployeeId &&
        s.date >= startDate &&
        s.date <= endDate
      ) : [];

      const nonShiftsToDelete = deleteNonShifts ? allNonShifts.filter(ns => 
        ns.employee_id === deleteEmployeeId &&
        ns.date >= startDate &&
        ns.date <= endDate
      ) : [];

      // Delete all
      const deletePromises = [];
      
      if (deleteShifts) {
        shiftsToDelete.forEach(s => {
          deletePromises.push(base44.entities.Shift.delete(s.id));
        });
      }

      if (deleteNonShifts) {
        nonShiftsToDelete.forEach(ns => {
          deletePromises.push(base44.entities.NonShiftEvent.delete(ns.id));
        });
      }

      await Promise.all(deletePromises);

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['nonShiftEvents'] });

      const total = shiftsToDelete.length + nonShiftsToDelete.length;
      toast.success(`✅ ${total} événement(s) supprimé(s) avec succès`);
      
      // Reset form
      setConfirmText('');
      setPreviewData(null);
      onOpenChange(false);

    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Erreur lors de la suppression : ' + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const isFormValid = deleteEmployeeId && startDate && endDate && confirmText === 'SUPPRIMER' && (deleteShifts || deleteNonShifts);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-orange-600 flex items-center gap-2">
            <Calendar className="w-6 h-6" />
            Actions planning
            {employee && ` - ${employee.first_name} ${employee.last_name}`}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="cp" className="text-xs sm:text-sm">
              🟢 Ajouter CP
            </TabsTrigger>
            <TabsTrigger value="template" className="text-xs sm:text-sm">
              <Copy className="w-4 h-4 mr-1" />
              Template
            </TabsTrigger>
            <TabsTrigger value="cleanup" className="text-xs sm:text-sm">
              <Trash2 className="w-4 h-4 mr-1" />
              Nettoyage
            </TabsTrigger>
          </TabsList>

          {/* Tab CP */}
          <TabsContent value="cp" className="space-y-4 mt-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-semibold text-green-900 mb-2">Ajouter une période de congés payés</h3>
              <p className="text-sm text-green-800 mb-4">
                Déclarez les dates de début et fin d'une période CP pour un employé.
                Le système calculera automatiquement les jours ouvrables décomptés.
              </p>
              <Button 
                onClick={() => {
                  onAddCP();
                  onOpenChange(false);
                }}
                className="bg-green-600 hover:bg-green-700"
              >
                Ouvrir le formulaire CP
              </Button>
            </div>
          </TabsContent>

          {/* Tab Template */}
          <TabsContent value="template" className="space-y-4 mt-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-2">Appliquer un template de semaine</h3>
              <p className="text-sm text-blue-800 mb-4">
                Appliquez un planning type pré-enregistré sur une période donnée.
                Pratique pour répéter des horaires récurrents.
              </p>
              <Button 
                onClick={() => {
                  onApplyTemplate();
                  onOpenChange(false);
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Copy className="w-4 h-4 mr-2" />
                Ouvrir l'assistant template
              </Button>
            </div>
          </TabsContent>

          {/* Tab Cleanup */}
          <TabsContent value="cleanup" className="space-y-4 mt-4">
            <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-red-900 text-sm">⚠️ Action irréversible</p>
                <p className="text-xs text-red-800 mt-1">
                  Cette action supprimera définitivement tous les événements sélectionnés. 
                  Aucune restauration possible.
                </p>
              </div>
            </div>

            {/* Employee Selection */}
            <div>
              <Label className="text-sm font-semibold text-gray-700">Employé concerné *</Label>
              <Select 
                value={deleteEmployeeId} 
                onValueChange={(value) => {
                  setDeleteEmployeeId(value);
                  setConfirmText('');
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Choisir un employé..." />
                </SelectTrigger>
                <SelectContent>
                  {/* This will be populated by the parent with all employees */}
                </SelectContent>
              </Select>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-semibold text-gray-700">Date de début *</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setConfirmText('');
                  }}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-semibold text-gray-700">Date de fin *</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setConfirmText('');
                  }}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Checkboxes */}
            <div className="space-y-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
              <Label className="text-sm font-semibold text-gray-700">Éléments à supprimer</Label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteShifts}
                  onChange={(e) => {
                    setDeleteShifts(e.target.checked);
                    setConfirmText('');
                  }}
                  className="w-4 h-4"
                />
                <span className="text-sm">Supprimer les shifts (travail)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteNonShifts}
                  onChange={(e) => {
                    setDeleteNonShifts(e.target.checked);
                    setConfirmText('');
                  }}
                  className="w-4 h-4"
                />
                <span className="text-sm">Supprimer les non-shifts (CP, congés, absences, etc.)</span>
              </label>
            </div>

            {/* Preview */}
            {isLoadingPreview && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-gray-600" />
                <span className="text-sm text-gray-600">Chargement de l'aperçu...</span>
              </div>
            )}

            {!isLoadingPreview && previewData && (
              <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4">
                <h3 className="font-bold text-yellow-900 text-sm mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Aperçu de la suppression
                </h3>
                <div className="space-y-2 text-sm">
                  {deleteShifts && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      <span className="font-semibold">{previewData.shiftsCount} shift(s)</span>
                      <span className="text-gray-600">seront supprimés</span>
                    </div>
                  )}
                  {deleteNonShifts && (
                    <>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-red-500" />
                        <span className="font-semibold">{previewData.nonShiftsCount} non-shift(s)</span>
                        <span className="text-gray-600">seront supprimés</span>
                      </div>
                      {Object.keys(previewData.nonShiftsByType).length > 0 && (
                        <div className="ml-4 mt-2 space-y-1 text-xs">
                          <div className="font-semibold text-gray-700">Détail par type :</div>
                          {Object.entries(previewData.nonShiftsByType).map(([type, count]) => (
                            <div key={type} className="flex items-center gap-2 text-gray-600">
                              <span>•</span>
                              <span>{type}: {count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  <div className="border-t border-yellow-200 pt-2 mt-2">
                    <div className="font-bold text-yellow-900">
                      Total : {(previewData.shiftsCount || 0) + (previewData.nonShiftsCount || 0)} événement(s)
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Confirmation */}
            {previewData && (previewData.shiftsCount > 0 || previewData.nonShiftsCount > 0) && (
              <>
                <div className="border-t pt-4">
                  <Label className="text-sm font-semibold text-gray-700 mb-1">
                    Confirmation de sécurité *
                  </Label>
                  <p className="text-xs text-gray-600 mb-2">
                    Pour confirmer, tapez exactement : <span className="font-mono font-bold">SUPPRIMER</span>
                  </p>
                  <Input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="Tapez SUPPRIMER"
                    className={cn(
                      "font-mono",
                      confirmText && confirmText !== 'SUPPRIMER' && "border-red-500 focus:border-red-500"
                    )}
                  />
                  {confirmText && confirmText !== 'SUPPRIMER' && (
                    <p className="text-xs text-red-600 mt-1">
                      Le texte ne correspond pas. Veuillez taper exactement "SUPPRIMER"
                    </p>
                  )}
                  {confirmText === 'SUPPRIMER' && (
                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      Confirmation valide
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    onClick={() => onOpenChange(false)}
                    variant="outline"
                    className="flex-1"
                    disabled={isDeleting}
                  >
                    Annuler
                  </Button>
                  <Button
                    onClick={handleDelete}
                    disabled={!isFormValid || isDeleting}
                    className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50"
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Suppression...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Supprimer définitivement
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}

            {previewData && previewData.shiftsCount === 0 && previewData.nonShiftsCount === 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-600">
                  Aucun événement à supprimer pour cette période
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}