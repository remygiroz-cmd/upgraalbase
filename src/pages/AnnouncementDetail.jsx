import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ArrowLeft, AlertTriangle, AlertCircle, Info, Users, User, Clock, CheckCircle, XCircle, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function AnnouncementDetail() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const announcementId = urlParams.get('id');

  // Get current user and employee
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['allEmployees'],
    queryFn: () => base44.entities.Employee.list()
  });

  const currentEmployee = useMemo(() => {
    if (!currentUser?.email || !employees.length) return null;
    const normalizeEmail = (email) => email?.trim().toLowerCase() || '';
    return employees.find(emp => normalizeEmail(emp.email) === normalizeEmail(currentUser.email));
  }, [currentUser, employees]);

  // Check permissions
  const canView = useMemo(() => {
    if (!currentEmployee) return false;
    return currentUser?.role === 'admin' || currentEmployee.permission_level === 'manager';
  }, [currentUser, currentEmployee]);

  // Get announcement
  const { data: announcements = [] } = useQuery({
    queryKey: ['allUrgentAnnouncements'],
    queryFn: () => base44.entities.UrgentAnnouncement.list(),
    enabled: canView && !!announcementId
  });

  const announcement = announcements.find(a => a.id === announcementId);

  // Get all acks for this announcement
  const { data: allAcks = [] } = useQuery({
    queryKey: ['allUrgentAnnouncementAcks'],
    queryFn: () => base44.entities.UrgentAnnouncementAck.list(),
    enabled: canView && !!announcementId
  });

  const announcementAcks = useMemo(() => {
    return allAcks.filter(ack => ack.announcement_id === announcementId);
  }, [allAcks, announcementId]);

  // Calculate stats
  const stats = useMemo(() => {
    if (!announcement || !employees.length) return null;

    const activeEmployees = employees.filter(e => e.is_active !== false);
    let targetedEmployees = [];

    if (announcement.audience_mode === 'tous') {
      targetedEmployees = activeEmployees;
    } else if (announcement.audience_mode === 'equipes') {
      targetedEmployees = activeEmployees.filter(emp => 
        announcement.audience_team_names?.includes(emp.team)
      );
    } else if (announcement.audience_mode === 'personnes') {
      targetedEmployees = activeEmployees.filter(emp => 
        announcement.audience_employee_ids?.includes(emp.id)
      );
    }

    const targetedIds = new Set(targetedEmployees.map(e => e.id));
    const ackedIds = new Set(announcementAcks.map(ack => ack.employee_id));

    const readers = targetedEmployees.filter(emp => ackedIds.has(emp.id));
    const nonReaders = targetedEmployees.filter(emp => !ackedIds.has(emp.id));

    // Get ack details
    const readerDetails = readers.map(emp => {
      const ack = announcementAcks.find(a => a.employee_id === emp.id);
      return { employee: emp, ack };
    }).sort((a, b) => {
      if (!a.ack?.acknowledged_at) return 1;
      if (!b.ack?.acknowledged_at) return -1;
      return new Date(b.ack.acknowledged_at) - new Date(a.ack.acknowledged_at);
    });

    return {
      totalTargeted: targetedEmployees.length,
      readCount: readers.length,
      nonReadCount: nonReaders.length,
      readers: readerDetails,
      nonReaders
    };
  }, [announcement, employees, announcementAcks]);

  const severityConfig = {
    critique: {
      icon: AlertTriangle,
      color: 'text-red-600',
      bgColor: 'bg-red-100',
      borderColor: 'border-red-300',
      label: 'Critique'
    },
    important: {
      icon: AlertCircle,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
      borderColor: 'border-orange-300',
      label: 'Important'
    },
    info: {
      icon: Info,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      borderColor: 'border-blue-300',
      label: 'Info'
    }
  };

  const audienceModeLabels = {
    tous: 'Tous les employés',
    equipes: 'Équipes spécifiques',
    personnes: 'Personnes spécifiques'
  };

  if (!canView) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Accès refusé</h2>
          <p className="text-gray-600">Seuls les administrateurs et managers peuvent accéder à cette page.</p>
        </div>
      </div>
    );
  }

  if (!announcement || !stats) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const config = severityConfig[announcement.severity] || severityConfig.info;
  const Icon = config.icon;
  const now = new Date();
  const startsAt = announcement.starts_at ? new Date(announcement.starts_at) : new Date(0);
  const endsAt = announcement.ends_at ? new Date(announcement.ends_at) : new Date(new Date(announcement.created_date).getTime() + 24 * 60 * 60 * 1000);
  const isActive = now >= startsAt && now <= endsAt;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(createPageUrl('AnnoncesUrgentes'))}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Détail de l'annonce</h1>
              <p className="text-sm text-gray-600">Statistiques de lecture</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Announcement Card */}
        <div className={cn("bg-white rounded-lg shadow-sm border-2 p-6", config.borderColor)}>
          <div className="flex items-start gap-4 mb-4">
            <div className={cn("p-3 rounded-lg", config.bgColor)}>
              <Icon className={cn("w-6 h-6", config.color)} />
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h2 className="text-2xl font-bold text-gray-900">{announcement.title}</h2>
                {isActive ? (
                  <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full flex-shrink-0">
                    Active
                  </span>
                ) : (
                  <span className="px-3 py-1 bg-gray-100 text-gray-600 text-sm font-medium rounded-full flex-shrink-0">
                    Expirée
                  </span>
                )}
              </div>
              <div className={cn("inline-block px-3 py-1 rounded font-medium text-sm", config.bgColor, config.color)}>
                {config.label}
              </div>
            </div>
          </div>

          <div className="prose prose-sm max-w-none mb-6">
            <p className="text-gray-700 whitespace-pre-wrap">{announcement.content}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              {announcement.audience_mode === 'tous' ? (
                <Users className="w-4 h-4" />
              ) : (
                <User className="w-4 h-4" />
              )}
              <span className="font-medium">Ciblage :</span>
              <span>{audienceModeLabels[announcement.audience_mode]}</span>
            </div>

            {announcement.audience_mode === 'equipes' && announcement.audience_team_names?.length > 0 && (
              <div className="text-sm text-gray-600">
                <span className="font-medium">Équipes :</span>{' '}
                {announcement.audience_team_names.join(', ')}
              </div>
            )}

            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Calendar className="w-4 h-4" />
              <span className="font-medium">Début :</span>
              <span>{startsAt.toLocaleString('fr-FR')}</span>
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Clock className="w-4 h-4" />
              <span className="font-medium">Fin :</span>
              <span>{endsAt.toLocaleString('fr-FR')}</span>
            </div>
          </div>
        </div>

        {/* Stats Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Statistiques de lecture</h3>
          
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-blue-600">{stats.totalTargeted}</div>
              <div className="text-sm text-gray-600 mt-1">Destinataires</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-green-600">{stats.readCount}</div>
              <div className="text-sm text-gray-600 mt-1">Ont lu</div>
            </div>
            <div className="bg-orange-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-orange-600">{stats.nonReadCount}</div>
              <div className="text-sm text-gray-600 mt-1">N'ont pas lu</div>
            </div>
          </div>

          <div className="mb-2">
            <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
              <span>Taux de lecture</span>
              <span className="font-medium">
                {stats.totalTargeted > 0 
                  ? Math.round((stats.readCount / stats.totalTargeted) * 100) 
                  : 0}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-green-600 h-2 rounded-full transition-all"
                style={{ 
                  width: `${stats.totalTargeted > 0 
                    ? (stats.readCount / stats.totalTargeted) * 100 
                    : 0}%` 
                }}
              />
            </div>
          </div>
        </div>

        {/* Readers List */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-900">
              Ont lu ({stats.readCount})
            </h3>
          </div>
          
          {stats.readers.length === 0 ? (
            <p className="text-sm text-gray-500 italic">Personne n'a encore lu cette annonce</p>
          ) : (
            <div className="space-y-2">
              {stats.readers.map(({ employee, ack }) => (
                <div 
                  key={employee.id}
                  className="flex items-center justify-between p-3 bg-green-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-semibold text-sm">
                      {employee.first_name?.charAt(0)}{employee.last_name?.charAt(0)}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">
                        {employee.first_name} {employee.last_name}
                      </div>
                      <div className="text-xs text-gray-600">{employee.position}</div>
                    </div>
                  </div>
                  {ack?.acknowledged_at && (
                    <div className="text-xs text-gray-500">
                      {new Date(ack.acknowledged_at).toLocaleString('fr-FR')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Non-Readers List */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <XCircle className="w-5 h-5 text-orange-600" />
            <h3 className="text-lg font-semibold text-gray-900">
              N'ont pas lu ({stats.nonReadCount})
            </h3>
          </div>
          
          {stats.nonReaders.length === 0 ? (
            <p className="text-sm text-green-600 font-medium">✓ Tous les destinataires ont lu cette annonce</p>
          ) : (
            <div className="space-y-2">
              {stats.nonReaders.map(employee => (
                <div 
                  key={employee.id}
                  className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg"
                >
                  <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-semibold text-sm">
                    {employee.first_name?.charAt(0)}{employee.last_name?.charAt(0)}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">
                      {employee.first_name} {employee.last_name}
                    </div>
                    <div className="text-xs text-gray-600">{employee.position}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}