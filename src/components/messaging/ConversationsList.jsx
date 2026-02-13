import React, { useMemo } from 'react';
import { Users, User, Building2, Briefcase, Archive, ArchiveRestore, MoreVertical, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { calculatePresenceStatus, getOnlineCount } from '@/components/utils/presenceUtils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const typeIcons = {
  privee: User,
  equipe: Users,
  entreprise: Building2,
  rh: Briefcase
};

export default function ConversationsList({ 
  conversations, 
  currentEmployee, 
  employees,
  unreadCounts,
  isArchived = false
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Archive/Unarchive mutation
  const toggleArchiveMutation = useMutation({
    mutationFn: async ({ conversationId, archive }) => {
      const conv = conversations.find(c => c.id === conversationId);
      if (!conv) return;

      const currentArchived = conv.archived_by_employee_ids || [];
      const updated = archive
        ? [...currentArchived, currentEmployee.id]
        : currentArchived.filter(id => id !== currentEmployee.id);

      return await base44.entities.Conversation.update(conversationId, {
        archived_by_employee_ids: updated
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myConversations'] });
      toast.success(isArchived ? 'Conversation désarchivée' : 'Conversation archivée');
    },
    onError: () => {
      toast.error('Erreur');
    }
  });

  const handleArchiveToggle = (e, conversationId) => {
    e.preventDefault();
    e.stopPropagation();
    toggleArchiveMutation.mutate({ 
      conversationId, 
      archive: !isArchived 
    });
  };

  // Generate conversation display data
  const conversationsData = useMemo(() => {
    return conversations.map(conv => {
      let displayTitle = conv.title;
      let avatarInitial = '';
      let avatarColor = 'bg-gray-100';
      let presenceInfo = null;
      
      // For private conversations: always show other person's name
      if (conv.type === 'privee') {
        const otherParticipantIds = conv.participant_employee_ids?.filter(id => id !== currentEmployee.id) || [];
        const otherParticipants = employees.filter(emp => otherParticipantIds.includes(emp.id));
        displayTitle = otherParticipants.map(emp => emp.first_name).join(', ') || 'Conversation';
        
        // Avatar initial and color for private
        if (otherParticipants.length > 0) {
          avatarInitial = otherParticipants[0].first_name?.charAt(0).toUpperCase() || '?';
          // Generate soft color from name
          const colors = [
            'bg-blue-100 text-blue-700',
            'bg-green-100 text-green-700',
            'bg-purple-100 text-purple-700',
            'bg-pink-100 text-pink-700',
            'bg-orange-100 text-orange-700',
            'bg-teal-100 text-teal-700',
            'bg-indigo-100 text-indigo-700',
            'bg-rose-100 text-rose-700'
          ];
          const hash = otherParticipants[0].first_name?.charCodeAt(0) || 0;
          avatarColor = colors[hash % colors.length];
          
          // Calculate presence for private conversations
          presenceInfo = {
            type: 'single',
            presence: calculatePresenceStatus(otherParticipants[0].last_seen_at)
          };
        }
      }
      
      // For team conversations: use title as-is (should already have prefix)
      if (conv.type === 'equipe') {
        if (conv.title) {
          // If title already starts with emoji or "Équipe", use as-is
          displayTitle = conv.title.startsWith('👥') || conv.title.startsWith('Équipe') 
            ? conv.title 
            : `👥 Équipe ${conv.title}`;
        } else {
          displayTitle = '👥 Équipe';
        }
        avatarColor = 'bg-gray-100 text-gray-600';
        
        // Calculate online count for team conversations
        const onlineCount = getOnlineCount(conv.participant_employee_ids, employees);
        presenceInfo = {
          type: 'group',
          onlineCount
        };
      }

      // For entreprise conversations
      if (conv.type === 'entreprise') {
        const onlineCount = getOnlineCount(conv.participant_employee_ids, employees);
        presenceInfo = {
          type: 'group',
          onlineCount
        };
      }

      const Icon = typeIcons[conv.type] || User;
      const unreadCount = unreadCounts[conv.id] || 0;

      return {
        ...conv,
        displayTitle,
        Icon,
        unreadCount,
        avatarInitial,
        avatarColor,
        presenceInfo
      };
    });
  }, [conversations, currentEmployee, employees, unreadCounts]);

  if (conversationsData.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Aucune conversation</p>
        <p className="text-xs mt-1">Cliquez sur + pour démarrer une conversation</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {conversationsData.map(conv => (
        <div
          key={conv.id}
          className="relative group hover:bg-gray-50 transition-colors"
        >
          <button
            onClick={() => navigate(createPageUrl('Conversation') + '?id=' + conv.id)}
            className="w-full px-4 py-3 text-left flex items-start gap-3"
          >
          {/* Avatar with presence indicator */}
          <div className="relative flex-shrink-0">
            <div className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center",
              conv.type === 'privee' ? cn(conv.avatarColor, "font-semibold text-lg") : conv.avatarColor
            )}>
              {conv.type === 'privee' ? (
                conv.avatarInitial
              ) : (
                <conv.Icon className="w-6 h-6" />
              )}
            </div>
            {/* Presence dot for online private conversations */}
            {conv.presenceInfo?.type === 'single' && conv.presenceInfo.presence.status === 'online' && (
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className={cn(
                "text-sm truncate",
                conv.unreadCount > 0 ? "font-bold text-gray-900" : "font-medium text-gray-700"
              )}>
                {conv.displayTitle}
              </h3>
              
              {conv.last_message_at && (
                <span className="text-xs text-gray-500 flex-shrink-0">
                  {(() => {
                    const date = new Date(conv.last_message_at);
                    const now = new Date();
                    const diffHours = (now - date) / (1000 * 60 * 60);
                    
                    if (diffHours < 24) {
                      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                    } else if (diffHours < 48) {
                      return 'Hier';
                    } else {
                      return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
                    }
                  })()}
                </span>
              )}
            </div>

            {/* Creator and participants info */}
            <div className="flex items-center gap-2 mb-1.5">
              {conv.created_by_employee_id && (() => {
                const creator = employees.find(e => e.id === conv.created_by_employee_id);
                if (creator) {
                  return (
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <span className="font-medium">Créée par {creator.first_name}</span>
                    </span>
                  );
                }
              })()}
              {conv.participant_employee_ids?.length > 0 && (
                <span className="text-xs text-gray-500">
                  • {conv.participant_employee_ids.length} membre{conv.participant_employee_ids.length > 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className={cn(
                "text-xs truncate flex-1",
                conv.unreadCount > 0 ? "text-gray-700 font-medium" : "text-gray-500"
              )}>
                {conv.last_message_text || 'Aucun message'}
              </p>
              
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Online count for group conversations */}
                {conv.presenceInfo?.type === 'group' && conv.presenceInfo.onlineCount > 0 && (
                  <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                    <Circle className="w-2 h-2 fill-green-500 text-green-500" />
                    {conv.presenceInfo.onlineCount}
                  </span>
                )}
                
                {conv.unreadCount > 0 && (
                  <span className="bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                  </span>
                )}
              </div>
            </div>
          </div>
          </button>

          {/* Archive/Unarchive Button */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <MoreVertical className="w-4 h-4 text-gray-600" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => handleArchiveToggle(e, conv.id)}
                >
                  {isArchived ? (
                    <>
                      <ArchiveRestore className="w-4 h-4 mr-2" />
                      Désarchiver
                    </>
                  ) : (
                    <>
                      <Archive className="w-4 h-4 mr-2" />
                      Archiver
                    </>
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}
    </div>
  );
}