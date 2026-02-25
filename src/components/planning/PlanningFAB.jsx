import React from 'react';
import { Calendar, FileText, AlertTriangle, Trash2, X, Plus } from 'lucide-react';

export default function PlanningFAB({
  showFab,
  setShowFab,
  canModifyPlanning,
  canDoDirectSwap,
  onLeaveRequest,
  onShiftSwap,
  onDirectSwap,
  onAddCP,
  onApplyTemplate,
  onResetMonth,
  onClearAllEmployeesMonth,
  onExportCompta,
}) {
  if (!canModifyPlanning) {
    return (
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
        <button
          onClick={onLeaveRequest}
          className="w-14 h-14 bg-blue-600 hover:bg-blue-700 rounded-full shadow-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95"
          title="Demande de CP"
        >
          <span className="text-2xl">📝</span>
        </button>
        <button
          onClick={onShiftSwap}
          className="w-14 h-14 bg-purple-600 hover:bg-purple-700 rounded-full shadow-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95"
          title="Demande d'échange de shift"
        >
          <span className="text-2xl">🔄</span>
        </button>
        <div className="w-14 h-14 bg-gray-300 rounded-full shadow-lg flex items-center justify-center opacity-40 cursor-not-allowed" title="Lecture seule — vous n'avez pas la permission de modifier le planning">
          <Plus className="w-6 h-6 text-gray-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {showFab && (
        <div className="absolute bottom-16 right-0 bg-white rounded-lg shadow-2xl border-2 border-gray-200 p-2 space-y-2 min-w-[240px] animate-in slide-in-from-bottom-2">
          <button onClick={() => { onLeaveRequest(); setShowFab(false); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 rounded-lg transition-colors group">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center group-hover:bg-blue-200 transition-colors"><span className="text-lg">📝</span></div>
            <div className="text-left flex-1">
              <div className="font-semibold text-sm text-gray-900">Demande de CP</div>
              <div className="text-xs text-gray-500">Nouvelle demande</div>
            </div>
          </button>

          <button onClick={() => { onShiftSwap(); setShowFab(false); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-purple-50 rounded-lg transition-colors group">
            <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center group-hover:bg-purple-200 transition-colors"><span className="text-lg">🔄</span></div>
            <div className="text-left flex-1">
              <div className="font-semibold text-sm text-gray-900">Demande d'échange</div>
              <div className="text-xs text-gray-500">Échanger un shift</div>
            </div>
          </button>

          {canDoDirectSwap && (
            <button onClick={() => { onDirectSwap(); setShowFab(false); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-orange-50 rounded-lg transition-colors group">
              <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center group-hover:bg-orange-200 transition-colors"><span className="text-lg">⚡</span></div>
              <div className="text-left flex-1">
                <div className="font-semibold text-sm text-gray-900">Échange direct</div>
                <div className="text-xs text-gray-500">Immédiat, sans validation</div>
              </div>
            </button>
          )}

          <button onClick={() => { onAddCP(); setShowFab(false); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-green-50 rounded-lg transition-colors group">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center group-hover:bg-green-200 transition-colors"><span className="text-lg">🟢</span></div>
            <div className="text-left flex-1">
              <div className="font-semibold text-sm text-gray-900">Ajouter CP</div>
              <div className="text-xs text-gray-500">Congés payés</div>
            </div>
          </button>

          <button onClick={() => { onApplyTemplate(); setShowFab(false); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 rounded-lg transition-colors group">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center group-hover:bg-blue-200 transition-colors">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-left flex-1">
              <div className="font-semibold text-sm text-gray-900">Appliquer templates</div>
              <div className="text-xs text-gray-500">Plannings types</div>
            </div>
          </button>

          <button onClick={() => { onResetMonth(); setShowFab(false); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 rounded-lg transition-colors group">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center group-hover:bg-red-200 transition-colors">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div className="text-left flex-1">
              <div className="font-semibold text-sm text-gray-900">Réinitialiser mois</div>
              <div className="text-xs text-gray-500">Effacer le planning</div>
            </div>
          </button>

          <button onClick={() => { onClearAllEmployeesMonth(); setShowFab(false); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 rounded-lg transition-colors group">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center group-hover:bg-red-200 transition-colors">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <div className="text-left flex-1">
              <div className="font-semibold text-sm text-gray-900">Vider le mois</div>
              <div className="text-xs text-gray-500">Tous les employés — shifts, CP, récaps</div>
            </div>
          </button>

          <button onClick={() => { onExportCompta(); setShowFab(false); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 rounded-lg transition-colors group">
            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center group-hover:bg-gray-200 transition-colors">
              <FileText className="w-5 h-5 text-gray-600" />
            </div>
            <div className="text-left flex-1">
              <div className="font-semibold text-sm text-gray-900">Export compta</div>
              <div className="text-xs text-gray-500">Envoi comptabilité</div>
            </div>
          </button>
        </div>
      )}

      <button
        onClick={() => setShowFab(!showFab)}
        className="w-14 h-14 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95"
      >
        {showFab ? <X className="w-6 h-6 text-white" /> : <Plus className="w-6 h-6 text-white" />}
      </button>
    </div>
  );
}