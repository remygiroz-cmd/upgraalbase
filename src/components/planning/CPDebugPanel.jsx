import React from 'react';
import { cn } from '@/lib/utils';
import { X, Calendar, ArrowRight, CheckCircle } from 'lucide-react';

export default function CPDebugPanel({ employee, cpPeriods, onClose }) {
  if (!cpPeriods || cpPeriods.length === 0) {
    return (
      <div className="fixed top-20 right-4 bg-white border-2 border-purple-500 rounded-lg shadow-2xl p-4 max-w-md z-50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-purple-900">
            🏖️ Debug CP - {employee.first_name} {employee.last_name}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="text-sm text-gray-600">
          Aucune période de congés payés détectée pour cet employé.
        </div>
      </div>
    );
  }

  return (
    <div className="fixed top-20 right-4 bg-white border-4 border-purple-500 rounded-lg shadow-2xl p-4 max-w-2xl max-h-[80vh] overflow-y-auto z-50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-lg text-purple-900">
          🏖️ Debug CP - {employee.first_name} {employee.last_name}
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4">
        {cpPeriods.map((period, index) => (
          <div key={index} className="bg-purple-50 border-2 border-purple-300 rounded-lg p-4">
            <div className="font-bold text-purple-900 mb-3 text-lg">
              📊 Période #{index + 1}
            </div>

            {/* Input: non-shifts posés */}
            <div className="mb-3 bg-blue-50 border border-blue-300 rounded p-2">
              <div className="font-semibold text-blue-900 text-sm mb-1">
                📥 INPUT - Non-shifts "Congé payé" posés:
              </div>
              <div className="text-xs text-blue-800">
                {period.firstCPPosted} → {period.lastCPPosted} ({period.nonShiftsPosted} jour{period.nonShiftsPosted > 1 ? 's' : ''})
              </div>
            </div>

            {/* Context: shifts avant/après */}
            <div className="mb-3 bg-yellow-50 border border-yellow-300 rounded p-2">
              <div className="font-semibold text-yellow-900 text-sm mb-1">
                🔍 CONTEXTE - Shifts réels:
              </div>
              <div className="text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Dernier shift avant:</span>
                  <span className={cn(
                    "font-mono",
                    period.lastShiftBefore ? "text-green-700" : "text-red-600"
                  )}>
                    {period.lastShiftBefore || '❌ AUCUN'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Premier shift après:</span>
                  <span className={cn(
                    "font-mono",
                    period.firstShiftAfter ? "text-green-700" : "text-orange-600"
                  )}>
                    {period.firstShiftAfter || '⚠️ AUCUN (provisoire)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Calculation: bornes */}
            <div className="mb-3 bg-green-50 border border-green-400 rounded p-2">
              <div className="font-semibold text-green-900 text-sm mb-2">
                ⚙️ CALCUL - Bornes de la période:
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-green-700" />
                  <span className="font-bold text-green-900">{period.startCP}</span>
                </div>
                <ArrowRight className="w-4 h-4 text-green-600" />
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-green-700" />
                  <span className="font-bold text-green-900">{period.endCP}</span>
                </div>
              </div>
              {period.isProvisional && (
                <div className="text-[10px] text-orange-600 mt-1 italic">
                  ⚠️ Provisoire (pas de shift de reprise détecté)
                </div>
              )}
            </div>

            {/* Result: jours décomptés */}
            <div className="bg-emerald-50 border-2 border-emerald-500 rounded p-3">
              <div className="font-bold text-emerald-900 text-base mb-2">
                ✅ RÉSULTAT - Jours ouvrables décomptés:
              </div>
              
              {period.breakdown && period.breakdown.length > 0 ? (
                <>
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {period.breakdown.map((day, i) => (
                      <div
                        key={i}
                        className={cn(
                          "text-[9px] p-1 rounded text-center font-mono border",
                          day.isWorkable
                            ? "bg-green-200 border-green-600 text-green-900 font-bold"
                            : "bg-gray-100 border-gray-300 text-gray-500"
                        )}
                        title={day.isHoliday ? "Férié" : day.isSunday ? "Dimanche" : ""}
                      >
                        <div className="font-semibold">{day.dayName}</div>
                        <div>{day.date.substring(8)}</div>
                        {day.isWorkable && <CheckCircle className="w-3 h-3 mx-auto mt-0.5" />}
                      </div>
                    ))}
                  </div>
                  
                  <div className="text-sm text-emerald-800 space-y-1">
                    <div>
                      ✓ Jours comptés: {period.breakdown.filter(d => d.isWorkable).length}
                    </div>
                    <div>
                      ✗ Dimanches: {period.breakdown.filter(d => d.isSunday).length}
                    </div>
                    <div>
                      ✗ Fériés: {period.breakdown.filter(d => d.isHoliday && !d.isSunday).length}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-xs text-gray-500">Pas de détail disponible</div>
              )}
              
              <div className="mt-3 pt-3 border-t-2 border-emerald-300">
                <div className="text-2xl font-bold text-emerald-900 text-center">
                  🏖️ {period.workableDaysDeducted} jour{period.workableDaysDeducted > 1 ? 's' : ''} CP décompté{period.workableDaysDeducted > 1 ? 's' : ''}
                </div>
              </div>
            </div>
          </div>
        ))}

        <div className="bg-purple-100 border-2 border-purple-400 rounded-lg p-3 mt-4">
          <div className="font-bold text-purple-900 mb-2">
            📊 TOTAL MOIS
          </div>
          <div className="text-xl font-bold text-purple-900">
            {cpPeriods.reduce((sum, p) => sum + p.workableDaysDeducted, 0)} jour{cpPeriods.reduce((sum, p) => sum + p.workableDaysDeducted, 0) > 1 ? 's' : ''} CP
          </div>
        </div>
      </div>
    </div>
  );
}