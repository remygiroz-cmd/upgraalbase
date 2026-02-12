import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, MessageCircle, Bell, RefreshCw, AtSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AnnouncementsList from '@/components/messaging/AnnouncementsList';
import ConversationsList from '@/components/messaging/ConversationsList';
import NewConversationModal from '@/components/messaging/NewConversationModal';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function Home() {
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [initializingConversations, setInitializingConversations] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'mentions'
  const queryClient = useQueryClient();

  // Get current user
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  // Get current employee record
  const { data: employees = [] } = useQuery({
    queryKey: ['allEmployees'],
    queryFn: () => base44.entities.Employee.list(),
    enabled: !!currentUser
  });

  const currentEmployee = useMemo(() => {
    if (!currentUser?.email || !employees.length) return null;
    const normalizeEmail = (email) => email?.trim().toLowerCase() || '';
    return employees.find(emp => normalizeEmail(emp.email) === normalizeEmail(currentUser.email));
  }, [currentUser, employees]);

  // Get active announcements
  const { data: announcements = [] } = useQuery({
    queryKey: ['activeAnnouncements'],
    queryFn: async () => {
      const now = new Date().toISOString();
      const all = await base44.entities.Announcement.list();
      
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
    staleTime: 60 * 1000
  });

  // Get conversations (active and archived separately)
  const { data: allConversations = [] } = useQuery({
    queryKey: ['myConversations', currentEmployee?.id],
    queryFn: async () => {
      if (!currentEmployee?.id) return [];
      
      const all = await base44.entities.Conversation.list();
      
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
    staleTime: 0,
    refetchOnMount: 'always'
  });

  // Split into active and archived
  const conversations = useMemo(() => {
    return allConversations.filter(conv => 
      !conv.archived_by_employee_ids?.includes(currentEmployee?.id)
    ).slice(0, 30);
  }, [allConversations, currentEmployee?.id]);

  const archivedConversations = useMemo(() => {
    return allConversations.filter(conv => 
      conv.archived_by_employee_ids?.includes(currentEmployee?.id)
    );
  }, [allConversations, currentEmployee?.id]);

  // Get all messages for unread count
  const { data: allMessages = [] } = useQuery({
    queryKey: ['allMessages'],
    queryFn: () => base44.entities.Message.list(),
    enabled: !!currentEmployee?.id,
    staleTime: 0,
    refetchOnMount: 'always'
  });

  // Get message reads
  const { data: messageReads = [] } = useQuery({
    queryKey: ['myMessageReads', currentEmployee?.id],
    queryFn: () => base44.entities.MessageRead.filter({ employee_id: currentEmployee.id }),
    enabled: !!currentEmployee?.id,
    staleTime: 0,
    refetchOnMount: 'always'
  });

  // Get mentions for current user
  const { data: myMentions = [] } = useQuery({
    queryKey: ['myMentions', currentEmployee?.id],
    queryFn: () => base44.entities.MessageMention.filter({ mentioned_employee_id: currentEmployee.id }),
    enabled: !!currentEmployee?.id,
    staleTime: 0,
    refetchOnMount: 'always'
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
    </div>
  );
}