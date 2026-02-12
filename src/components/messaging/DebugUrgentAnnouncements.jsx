import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Bug, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function DebugUrgentAnnouncements({ currentEmployee, urgentAnnouncementToShow }) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Fetch ALL announcements without filtering
  const { data: allAnnouncements = [] } = useQuery({
    queryKey: ['debugAllUrgentAnnouncements'],
    queryFn: async () => {
      const all = await base44.entities.UrgentAnnouncement.list();
      return all.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 20);
    }
  });

  const { data: myAcks = [] } = useQuery({
    queryKey: ['urgentAnnouncementAcks', currentEmployee?.id],
    queryFn: () => base44.entities.UrgentAnnouncementAck.filter({ 
      employee_id: currentEmployee.id 
    }),
    enabled: !!currentEmployee?.id
  });

  const ackedIds = new Set(myAcks.map(ack => ack.announcement_id));
  const now = new Date();

  return (
    <div className="fixed bottom-4 right-4 max-w-2xl bg-yellow-50 border-2 border-yellow-600 rounded-lg shadow-2xl z-50">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-yellow-600 text-white font-semibold rounded-t-lg hover:bg-yellow-700 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Bug className="w-5 h-5" />
          <span>🐛 DEBUG ANNONCES URGENTES</span>
        </div>
        {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
      </button>

      {isExpanded && (
        <div className="p-4 max-h-[70vh] overflow-y-auto bg-white">
          {/* Current Employee Info */}
          <div className="mb-4 p-3 bg-blue-50 rounded border border-blue-200">
            <h3 className="font-bold text-sm text-blue-900 mb-2">👤 EMPLOYÉ COURANT</h3>
            <div className="text-xs space-y-1">
              <div><strong>ID:</strong> {currentEmployee?.id || 'N/A'}</div>
              <div><strong>Nom:</strong> {currentEmployee?.first_name} {currentEmployee?.last_name}</div>
              <div><strong>Équipe:</strong> {currentEmployee?.team || 'N/A'}</div>
              <div><strong>Email:</strong> {currentEmployee?.email}</div>
            </div>
          </div>

          {/* Selected Blocking Announcement */}
          <div className="mb-4 p-3 bg-red-50 rounded border border-red-300">
            <h3 className="font-bold text-sm text-red-900 mb-2">🚨 ANNONCE BLOQUANTE SÉLECTIONNÉE</h3>
            {urgentAnnouncementToShow ? (
              <div className="text-xs">
                <div><strong>ID:</strong> {urgentAnnouncementToShow.id}</div>
                <div><strong>Titre:</strong> {urgentAnnouncementToShow.title}</div>
                <div><strong>Severity:</strong> {urgentAnnouncementToShow.severity}</div>
              </div>
            ) : (
              <div className="text-xs text-gray-600">Aucune annonce bloquante à afficher</div>
            )}
          </div>

          {/* Acks */}
          <div className="mb-4 p-3 bg-green-50 rounded border border-green-300">
            <h3 className="font-bold text-sm text-green-900 mb-2">✅ MES ACKNOWLEDGEMENTS</h3>
            <div className="text-xs">
              <div><strong>Total:</strong> {myAcks.length}</div>
              {myAcks.length > 0 && (
                <div className="mt-1">
                  <strong>IDs:</strong> {Array.from(ackedIds).join(', ')}
                </div>
              )}
            </div>
          </div>

          {/* All Announcements */}
          <div className="p-3 bg-gray-50 rounded border border-gray-300">
            <h3 className="font-bold text-sm text-gray-900 mb-2">
              📋 TOUTES LES ANNONCES ({allAnnouncements.length})
            </h3>
            
            {allAnnouncements.length === 0 ? (
              <div className="text-xs text-gray-600">Aucune annonce trouvée</div>
            ) : (
              <div className="space-y-3">
                {allAnnouncements.map((ann, idx) => {
                  const startsAt = ann.starts_at ? new Date(ann.starts_at) : new Date(0);
                  const endsAt = ann.ends_at ? new Date(ann.ends_at) : new Date(new Date(ann.created_date).getTime() + 24 * 60 * 60 * 1000);
                  const isActive = now >= startsAt && now <= endsAt;
                  const isAcked = ackedIds.has(ann.id);
                  
                  // Check targeting
                  let isTargeted = false;
                  if (ann.audience_mode === 'tous') {
                    isTargeted = true;
                  } else if (ann.audience_mode === 'equipes') {
                    isTargeted = ann.audience_team_names?.includes(currentEmployee?.team);
                  } else if (ann.audience_mode === 'personnes') {
                    isTargeted = ann.audience_employee_ids?.includes(currentEmployee?.id);
                  }

                  return (
                    <div 
                      key={ann.id}
                      className={cn(
                        "p-3 rounded border text-xs",
                        isActive && isTargeted && !isAcked && ann.require_ack
                          ? "bg-red-100 border-red-400"
                          : "bg-white border-gray-300"
                      )}
                    >
                      <div className="font-bold mb-2">
                        #{idx + 1} - {ann.title}
                      </div>
                      <div className="space-y-1 text-[11px]">
                        <div><strong>ID:</strong> {ann.id}</div>
                        <div><strong>Severity:</strong> {ann.severity}</div>
                        <div><strong>Audience Mode:</strong> {ann.audience_mode}</div>
                        {ann.audience_team_names && (
                          <div><strong>Teams:</strong> {ann.audience_team_names.join(', ')}</div>
                        )}
                        {ann.audience_employee_ids && (
                          <div><strong>Employees:</strong> {ann.audience_employee_ids.length} personnes</div>
                        )}
                        <div><strong>Require Ack:</strong> {ann.require_ack ? '✅ OUI' : '❌ NON'}</div>
                        <div><strong>Starts At:</strong> {ann.starts_at ? new Date(ann.starts_at).toLocaleString('fr-FR') : 'Immédiat'}</div>
                        <div><strong>Ends At:</strong> {ann.ends_at ? new Date(ann.ends_at).toLocaleString('fr-FR') : 'N/A (défaut 24h)'}</div>
                        <div className="pt-2 border-t mt-2 space-y-1">
                          <div className={cn(
                            "font-bold",
                            isActive ? "text-green-700" : "text-red-700"
                          )}>
                            📅 Is Active (time): {isActive ? '✅ OUI' : '❌ NON'}
                          </div>
                          <div className={cn(
                            "font-bold",
                            isTargeted ? "text-green-700" : "text-orange-700"
                          )}>
                            🎯 Is Targeted: {isTargeted ? '✅ OUI' : '❌ NON'}
                          </div>
                          <div className={cn(
                            "font-bold",
                            isAcked ? "text-gray-600" : "text-blue-700"
                          )}>
                            ✅ Is Acked: {isAcked ? '✅ OUI' : '❌ NON'}
                          </div>
                          {isActive && isTargeted && !isAcked && ann.require_ack && (
                            <div className="text-red-700 font-bold text-xs mt-1">
                              ⚠️ DEVRAIT ÊTRE BLOQUANTE
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}