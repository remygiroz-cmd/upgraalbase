import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Trash2, Search, CheckCircle, ShieldAlert, Archive } from 'lucide-react';
import { toast } from 'sonner';
import { buildDedupeKey } from '@/components/planning/shiftService';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export default function AdminShiftCleanup() {
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState(String(today.getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState(String(today.getMonth())); // 0-indexed
  const [scanResult, setScanResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const isAdmin = currentUser?.role === 'admin';

  const monthKey = `${selectedYear}-${String(Number(selectedMonth) + 1).padStart(2, '0')}`;

  const handleScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      // Fetch active planning version
      const planningMonths = await base44.entities.PlanningMonth.filter({ month_key: monthKey });
      const activeResetVersion = planningMonths[0]?.reset_version ?? 0;

      const year = Number(selectedYear);
      const month = Number(selectedMonth);
      const firstDay = `${selectedYear}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDayDate = new Date(year, month + 1, 0);
      const lastDay = `${selectedYear}-${String(month + 1).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`;

      const allShifts = await base44.entities.Shift.list();
      const monthShifts = allShifts.filter(s => s.date >= firstDay && s.date <= lastDay);

      // Group by employee_id + date + start_time + end_time
      const groups = {};
      for (const s of monthShifts) {
        const key = `${s.employee_id}|${s.date}|${s.start_time}|${s.end_time}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(s);
      }

      // Find groups with duplicates
      const duplicateGroups = Object.entries(groups)
        .filter(([, shifts]) => shifts.length > 1)
        .map(([key, shifts]) => {
          // Sort by created_date desc — keep newest
          const sorted = [...shifts].sort((a, b) =>
            new Date(b.created_date || 0) - new Date(a.created_date || 0)
          );
          return { key, keepId: sorted[0].id, duplicates: sorted.slice(1), allShifts: sorted };
        });

      // Shifts with wrong reset_version
      const wrongVersionShifts = monthShifts.filter(s =>
        s.month_key !== undefined && s.month_key !== null &&
        s.reset_version !== undefined && s.reset_version !== null &&
        (s.month_key !== monthKey || s.reset_version !== activeResetVersion)
      );

      // Active shifts (matching current version)
      const activeShifts = monthShifts.filter(s =>
        (s.month_key === undefined || s.month_key === null || s.month_key === monthKey) &&
        (s.reset_version === undefined || s.reset_version === null || s.reset_version === activeResetVersion)
      );

      setScanResult({
        monthKey,
        activeResetVersion,
        totalMonthShifts: monthShifts.length,
        activeShifts: activeShifts.length,
        wrongVersionShifts: wrongVersionShifts.length,
        wrongVersionIds: wrongVersionShifts.map(s => s.id),
        duplicateGroups,
        totalDuplicatesToRemove: duplicateGroups.reduce((acc, g) => acc + g.duplicates.length, 0),
      });
    } catch (e) {
      toast.error('Erreur lors du scan : ' + e.message);
    } finally {
      setScanning(false);
    }
  };

  const handleCleanDuplicates = async () => {
    if (!scanResult || scanResult.totalDuplicatesToRemove === 0) return;
    setCleaning(true);
    try {
      const idsToDelete = scanResult.duplicateGroups.flatMap(g => g.duplicates.map(s => s.id));
      await Promise.all(idsToDelete.map(id => base44.entities.Shift.delete(id)));
      toast.success(`✅ ${idsToDelete.length} doublon(s) supprimé(s)`);
      setScanResult(null);
    } catch (e) {
      toast.error('Erreur : ' + e.message);
    } finally {
      setCleaning(false);
    }
  };

  const handleCleanWrongVersion = async () => {
    if (!scanResult || scanResult.wrongVersionShifts === 0) return;
    if (!window.confirm(`Supprimer ${scanResult.wrongVersionShifts} shift(s) de versions inactives ? Cette action est irréversible.`)) return;
    setCleaning(true);
    try {
      await Promise.all(scanResult.wrongVersionIds.map(id => base44.entities.Shift.delete(id)));
      toast.success(`✅ ${scanResult.wrongVersionIds.length} shift(s) de version inactive supprimé(s)`);
      setScanResult(null);
    } catch (e) {
      toast.error('Erreur : ' + e.message);
    } finally {
      setCleaning(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ShieldAlert className="w-16 h-16 text-red-400" />
        <h2 className="text-xl font-bold text-gray-700">Accès réservé aux administrateurs</h2>
      </div>
    );
  }

  const years = [String(today.getFullYear() - 1), String(today.getFullYear()), String(today.getFullYear() + 1)];

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Trash2 className="w-7 h-7 text-red-600" />
        <h1 className="text-2xl font-bold text-gray-900">Nettoyage des shifts en doublon</h1>
      </div>

      <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-900">
          <p className="font-semibold mb-1">Outil admin — action irréversible</p>
          <p>Cet outil scanne les shifts du mois sélectionné, détecte les doublons (même employé, même date, même heure) et les shifts de versions inactives. Il conserve toujours le shift le plus récent.</p>
        </div>
      </div>

      {/* Sélection mois */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mois à analyser</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4 items-end">
          <div>
            <Label className="text-sm font-medium">Mois</Label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-40 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={i} value={String(i)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm font-medium">Année</Label>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-28 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(y => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleScan} disabled={scanning} className="bg-blue-600 hover:bg-blue-700">
            <Search className="w-4 h-4 mr-2" />
            {scanning ? 'Analyse...' : 'Analyser'}
          </Button>
        </CardContent>
      </Card>

      {/* Résultats du scan */}
      {scanResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Résultats — {MONTHS[Number(selectedMonth)]} {selectedYear}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-gray-50 rounded p-3">
                <p className="text-gray-500 text-xs">Version active du planning</p>
                <p className="font-bold text-lg text-gray-900">v{scanResult.activeResetVersion}</p>
              </div>
              <div className="bg-gray-50 rounded p-3">
                <p className="text-gray-500 text-xs">Total shifts du mois en base</p>
                <p className="font-bold text-lg text-gray-900">{scanResult.totalMonthShifts}</p>
              </div>
              <div className="bg-green-50 rounded p-3">
                <p className="text-gray-500 text-xs">Shifts version active</p>
                <p className="font-bold text-lg text-green-700">{scanResult.activeShifts}</p>
              </div>
              <div className={`rounded p-3 ${scanResult.wrongVersionShifts > 0 ? 'bg-orange-50' : 'bg-gray-50'}`}>
                <p className="text-gray-500 text-xs">Shifts version inactive</p>
                <p className={`font-bold text-lg ${scanResult.wrongVersionShifts > 0 ? 'text-orange-700' : 'text-gray-900'}`}>
                  {scanResult.wrongVersionShifts}
                </p>
              </div>
              <div className={`rounded p-3 col-span-2 ${scanResult.totalDuplicatesToRemove > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                <p className="text-gray-500 text-xs">Doublons à supprimer (groupes: {scanResult.duplicateGroups.length})</p>
                <p className={`font-bold text-lg ${scanResult.totalDuplicatesToRemove > 0 ? 'text-red-700' : 'text-gray-900'}`}>
                  {scanResult.totalDuplicatesToRemove}
                </p>
              </div>
            </div>

            {/* Détail doublons */}
            {scanResult.duplicateGroups.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Groupes en doublon (aperçu) :</p>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {scanResult.duplicateGroups.map((g, i) => (
                    <div key={i} className="text-xs bg-red-50 border border-red-200 rounded p-2 font-mono">
                      <span className="text-green-700">✓ Garder : {g.keepId.slice(-8)}</span>
                      {' | '}
                      <span className="text-red-700">✗ Supprimer : {g.duplicates.map(s => s.id.slice(-8)).join(', ')}</span>
                      <span className="text-gray-500 ml-2">[{g.key.split('|').slice(1).join(' | ')}]</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2 border-t">
              {scanResult.totalDuplicatesToRemove > 0 && (
                <Button
                  onClick={handleCleanDuplicates}
                  disabled={cleaning}
                  className="bg-red-600 hover:bg-red-700"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {cleaning ? 'Suppression...' : `Supprimer ${scanResult.totalDuplicatesToRemove} doublon(s)`}
                </Button>
              )}
              {scanResult.wrongVersionShifts > 0 && (
                <Button
                  onClick={handleCleanWrongVersion}
                  disabled={cleaning}
                  variant="outline"
                  className="border-orange-400 text-orange-700 hover:bg-orange-50"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {cleaning ? 'Suppression...' : `Supprimer ${scanResult.wrongVersionShifts} shift(s) version inactive`}
                </Button>
              )}
              {scanResult.totalDuplicatesToRemove === 0 && scanResult.wrongVersionShifts === 0 && (
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">Aucun problème détecté — le planning est propre ✓</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}