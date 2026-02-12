import React, { useMemo } from 'react';
import { Users, User, Building2, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

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
  unreadCounts 
}) {
  const navigate = useNavigate();

  // Generate conversation display data
  const conversationsData = useMemo(() => {
    return conversations.map(conv => {
      let displayTitle = conv.title;
      
      // Generate title for private conversations without title
      if (conv.type === 'privee' && !conv.title) {
        const otherParticipantIds = conv.participant_employee_ids?.filter(id => id !== currentEmployee.id) || [];
        const otherParticipants = employees.filter(emp => otherParticipantIds.includes(emp.id));
        displayTitle = otherParticipants.map(emp => emp.first_name).join(', ') || 'Conversation';
      }

      const Icon = typeIcons[conv.type] || User;
      const unreadCount = unreadCounts[conv.id] || 0;

      return {
        ...conv,
        displayTitle,
        Icon,
        unreadCount
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
        <button
          key={conv.id}
          onClick={() => navigate(createPageUrl('Conversation') + '?id=' + conv.id)}
          className="w-full px-4 py-3 hover:bg-gray-50 transition-colors text-left flex items-start gap-3"
        >
          {/* Avatar */}
          <div className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0",
            conv.unreadCount > 0 ? "bg-blue-100" : "bg-gray-100"
          )}>
            <conv.Icon className={cn(
              "w-6 h-6",
              conv.unreadCount > 0 ? "text-blue-600" : "text-gray-600"
            )} />
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

            <div className="flex items-center justify-between gap-2">
              <p className={cn(
                "text-xs truncate",
                conv.unreadCount > 0 ? "text-gray-700 font-medium" : "text-gray-500"
              )}>
                {conv.last_message_text || 'Aucun message'}
              </p>
              
              {conv.unreadCount > 0 && (
                <span className="bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
                  {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                </span>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}