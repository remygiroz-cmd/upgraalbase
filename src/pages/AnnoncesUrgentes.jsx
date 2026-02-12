import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { AlertTriangle, AlertCircle, Info, Filter, Users, User, Clock, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function AnnoncesUrgentes() {
  const navigate = useNavigate();
  const [filterStatus, setFilterStatus] = useState('all'); // all | active | expired
  const [filterSeverity, setFilterSeverity] = useState('all'); // all | info | important | critique

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
  const canViewHistory = useMemo(() => {
    if (!currentEmployee) return false;
    return currentUser?.role === 'admin' || currentEmployee.permission_level === 'manager';
  }, [currentUser, currentEmployee]);

  // Get all urgent announcements
  const { data: allAnnouncements = [] } = useQuery({
    queryKey: ['allUrgentAnnouncements'],
    queryFn: () => base44.entities.UrgentAnnouncement.list(),
    enabled: canViewHistory
  });

  // Get all acks
  const { data: allAcks = [] } = useQuery({
    queryKey: ['allUrgentAnnouncementAcks'],
    queryFn: () => base44.entities.UrgentAnnouncementAck.list(),
    enabled: canViewHistory
  });

  // Process announcements with stats
  const processedAnnouncements = useMemo(() => {
    if (!allAnnouncements.length) return [];
    
    const now = new Date();
    const activeEmployees = employees.filter(e => e.is_active !== false);

    return allAnnouncements.map(ann => {
      // Determine if active
      const startsAt = ann.starts_at ? new Date(ann.starts_at) : new Date(0);
      const endsAt = ann.ends_at ? new Date(ann.ends_at) : new Date(new Date(ann.created_date).getTime() + 24 * 60 * 60 * 1000);
      const isActive = now >= startsAt && now <= endsAt;

      // Calculate targeted employees
      let targetedEmployees = [];
      if (ann.audience_mode === 'tous') {
        targetedEmployees = activeEmployees;
      } else if (ann.audience_mode === 'equipes') {
        targetedEmployees = activeEmployees.filter(emp => 
          ann.audience_team_names?.includes(emp.team)
        );
      } else if (ann.audience_mode === 'personnes') {
        targetedEmployees = activeEmployees.filter(emp => 
          ann.audience_employee_ids?.includes(emp.id)
        );
      }

      // Count readers
      const targetedIds = new Set(targetedEmployees.map(e => e.id));
      const readCount = allAcks.filter(ack => 
        ack.announcement_id === ann.id && targetedIds.has(ack.employee_id)
      ).length;

      return {
        ...ann,
        isActive,
        targetCount: targetedEmployees.length,
        readCount,
        startsAt,
        endsAt
      };
    }).sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
  }, [allAnnouncements, allAcks, employees]);

  // Apply filters
  const filteredAnnouncements = useMemo(() => {
    return processedAnnouncements.filter(ann => {
      if (filterStatus === 'active' && !ann.isActive) return false;
      if (filterStatus === 'expired' && ann.isActive) return false;
      if (filterSeverity !== 'all' && ann.severity !== filterSeverity) return false;
      return true;
    });
  }, [processedAnnouncements, filterStatus, filterSeverity]);

  const severityConfig = {
    critique: {
      icon: AlertTriangle,
      color: 'text-red-600',
      bgColor: 'bg-red-100',
      label: 'Critique'
    },
    important: {
      icon: AlertCircle,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
      label: 'Important'
    },
    info: {
      icon: Info,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      label: 'Info'
    }
  };

  const audienceModeLabels = {
    tous: 'Tous les employés',
    equipes: 'Équipes',
    personnes: 'Personnes'
  };

  if (!canViewHistory) {
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Annonces urgentes</h1>
          <p className="text-sm text-gray-600">Historique et statistiques de lecture</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Filtres :</span>
            </div>
            
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                <SelectItem value="active">Actives</SelectItem>
                <SelectItem value="expired">Expirées</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterSeverity} onValueChange={setFilterSeverity}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous niveaux</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="important">Important</SelectItem>
                <SelectItem value="critique">Critique</SelectItem>
              </SelectContent>
            </Select>

            <div className="ml-auto text-sm text-gray-600">
              {filteredAnnouncements.length} annonce{filteredAnnouncements.length > 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Announcements List */}
        <div className="space-y-3">
          {filteredAnnouncements.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
              <Info className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">Aucune annonce trouvée</p>
            </div>
          ) : (
            filteredAnnouncements.map(ann => {
              const config = severityConfig[ann.severity] || severityConfig.info;
              const Icon = config.icon;
              
              return (
                <button
                  key={ann.id}
                  onClick={() => navigate(createPageUrl('AnnouncementDetail') + '?id=' + ann.id)}
                  className="w-full bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow text-left"
                >
                  <div className="flex items-start gap-4">
                    {/* Severity indicator */}
                    <div className={cn("p-2 rounded-lg", config.bgColor)}>
                      <Icon className={cn("w-5 h-5", config.color)} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h3 className="font-semibold text-gray-900 text-lg">{ann.title}</h3>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {ann.isActive ? (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                              Active
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded">
                              Expirée
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="text-sm text-gray-600 line-clamp-2 mb-3">{ann.content}</p>

                      <div className="flex items-center gap-4 flex-wrap text-xs text-gray-500">
                        {/* Severity badge */}
                        <div className={cn("px-2 py-1 rounded font-medium", config.bgColor, config.color)}>
                          {config.label}
                        </div>

                        {/* Audience */}
                        <div className="flex items-center gap-1">
                          {ann.audience_mode === 'tous' ? (
                            <Users className="w-3 h-3" />
                          ) : (
                            <User className="w-3 h-3" />
                          )}
                          <span>{audienceModeLabels[ann.audience_mode]}</span>
                        </div>

                        {/* Period */}
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>
                            {ann.startsAt.toLocaleDateString('fr-FR')} → {ann.endsAt.toLocaleDateString('fr-FR')}
                          </span>
                        </div>

                        {/* Read stats */}
                        <div className="flex items-center gap-1 font-medium">
                          <CheckCircle className="w-3 h-3 text-green-600" />
                          <span className="text-green-600">
                            {ann.readCount}/{ann.targetCount}
                          </span>
                          <span className="text-gray-500">ont lu</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}