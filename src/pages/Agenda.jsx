import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, ChevronLeft, ChevronRight, Calendar, Clock, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import AgendaMonthView from '@/components/agenda/AgendaMonthView';
import AgendaWeekView from '@/components/agenda/AgendaWeekView';
import AgendaDayView from '@/components/agenda/AgendaDayView';
import EventFormModal from '@/components/agenda/EventFormModal';
import EventDetailDrawer from '@/components/agenda/EventDetailDrawer';
import { toast } from 'sonner';

function isPrivilegedUser(currentUser, currentEmployee, userRole) {
  if (!currentEmployee) return false;
  const roleName = (userRole?.name || '').toLowerCase();
  const isGerant = ['responsable', 'gérant', 'gerant', 'manager', 'bureau'].some(r => roleName.includes(r));
  return currentUser?.role === 'admin' || currentEmployee.permission_level === 'manager' || isGerant;
}

async function upsertHomeAlert(db, { employee_id, title, message, severity, event_id, expires_at, created_by_employee_id }) {
  // Anti-spam: chercher alerte récente non dismissed liée à cet event
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const existing = await db.entities.HomeAlert.filter({ employee_id, event_id, is_dismissed: false });
  const recent = existing.find(a => new Date(a.created_date) > new Date(twoMinutesAgo));

  if (recent) {
    console.log('[Agenda] HomeAlert upsert (update)', recent.id);
    await db.entities.HomeAlert.update(recent.id, { title, message, severity });
  } else {
    console.log('[Agenda] HomeAlert create for employee', employee_id);
    await db.entities.HomeAlert.create({
      employee_id, title, message, severity,
      action_type: 'VIEW_EVENT', event_id,
      is_read: false, is_dismissed: false,
      expires_at, created_by_employee_id: created_by_employee_id || null,
    });
  }
}

export default function Agenda() {
  const queryClient = useQueryClient();
  const [view, setView] = useState('month'); // month | week | day
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [draft, setDraft] = useState(null); // pre-fill from cell click

  // Lire event_id depuis URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const evId = params.get('event_id');
    if (evId) {
      // On sélectionnera l'event une fois chargé
      sessionStorage.setItem('agenda_focus_event', evId);
    }
  }, []);

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', 'active'],
    queryFn: () => base44.entities.Employee.filter({ is_active: true }),
    enabled: !!currentUser,
    staleTime: 5 * 60 * 1000,
  });

  const { data: userRole } = useQuery({
    queryKey: ['userRole', currentUser?.role_id],
    queryFn: async () => {
      if (!currentUser?.role_id) return null;
      const roles = await base44.entities.Role.filter({ id: currentUser.role_id });
      return roles[0] || null;
    },
    enabled: !!currentUser?.role_id,
    staleTime: 5 * 60 * 1000,
  });

  const currentEmployee = useMemo(() => {
    if (!currentUser?.email || !employees.length) return null;
    return employees.find(e => e.email?.toLowerCase().trim() === currentUser.email.toLowerCase().trim());
  }, [currentUser, employees]);

  const isPrivileged = useMemo(
    () => isPrivilegedUser(currentUser, currentEmployee, userRole),
    [currentUser, currentEmployee, userRole]
  );

  // Fixer l'employé sélectionné
  useEffect(() => {
    if (currentEmployee && !selectedEmployeeId) {
      setSelectedEmployeeId(currentEmployee.id);
    }
  }, [currentEmployee]);

  // Range dates selon vue
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (view === 'month') {
      return {
        rangeStart: startOfMonth(currentDate).toISOString(),
        rangeEnd: endOfMonth(currentDate).toISOString(),
      };
    } else if (view === 'week') {
      return {
        rangeStart: startOfWeek(currentDate, { weekStartsOn: 1 }).toISOString(),
        rangeEnd: endOfWeek(currentDate, { weekStartsOn: 1 }).toISOString(),
      };
    } else {
      const d = new Date(currentDate);
      d.setHours(0, 0, 0, 0);
      const e = new Date(currentDate);
      e.setHours(23, 59, 59, 999);
      return { rangeStart: d.toISOString(), rangeEnd: e.toISOString() };
    }
  }, [view, currentDate]);

  const targetEmployeeId = isPrivileged ? (selectedEmployeeId || currentEmployee?.id) : currentEmployee?.id;

  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['calendarEvents', targetEmployeeId, rangeStart, rangeEnd],
    queryFn: async () => {
      if (!targetEmployeeId) return [];
      console.log('[Agenda] fetch events for', targetEmployeeId, rangeStart, rangeEnd);
      const all = await base44.entities.CalendarEvent.filter({ owner_employee_id: targetEmployeeId });
      return all.filter(ev => {
        const start = new Date(ev.start_at);
        return start >= new Date(rangeStart) && start <= new Date(rangeEnd);
      });
    },
    enabled: !!targetEmployeeId,
    staleTime: 30 * 1000,
  });

  // Focus event depuis URL
  useEffect(() => {
    const focusId = sessionStorage.getItem('agenda_focus_event');
    if (focusId && events.length) {
      const ev = events.find(e => e.id === focusId);
      if (ev) {
        setSelectedEvent(ev);
        sessionStorage.removeItem('agenda_focus_event');
      }
    }
  }, [events]);

  const ownerEmployee = useMemo(() => {
    if (!selectedEvent) return null;
    return employees.find(e => e.id === selectedEvent.owner_employee_id);
  }, [selectedEvent, employees]);

  const canEditSelectedEvent = useMemo(() => {
    if (!selectedEvent || !currentEmployee) return false;
    if (isPrivileged) return true;
    return selectedEvent.owner_employee_id === currentEmployee.id;
  }, [selectedEvent, currentEmployee, isPrivileged]);

  // Navigation
  const navigate = (dir) => {
    if (view === 'month') setCurrentDate(dir === 1 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    else if (view === 'week') setCurrentDate(dir === 1 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    else setCurrentDate(dir === 1 ? addDays(currentDate, 1) : subDays(currentDate, 1));
  };

  const dateLabel = useMemo(() => {
    if (view === 'month') return format(currentDate, 'MMMM yyyy', { locale: fr });
    if (view === 'week') {
      const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
      const we = endOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(ws, 'd MMM', { locale: fr })} – ${format(we, 'd MMM yyyy', { locale: fr })}`;
    }
    return format(currentDate, 'EEEE d MMMM yyyy', { locale: fr });
  }, [view, currentDate]);

  // Save event
  const saveEventMutation = useMutation({
    mutationFn: async (data) => {
      const payload = { ...data, created_by_employee_id: currentEmployee?.id };
      let saved;
      if (editingEvent) {
        saved = await base44.entities.CalendarEvent.update(editingEvent.id, payload);
      } else {
        saved = await base44.entities.CalendarEvent.create(payload);
      }
      console.log('[Agenda] event saved', saved.id);

      // HomeAlert — pas si l'owner est le même que le créateur (évite spam auto)
      if (saved.owner_employee_id) {
        const expires = new Date(new Date(saved.end_at).getTime() + 24 * 3600 * 1000).toISOString();
        const creatorName = currentEmployee ? `${currentEmployee.first_name} ${currentEmployee.last_name}` : 'Quelqu\'un';
        const eventDate = saved.all_day
          ? format(new Date(saved.start_at), 'dd/MM/yyyy', { locale: fr })
          : format(new Date(saved.start_at), 'dd/MM HH:mm', { locale: fr });

        const message = `${eventDate} — ${saved.type}${editingEvent ? ' · Modifié' : ' · Ajouté'} par ${creatorName}`;
        const severity = saved.importance === 'URGENT' ? 'URGENT' : 'INFO';

        await upsertHomeAlert(base44, {
          employee_id: saved.owner_employee_id,
          title: `Agenda : ${saved.title}`,
          message,
          severity,
          event_id: saved.id,
          expires_at: expires,
          created_by_employee_id: currentEmployee?.id,
        });
      }

      return saved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendarEvents'] });
      queryClient.invalidateQueries({ queryKey: ['homeAlerts'] });
      setShowForm(false);
      setEditingEvent(null);
      toast.success(editingEvent ? 'Événement modifié' : 'Événement créé');
    },
    onError: (err) => toast.error('Erreur : ' + err.message),
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (event) => {
      await base44.entities.CalendarEvent.update(event.id, { status: 'CANCELLED' });
      // Alerte annulation
      if (event.owner_employee_id) {
        const expires = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
        await base44.entities.HomeAlert.create({
          employee_id: event.owner_employee_id,
          title: `Agenda : événement annulé`,
          message: `"${event.title}" a été annulé.`,
          severity: 'WARNING',
          action_type: 'ACK_ONLY',
          event_id: event.id,
          is_read: false,
          is_dismissed: false,
          expires_at: expires,
          created_by_employee_id: currentEmployee?.id || null,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendarEvents'] });
      queryClient.invalidateQueries({ queryKey: ['homeAlerts'] });
      setSelectedEvent(null);
      toast.success('Événement annulé');
    },
    onError: (err) => toast.error('Erreur : ' + err.message),
  });

  if (!currentEmployee) {
    return <div className="p-8 text-center text-gray-500">Chargement...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2 flex-1">
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              Agenda
            </h1>

            {/* Nav date */}
            <div className="flex items-center gap-1 ml-2">
              <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium text-gray-700 capitalize min-w-[160px] text-center">{dateLabel}</span>
              <button onClick={() => navigate(1)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentDate(new Date())}
                className="ml-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg font-medium text-gray-600"
              >
                Aujourd'hui
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Vue toggle */}
            <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
              {[{ k: 'day', label: 'Jour', icon: Clock }, { k: 'week', label: 'Sem.', icon: CalendarDays }, { k: 'month', label: 'Mois', icon: Calendar }].map(({ k, label, icon: Icon }) => (
                <button
                  key={k}
                  onClick={() => setView(k)}
                  className={cn(
                    'flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                    view === k ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-800'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Filtre employé (privileged only) */}
            {isPrivileged && (
              <Select value={selectedEmployeeId || ''} onValueChange={setSelectedEmployeeId}>
                <SelectTrigger className="w-44 text-sm">
                  <SelectValue placeholder="Choisir un employé" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name}
                      {emp.id === currentEmployee.id ? ' (moi)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button
              onClick={() => { setEditingEvent(null); setDraft(null); setShowForm(true); }}
              className="bg-blue-600 hover:bg-blue-700 text-sm"
            >
              <Plus className="w-4 h-4 mr-1" />
              Événement
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-4">
        {eventsLoading ? (
          <div className="flex justify-center py-16 text-gray-400">Chargement...</div>
        ) : (
          <>
            {view === 'month' && (
              <AgendaMonthView
                currentDate={currentDate}
                events={events}
                onEventClick={setSelectedEvent}
                onDayClick={(day) => { setCurrentDate(day); setView('day'); }}
                currentEmployeeId={currentEmployee.id}
                isPrivileged={isPrivileged}
              />
            )}
            {view === 'week' && (
              <AgendaWeekView
                currentDate={currentDate}
                events={events}
                onEventClick={setSelectedEvent}
                currentEmployeeId={currentEmployee.id}
                isPrivileged={isPrivileged}
              />
            )}
            {view === 'day' && (
              <AgendaDayView
                currentDate={currentDate}
                events={events}
                onEventClick={setSelectedEvent}
                currentEmployeeId={currentEmployee.id}
                isPrivileged={isPrivileged}
              />
            )}
          </>
        )}
      </div>

      {/* Event Detail Drawer */}
      <EventDetailDrawer
        event={selectedEvent}
        open={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onEdit={() => { setEditingEvent(selectedEvent); setSelectedEvent(null); setShowForm(true); }}
        onDelete={() => {
          if (confirm('Annuler cet événement ?')) deleteEventMutation.mutate(selectedEvent);
        }}
        canEdit={canEditSelectedEvent}
        ownerEmployee={ownerEmployee}
        isPrivate={isSelectedEventPrivate}
      />

      {/* Event Form Modal */}
      <EventFormModal
        open={showForm}
        onClose={() => { setShowForm(false); setEditingEvent(null); }}
        onSave={(data) => saveEventMutation.mutate(data)}
        event={editingEvent}
        employees={isPrivileged ? employees : [currentEmployee]}
        currentEmployee={currentEmployee}
        isPrivileged={isPrivileged}
      />
    </div>
  );
}