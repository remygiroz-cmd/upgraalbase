import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { isCurrentUserPlanningManager } from '@/components/planning/utils/getPlanningManager';
import LeaveRequestNotification from '@/components/planning/LeaveRequestNotification';
import ShiftSwapNotification from '@/components/planning/ShiftSwapNotification';
import { Card } from '@/components/ui/card';
import { Trash2, Plus, MessageCircle, Bell, RefreshCw, AtSign, Megaphone, Users, Circle, ArrowRight, ArchiveRestore } from 'lucide-react';
import { toast } from 'sonner';
import TodaySummary from '@/components/planning/TodaySummary';
import { formatLocalDate } from '@/components/planning/dateUtils';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import AnnouncementsList from '@/components/messaging/AnnouncementsList';
import ConversationsList from '@/components/messaging/ConversationsList';
import NewConversationModal from '@/components/messaging/NewConversationModal';
import UrgentAnnouncementModal from '@/components/messaging/UrgentAnnouncementModal';
import CreateUrgentAnnouncementModal from '@/components/messaging/CreateUrgentAnnouncementModal';
import { cn } from '@/lib/utils';
import { calculatePresenceStatus } from '@/components/utils/presenceUtils';
import { perfFetch } from '@/components/utils/perfLogger';
import { getActiveShiftsForMonth } from '@/components/planning/shiftService';
import DepartureOrderPlanningBlock from '@/components/planning/DepartureOrderPlanningBlock';
import HomeVehicleAlertsWidget from '@/components/vehicules/HomeVehicleAlertsWidget';
import { QK, STALE } from '@/components/utils/queryKeys';

export default function Home() {
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [initializingConversations, setInitializingConversations] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'mentions'
  const [showCreateUrgentAnnouncement, setShowCreateUrgentAnnouncement] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Get current user
  const { data: currentUser } = useQuery({
    queryKey: QK.currentUser(),
    queryFn: () => perfFetch('currentUser', () => base44.auth.me()),
    staleTime: STALE.STABLE,
  });

  // Get current employee record — active only
  const { data: employees = [] } = useQuery({
    queryKey: QK.employees(),
    queryFn: () => perfFetch('employees', () => base44.entities.Employee.filter({ is_active: true })),
    enabled: !!currentUser,
    staleTime: STALE.STABLE,
  });

  const currentEmployee = useMemo(() => {
    if (!currentUser?.email || !employees.length) return null;
    const normalizeEmail = (email) => email?.trim().toLowerCase() || '';
    return employees.find(emp => normalizeEmail(emp.email) === normalizeEmail(currentUser.email));
  }, [currentUser, employees]);

  // Get active announcements
  const { data: announcements = [] } = useQuery({
    queryKey: QK.announcements(),
    queryFn: async () => {
      const now = new Date().toISOString();
      const all = await perfFetch('announcements', () => base44.entities.Announcement.filter({ is_active: true }, '-created_date', 50));
      return all
        .filter(a => {
          const startsOk = !a.starts_at || new Date(a.starts_at) <= new Date(now);
          const endsOk = !a.ends_at || new Date(a.ends_at) > new Date(now);
          return startsOk && endsOk;
        })
        .sort((a, b) => {
          if (a.is_pinned !== b.is_pinned) return b.is_pinned ? 1 : -1;
          return new Date(b.created_date) - new Date(a.created_date);
        });
    },
    enabled: !!currentEmployee,
    staleTime: STALE.NOTIFICATIONS,
  });

  // Data fetching for current month
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  // Fetch current planning version
  const { data: planningMonth } = useQuery({
    queryKey: QK.planningMonth(currentYear, currentMonth),
    queryFn: async () => {
      const months = await perfFetch('planningMonth', () => base44.entities.PlanningMonth.filter({ month_key: monthKey }), { monthKey });
      return months[0] || null;
    },
    enabled: !!currentEmployee,
    staleTime: STALE.PLANNING,
  });

  const resetVersion = planningMonth?.reset_version ?? 0;

  // Fetch shifts for CURRENT MONTH — filtrés côté serveur (month_key + reset_version)
  const { data: currentMonthShifts = [] } = useQuery({
    queryKey: QK.shifts(currentYear, currentMonth, resetVersion),
    queryFn: () => perfFetch('Home:shifts', () => getActiveShiftsForMonth(monthKey, resetVersion), { monthKey, resetVersion }),
    enabled: !!currentEmployee && resetVersion !== undefined,
    staleTime: STALE.SHIFTS,
    // Pas de refetchInterval sur Home — le planning est la source de vérité
  });

  // Fetch non-shift events for CURRENT MONTH
  const { data: currentMonthNonShiftEvents = [] } = useQuery({
    queryKey: QK.nonShiftEvents(currentYear, currentMonth, resetVersion),
    queryFn: async () => {
      const allEvents = await perfFetch('Home:nonShiftEvents', () => base44.entities.NonShiftEvent.filter({ month_key: monthKey }), { monthKey, resetVersion });
      return allEvents.filter(e => (e.reset_version ?? 0) >= resetVersion);
    },
    enabled: !!currentEmployee && resetVersion !== undefined,
    staleTime: STALE.SHIFTS,
  });

  // Teams — données stables partagées avec Planning (même queryKey → cache commun)
  const { data: allTeams = [] } = useQuery({
    queryKey: QK.teams(),
    queryFn: () => perfFetch('teams', () => base44.entities.Team.filter({ is_active: true })),
    enabled: !!currentEmployee,
    staleTime: STALE.STABLE,
  });

  // Non-shift types — données stables
  const { data: nonShiftTypes = [] } = useQuery({
    queryKey: QK.nonShiftTypes(),
    queryFn: async () => {
      const types = await base44.entities.NonShiftType.filter({ is_active: true });
      return types.sort((a, b) => (a.order || 0) - (b.order || 0));
    },
    enabled: !!currentEmployee,
    staleTime: STALE.STABLE,
  });

  // Weekly recaps for current month
  const { data: allWeeklyRecaps = [] } = useQuery({
    queryKey: QK.weeklyRecaps(monthKey, resetVersion),
    queryFn: async () => {
      const all = await base44.entities.WeeklyRecap.filter({ month_key: monthKey });
      return all.filter(wr => (wr.reset_version ?? 0) >= resetVersion);
    },
    enabled: !!currentEmployee,
    staleTime: STALE.PLANNING,
  });

  // Holiday dates — très stables
  const { data: holidayDates = [] } = useQuery({
    queryKey: QK.holidayDates(currentYear, currentMonth),
    queryFn: async () => {
      const firstDay = formatLocalDate(new Date(currentYear, currentMonth, 1));
      const lastDay = formatLocalDate(new Date(currentYear, currentMonth + 1, 0));
      const all = await base44.entities.HolidayDate.filter({ year: currentYear }, 'date', 50);
      return all.filter(h => h.date >= firstDay && h.date <= lastDay);
    },
    enabled: !!currentEmployee,
    staleTime: STALE.HOLIDAYS,
  });

  // Positions — données stables
  const { data: positions = [] } = useQuery({
    queryKey: QK.positions(),
    queryFn: async () => {
      const all = await base44.entities.Position.filter({ is_active: true });
      return all.sort((a, b) => (a.order || 0) - (b.order || 0));
    },
    enabled: !!currentEmployee,
    staleTime: STALE.STABLE,
  });

  // Employee filtering — Home only needs active employees (already filtered by server)
  const sortedEmployees = useMemo(() => {
    if (!employees.length || !allTeams.length) return [];

    // Home affiche toujours le mois courant — employés actifs (déjà filtrés par le serveur)
    return [...employees].sort((a, b) => {
      const teamA = allTeams.find(t => t.id === a.team_id);
      const teamB = allTeams.find(t => t.id === b.team_id);
      
      const orderA = teamA?.order ?? 999;
      const orderB = teamB?.order ?? 999;
      
      if (orderA !== orderB) return orderA - orderB;
      
      // Same team, sort by name
      return (a.first_name || '').localeCompare(b.first_name || '');
    });
  }, [employees, allTeams]);

  // Get conversation members for current employee
  const { data: myConversationMembers = [] } = useQuery({
    queryKey: QK.conversationMembers(currentEmployee?.id),
    queryFn: () => perfFetch('conversationMembers', () => base44.entities.ConversationMember.filter({ 
      employee_id: currentEmployee.id 
    })),
    enabled: !!currentEmployee?.id,
    staleTime: STALE.LIVE,
    refetchOnMount: true,
  });

  // Get conversations — filtrées côté serveur sur status actif, limitées aux 60 plus récentes
  const { data: allConversations = [] } = useQuery({
    queryKey: QK.conversations(currentEmployee?.id),
    queryFn: async () => {
      if (!currentEmployee?.id) return [];
      const all = await base44.entities.Conversation.filter({ status: 'active' }, '-last_message_at', 60);
      return all
        .filter(conv => {
          if (conv.type === 'entreprise') return true;
          return conv.participant_employee_ids?.includes(currentEmployee.id);
        })
        .sort((a, b) => {
          const aTime = a.last_message_at ? new Date(a.last_message_at) : new Date(a.created_date);
          const bTime = b.last_message_at ? new Date(b.last_message_at) : new Date(b.created_date);
          return bTime - aTime;
        });
    },
    enabled: !!currentEmployee?.id,
    staleTime: STALE.LIVE,
    refetchOnMount: true,
  });

  // Split into active, archived, hidden (deleted for me), and left
  const conversations = useMemo(() => {
    return allConversations.filter(conv => {
      const member = myConversationMembers.find(m => m.conversation_id === conv.id);
      
      // Hide if explicitly hidden (deleted for me)
      if (member?.is_hidden) return false;
      
      // Hide if left
      if (member?.left_at) return false;
      
      // Hide if archived (old system)
      if (conv.archived_by_employee_ids?.includes(currentEmployee?.id)) return false;
      
      return true;
    }).slice(0, 30);
  }, [allConversations, currentEmployee?.id, myConversationMembers]);

  const archivedConversations = useMemo(() => {
    return allConversations.filter(conv => {
      const member = myConversationMembers.find(m => m.conversation_id === conv.id);
      
      // Only show archived if not hidden and not left
      if (member?.is_hidden || member?.left_at) return false;
      
      return conv.archived_by_employee_ids?.includes(currentEmployee?.id);
    });
  }, [allConversations, currentEmployee?.id, myConversationMembers]);

  const hiddenConversations = useMemo(() => {
    return allConversations.filter(conv => {
      const member = myConversationMembers.find(m => m.conversation_id === conv.id);
      return member?.is_hidden && conv.status === 'active';
    });
  }, [allConversations, myConversationMembers]);

  const leftConversations = useMemo(() => {
    return allConversations.filter(conv => {
      const member = myConversationMembers.find(m => m.conversation_id === conv.id);
      return member?.left_at && !member?.is_hidden;
    });
  }, [allConversations, myConversationMembers]);

  // Get all messages — limité aux 300 plus récents pour le décompte non-lus
  const { data: allMessages = [] } = useQuery({
    queryKey: QK.messages(),
    queryFn: () => perfFetch('messages', () => base44.entities.Message.filter({ is_deleted: false }, '-created_date', 300)),
    enabled: !!currentEmployee?.id,
    staleTime: STALE.LIVE,
    refetchOnMount: true,
  });

  // Get message reads
  const { data: messageReads = [] } = useQuery({
    queryKey: QK.messageReads(currentEmployee?.id),
    queryFn: () => perfFetch('messageReads', () => base44.entities.MessageRead.filter({ employee_id: currentEmployee.id })),
    enabled: !!currentEmployee?.id,
    staleTime: STALE.LIVE,
    refetchOnMount: true,
  });

  // Get mentions for current user
  const { data: myMentions = [] } = useQuery({
    queryKey: QK.mentions(currentEmployee?.id),
    queryFn: () => base44.entities.MessageMention.filter({ mentioned_employee_id: currentEmployee.id }),
    enabled: !!currentEmployee?.id,
    staleTime: STALE.LIVE,
    refetchOnMount: true,
  });

  // Calculate unread counts
  const unreadCounts = useMemo(() => {
    if (!currentEmployee?.id) return {};
    
    const readMessageIds = new Set(messageReads.map(mr => mr.message_id));
    const counts = {};
    
    conversations.forEach(conv => {
      const convMessages = allMessages.filter(m => 
        m.conversation_id === conv.id && 
        m.sender_employee_id !== currentEmployee.id &&
        !m.is_deleted
      );
      
      counts[conv.id] = convMessages.filter(m => !readMessageIds.has(m.id)).length;
    });
    
    return counts;
  }, [conversations, allMessages, messageReads, currentEmployee?.id]);

  const totalUnread = useMemo(() => {
    return Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);
  }, [unreadCounts]);

  // Calculate unread mentions count
  const unreadMentionsCount = useMemo(() => {
    if (!myMentions.length || !messageReads.length) return 0;
    
    const readMessageIds = new Set(messageReads.map(mr => mr.message_id));
    return myMentions.filter(m => !readMessageIds.has(m.message_id)).length;
  }, [myMentions, messageReads]);

  // Filter conversations with unread mentions
  const conversationsWithMentions = useMemo(() => {
    if (!myMentions.length || filterMode !== 'mentions') return [];
    
    const readMessageIds = new Set(messageReads.map(mr => mr.message_id));
    const unreadMentionConvIds = new Set(
      myMentions
        .filter(m => !readMessageIds.has(m.message_id))
        .map(m => m.conversation_id)
    );
    
    return conversations.filter(conv => unreadMentionConvIds.has(conv.id));
  }, [myMentions, messageReads, conversations, filterMode]);

  // Get leave requests for manager
  const { data: pendingLeaveRequests = [] } = useQuery({
    queryKey: QK.pendingLeaveRequests(),
    queryFn: () => base44.entities.LeaveRequest.filter({ status: 'PENDING' }),
    staleTime: STALE.DECISIONS,
  });

  // Get my leave request decisions — filtrées côté serveur par employee_id
  const { data: myLeaveRequestDecisions = [] } = useQuery({
    queryKey: QK.myLeaveRequestDecisions(currentEmployee?.id),
    queryFn: async () => {
      if (!currentEmployee?.id) return [];
      const requests = await base44.entities.LeaveRequest.filter(
        { employee_id: currentEmployee.id },
        '-decision_at',
        20
      );
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      return requests.filter(req => 
        req.status !== 'PENDING' &&
        new Date(req.decision_at) > cutoff &&
        !(req.dismissed_by_employee_ids || []).includes(currentEmployee.id)
      ).sort((a, b) => new Date(b.decision_at) - new Date(a.decision_at));
    },
    enabled: !!currentEmployee?.id,
    staleTime: STALE.DECISIONS,
  });

  const dismissDecisionMutation = useMutation({
    mutationFn: async (requestId) => {
      const request = myLeaveRequestDecisions.find(r => r.id === requestId);
      const dismissedIds = request.dismissed_by_employee_ids || [];
      if (!dismissedIds.includes(currentEmployee.id)) {
        dismissedIds.push(currentEmployee.id);
      }
      return await base44.entities.LeaveRequest.update(requestId, {
        dismissed_by_employee_ids: dismissedIds
      });
    },
    onMutate: async (requestId) => {
      await queryClient.cancelQueries({ queryKey: ['myLeaveRequestDecisions'] });
      const previousData = queryClient.getQueryData(['myLeaveRequestDecisions', currentEmployee?.id]);
      queryClient.setQueryData(['myLeaveRequestDecisions', currentEmployee?.id], old => 
        old?.filter(req => req.id !== requestId) || []
      );
      return { previousData };
    },
    onError: (err, requestId, context) => {
      queryClient.setQueryData(['myLeaveRequestDecisions', currentEmployee?.id], context.previousData);
      toast.error('Erreur lors du masquage');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['myLeaveRequestDecisions'] });
    }
  });

  // Get urgent announcements — filtrées côté serveur par is_active
  const { data: urgentAnnouncements = [] } = useQuery({
    queryKey: QK.urgentAnnouncements(),
    queryFn: async () => {
      const all = await perfFetch('urgentAnnouncements', () => base44.entities.UrgentAnnouncement.filter({ is_active: true }, '-created_date', 20));
      const now = new Date();
      const activeAnnouncements = all.filter(ann => {
        const startsAt = ann.starts_at ? new Date(ann.starts_at) : new Date(0);
        const startsOk = now >= startsAt;
        let endsAt;
        if (ann.ends_at) {
          endsAt = new Date(ann.ends_at);
        } else {
          endsAt = new Date(new Date(ann.created_date).getTime() + 24 * 60 * 60 * 1000);
        }
        const endsOk = now <= endsAt;
        return startsOk && endsOk;
      });
      const severityOrder = { critique: 3, important: 2, info: 1 };
      activeAnnouncements.sort((a, b) => {
        const severityDiff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
        if (severityDiff !== 0) return severityDiff;
        return new Date(b.created_date) - new Date(a.created_date);
      });
      return activeAnnouncements;
    },
    enabled: !!currentEmployee?.id,
    staleTime: STALE.NOTIFICATIONS,
    refetchOnMount: true,
  });

  // Get acks for current employee
  const { data: myAcks = [] } = useQuery({
    queryKey: QK.urgentAnnouncementAcks(currentEmployee?.id),
    queryFn: () => base44.entities.UrgentAnnouncementAck.filter({ 
      employee_id: currentEmployee.id 
    }),
    enabled: !!currentEmployee?.id,
    staleTime: STALE.NOTIFICATIONS,
    refetchOnMount: true,
  });

  // Find unacknowledged urgent announcement for current employee
  const urgentAnnouncementToShow = useMemo(() => {
    if (!currentEmployee || !urgentAnnouncements.length) return null;
    
    const ackedIds = new Set(myAcks.map(ack => ack.announcement_id));
    
    const visibleAnnouncements = urgentAnnouncements.filter(ann => {
      if (ackedIds.has(ann.id)) return false;
      if (!ann.require_ack) return false;
      
      if (ann.audience_mode === 'tous') return true;
      if (ann.audience_mode === 'equipes') {
        return ann.audience_team_names?.includes(currentEmployee.team);
      }
      if (ann.audience_mode === 'personnes') {
        return ann.audience_employee_ids?.includes(currentEmployee.id);
      }
      
      return false;
    });
    
    return visibleAnnouncements[0] || null;
  }, [currentEmployee, urgentAnnouncements, myAcks]);

  const canCreateUrgentAnnouncement = useMemo(() => {
    if (!currentEmployee) return false;
    return currentUser?.role === 'admin' || currentEmployee.permission_level === 'manager';
  }, [currentUser, currentEmployee]);

  // Get user role (for gérant detection)
  const { data: userRole } = useQuery({
    queryKey: ['userRole', currentUser?.role_id],
    queryFn: async () => {
      if (!currentUser?.role_id) return null;
      const roles = await base44.entities.Role.filter({ id: currentUser.role_id });
      return roles[0] || null;
    },
    enabled: !!currentUser?.role_id
  });

  // Check if current user is planning manager
  const { data: isPlanningManager = false } = useQuery({
    queryKey: ['isPlanningManager', currentUser?.email],
    queryFn: () => isCurrentUserPlanningManager(currentUser),
    enabled: !!currentUser
  });

  // Filter pending leave requests for current user if they are planning manager
  const myPendingLeaveRequests = isPlanningManager ? pendingLeaveRequests : [];

  // Pending shift swap requests for manager
  const { data: pendingSwapRequests = [] } = useQuery({
    queryKey: ['shiftSwapRequests', 'PENDING'],
    queryFn: () => base44.entities.ShiftSwapRequest.filter({ status: 'PENDING' }),
    enabled: !!isPlanningManager,
    staleTime: 0
  });
  const myPendingSwapRequests = isPlanningManager ? pendingSwapRequests : [];

  // My swap decisions (as employee A or B) — deux requêtes filtrées côté serveur
  const { data: mySwapDecisions = [] } = useQuery({
    queryKey: ['mySwapDecisions', currentEmployee?.id],
    queryFn: async () => {
      if (!currentEmployee?.id) return [];
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const [asA, asB] = await Promise.all([
        base44.entities.ShiftSwapRequest.filter({ employee_a_id: currentEmployee.id }, '-decided_at', 20),
        base44.entities.ShiftSwapRequest.filter({ employee_b_id: currentEmployee.id }, '-decided_at', 20)
      ]);
      const combined = [...asA, ...asB];
      // Dedupe by id
      const seen = new Set();
      return combined
        .filter(r => {
          if (seen.has(r.id)) return false;
          seen.add(r.id);
          return r.status !== 'PENDING' &&
            r.status !== 'CANCELED' &&
            new Date(r.decided_at) > cutoff &&
            !(r.dismissed_by_employee_ids || []).includes(currentEmployee.id);
        })
        .sort((a, b) => new Date(b.decided_at) - new Date(a.decided_at));
    },
    enabled: !!currentEmployee?.id
  });

  const isManagerOrAdmin = useMemo(() => {
    if (!currentEmployee) return false;
    const roleName = (userRole?.name || '').toLowerCase();
    const isGerant = ['responsable', 'gérant', 'gerant', 'manager', 'bureau'].some(r => roleName.includes(r));
    return currentUser?.role === 'admin' || currentEmployee.permission_level === 'manager' || isGerant;
  }, [currentUser, currentEmployee, userRole]);

  // Get urgent announcements history for managers — limité aux 50 plus récentes
  const { data: allUrgentAnnouncements = [] } = useQuery({
    queryKey: ['allUrgentAnnouncements'],
    queryFn: () => base44.entities.UrgentAnnouncement.list('-created_date', 50),
    enabled: isManagerOrAdmin,
    staleTime: 60000
  });

  // Get online employees count for managers
  const onlineEmployeesCount = useMemo(() => {
    if (!employees.length) return 0;
    return employees.filter(emp => {
      const presence = calculatePresenceStatus(emp.last_seen_at);
      return presence.status === 'online';
    }).length;
  }, [employees]);

  // Auto-initialize system conversations on first load
  useEffect(() => {
    const initConversations = async () => {
      if (!currentEmployee?.id) return;
      
      const hasInitialized = sessionStorage.getItem('conversations_initialized');
      if (hasInitialized) return;

      // Add employee to conversations
      try {
        await base44.functions.invoke('addEmployeeToConversations', {
          employeeId: currentEmployee.id
        });
        sessionStorage.setItem('conversations_initialized', 'true');
      } catch (error) {
        console.error('Failed to initialize conversations:', error);
      }
    };

    initConversations();
  }, [currentEmployee?.id]);

  const handleInitializeConversations = async () => {
    setInitializingConversations(true);
    try {
      const { data } = await base44.functions.invoke('initializeSystemConversations', {});
      toast.success('Conversations système créées');
      
      // Refetch conversations
      await queryClient.invalidateQueries({ queryKey: ['myConversations'] });
    } catch (error) {
      toast.error('Erreur lors de l\'initialisation');
    } finally {
      setInitializingConversations(false);
    }
  };

  if (!currentEmployee) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Accueil</h1>
              <p className="text-sm text-gray-600">
                Bonjour {currentEmployee.first_name} 👋
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canCreateUrgentAnnouncement && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreateUrgentAnnouncement(true)}
                  className="text-xs"
                  title="Créer une annonce urgente"
                >
                  <Megaphone className="w-4 h-4" />
                </Button>
              )}
              {currentUser?.role === 'admin' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleInitializeConversations}
                  disabled={initializingConversations}
                  className="text-xs"
                  title="Créer les conversations système"
                >
                  <RefreshCw className={cn("w-4 h-4", initializingConversations && "animate-spin")} />
                </Button>
              )}
              {totalUnread > 0 && (
                <div className="relative">
                  <Bell className="w-6 h-6 text-gray-600" />
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {totalUnread > 9 ? '9+' : totalUnread}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Departure Order Block — calcul live identique au planning */}
        {isManagerOrAdmin && (
          <DepartureOrderPlanningBlock
            date={formatLocalDate(new Date())}
            monthKey={monthKey}
            shifts={currentMonthShifts}
            employees={sortedEmployees}
            nonShiftEvents={currentMonthNonShiftEvents}
            nonShiftTypes={nonShiftTypes}
            holidayDates={holidayDates}
            weeklyRecaps={allWeeklyRecaps}
            currentUser={currentUser}
          />
        )}

        {/* Vehicle Alerts Widget - managers only */}
        {isManagerOrAdmin && <HomeVehicleAlertsWidget />}

        {/* Today's Staff Summary - EXACT same as Planning */}
        {currentEmployee && sortedEmployees.length > 0 && (
          <TodaySummary
            shifts={currentMonthShifts}
            nonShiftEvents={currentMonthNonShiftEvents}
            nonShiftTypes={nonShiftTypes}
            employees={sortedEmployees}
            positions={positions}
          />
        )}

        {/* Leave Request Decisions for Employee */}
        {myLeaveRequestDecisions.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
              📝 Mes demandes de CP
            </h2>
            <div className="space-y-3">
              {myLeaveRequestDecisions.map(decision => (
                <Card key={decision.id} className={cn(
                  "p-4 relative group",
                  decision.status === 'APPROVED' ? "bg-green-50 border-green-300" : "bg-red-50 border-red-300"
                )}>
                  <button
                    onClick={() => dismissDecisionMutation.mutate(decision.id)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-gray-200/50"
                    title="Masquer cette notification"
                  >
                    <Trash2 className="w-4 h-4 text-gray-500" />
                  </button>
                  
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                      decision.status === 'APPROVED' ? "bg-green-600" : "bg-red-600"
                    )}>
                      <span className="text-white text-xl">
                        {decision.status === 'APPROVED' ? '✓' : '✗'}
                      </span>
                    </div>
                    
                    <div className="flex-1">
                      <h3 className={cn(
                        "font-bold text-sm mb-1",
                        decision.status === 'APPROVED' ? "text-green-900" : "text-red-900"
                      )}>
                        {decision.status === 'APPROVED' ? 'Demande acceptée' : 'Demande refusée'}
                      </h3>
                      
                      <p className="text-sm text-gray-700">
                        Du {new Date(decision.start_cp).toLocaleDateString('fr-FR')} au {new Date(decision.end_cp).toLocaleDateString('fr-FR')}
                      </p>
                      
                      {decision.status === 'APPROVED' && (
                        <p className="text-sm font-semibold text-green-700 mt-1">
                          {decision.cp_days_computed} jours de CP décomptés
                        </p>
                      )}
                      
                      {decision.status === 'REJECTED' && decision.rejection_reason && (
                        <div className="mt-2 bg-white/50 rounded p-2 text-xs text-gray-700">
                          <strong>Motif:</strong> {decision.rejection_reason}
                        </div>
                      )}
                      
                      <p className="text-xs text-gray-500 mt-2">
                        Décision le {new Date(decision.decision_at).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Shift Swap Decisions for Employee */}
        {mySwapDecisions.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
              🔄 Mes échanges de shift
            </h2>
            <div className="space-y-3">
              {mySwapDecisions.map(req => (
                <ShiftSwapNotification
                  key={req.id}
                  request={req}
                  currentEmployee={currentEmployee}
                  mode="employee"
                />
              ))}
            </div>
          </div>
        )}

        {/* Shift Swap Requests for Manager */}
        {myPendingSwapRequests.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
              🔄 Demandes d'échange à valider
            </h2>
            <div className="space-y-3">
              {myPendingSwapRequests.map(req => (
                <ShiftSwapNotification
                  key={req.id}
                  request={req}
                  currentEmployee={currentEmployee}
                  mode="manager"
                />
              ))}
            </div>
          </div>
        )}

        {/* Leave Requests for Manager */}
        {myPendingLeaveRequests.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
              📋 Demandes de CP à valider
            </h2>
            <div className="space-y-3">
              {myPendingLeaveRequests.map(request => (
                <LeaveRequestNotification
                  key={request.id}
                  request={request}
                  onDismiss={() => {
                    queryClient.invalidateQueries({ queryKey: ['pendingLeaveRequests'] });
                    queryClient.invalidateQueries({ queryKey: ['myLeaveRequestDecisions'] });
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Announcements Section */}
        {announcements.length > 0 && (
          <AnnouncementsList 
            announcements={announcements} 
            currentEmployee={currentEmployee}
          />
        )}

        {/* Conversations Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-gray-600" />
                <h2 className="text-lg font-semibold text-gray-900">Messages</h2>
                {totalUnread > 0 && (
                  <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-1 rounded-full">
                    {totalUnread}
                  </span>
                )}
                {unreadMentionsCount > 0 && (
                  <span className="bg-purple-600 text-white text-xs font-bold rounded-full px-2 py-1 flex items-center gap-1">
                    <AtSign className="w-3 h-3" />
                    {unreadMentionsCount}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="px-4 py-2 border-b border-gray-100 flex gap-2">
            <button
              onClick={() => setFilterMode('all')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                filterMode === 'all' 
                  ? "bg-blue-100 text-blue-700" 
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              Toutes
            </button>
            <button
              onClick={() => setFilterMode('mentions')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1",
                filterMode === 'mentions' 
                  ? "bg-purple-100 text-purple-700" 
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              <AtSign className="w-3 h-3" />
              Mentions
              {unreadMentionsCount > 0 && (
                <span className="bg-purple-600 text-white rounded-full px-1.5 text-[10px] font-bold">
                  {unreadMentionsCount}
                </span>
              )}
            </button>
          </div>

          <ConversationsList
            conversations={filterMode === 'mentions' ? conversationsWithMentions : conversations}
            currentEmployee={currentEmployee}
            employees={employees}
            unreadCounts={unreadCounts}
          />

          {filterMode === 'mentions' && conversationsWithMentions.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              <AtSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Aucune mention non lue</p>
            </div>
          )}
        </div>

        {/* Manager/Admin Quick Actions */}
        {isManagerOrAdmin && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Annonces urgentes card */}
            <button
              onClick={() => navigate(createPageUrl('AnnoncesUrgentes'))}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-all text-left group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                    <Megaphone className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Annonces urgentes</h3>
                    <p className="text-xs text-gray-500">Gérer les alertes</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 group-hover:translate-x-1 transition-all" />
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <Circle className="w-2 h-2 text-red-500 fill-red-500" />
                  <span className="text-gray-600">
                    {urgentAnnouncements.length} active{urgentAnnouncements.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="text-gray-400">•</div>
                <div className="text-gray-600">
                  {allUrgentAnnouncements.length} total
                </div>
              </div>
            </button>

            {/* Présence card */}
            <button
              onClick={() => navigate(createPageUrl('Presence'))}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-all text-left group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                    <Users className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Présence</h3>
                    <p className="text-xs text-gray-500">Statuts en temps réel</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 group-hover:translate-x-1 transition-all" />
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <Circle className="w-2 h-2 text-green-500 fill-green-500" />
                  <span className="text-gray-600">
                    {onlineEmployeesCount} en ligne
                  </span>
                </div>
                <div className="text-gray-400">•</div>
                <div className="text-gray-600">
                  {employees.filter(e => e.is_active !== false).length} employés
                </div>
              </div>
            </button>
          </div>
        )}

        {/* Hidden Conversations (Deleted for me) Section */}
        {hiddenConversations.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <button
              onClick={() => setShowHidden(!showHidden)}
              className="w-full px-4 py-3 border-b border-gray-200 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <ArchiveRestore className="w-5 h-5 text-gray-400" />
                <h2 className="text-sm font-medium text-gray-600">
                  Conversations supprimées ({hiddenConversations.length})
                </h2>
              </div>
              <div className={cn(
                "transform transition-transform",
                showHidden && "rotate-180"
              )}>
                ▼
              </div>
            </button>
            
            {showHidden && (
              <div className="divide-y divide-gray-100">
                {hiddenConversations.map(conv => {
                  const member = myConversationMembers.find(m => m.conversation_id === conv.id);
                  return (
                    <div key={conv.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700 truncate">
                          {conv.title || 'Conversation'}
                        </p>
                        <p className="text-xs text-gray-500">
                          Supprimé le {new Date(member.hidden_at).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await base44.entities.ConversationMember.update(member.id, {
                              is_hidden: false,
                              hidden_at: null,
                              left_at: null
                            });
                            queryClient.invalidateQueries({ queryKey: ['myConversationMembers'] });
                            queryClient.invalidateQueries({ queryKey: ['myConversations'] });
                            toast.success('Conversation restaurée');
                          } catch (error) {
                            toast.error('Erreur lors de la restauration');
                          }
                        }}
                      >
                        <ArchiveRestore className="w-4 h-4 mr-1" />
                        Restaurer
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Archived Conversations Section */}
        {archivedConversations.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="w-full px-4 py-3 border-b border-gray-200 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-gray-400" />
                <h2 className="text-sm font-medium text-gray-600">
                  Conversations archivées ({archivedConversations.length})
                </h2>
              </div>
              <div className={cn(
                "transform transition-transform",
                showArchived && "rotate-180"
              )}>
                ▼
              </div>
            </button>
            
            {showArchived && (
              <ConversationsList
                conversations={archivedConversations}
                currentEmployee={currentEmployee}
                employees={employees}
                unreadCounts={unreadCounts}
                isArchived
              />
            )}
          </div>
        )}
      </div>

      {/* Floating Action Button */}
      <button
        onClick={() => setShowNewConversation(true)}
        className={cn(
          "fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg",
          "flex items-center justify-center transition-all hover:scale-110",
          "lg:bottom-8 lg:right-8"
        )}
        title="Nouveau message"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* New Conversation Modal */}
      <NewConversationModal
        open={showNewConversation}
        onOpenChange={setShowNewConversation}
        currentEmployee={currentEmployee}
        employees={employees}
      />

      {/* Urgent Announcement Modal (Blocking) */}
      {urgentAnnouncementToShow && (
        <UrgentAnnouncementModal
          announcement={urgentAnnouncementToShow}
          currentEmployee={currentEmployee}
          onAcknowledge={() => {
            queryClient.invalidateQueries({ queryKey: ['urgentAnnouncementAcks'] });
          }}
        />
      )}

      {/* Create Urgent Announcement Modal */}
      <CreateUrgentAnnouncementModal
        open={showCreateUrgentAnnouncement}
        onOpenChange={setShowCreateUrgentAnnouncement}
        currentEmployee={currentEmployee}
      />
    </div>
  );
}