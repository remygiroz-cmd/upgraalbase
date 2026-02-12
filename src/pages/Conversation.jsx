import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Send, Users, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function Conversation() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef(null);
  const [messageText, setMessageText] = useState('');

  // Get conversation ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const conversationId = urlParams.get('id');

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

  // Get conversation
  const { data: conversations = [] } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => base44.entities.Conversation.list(),
    enabled: !!conversationId
  });

  const conversation = conversations.find(c => c.id === conversationId);

  // Get messages
  const { data: messages = [] } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => base44.entities.Message.filter({ conversation_id: conversationId }),
    enabled: !!conversationId,
    staleTime: 10 * 1000,
    refetchInterval: 5000 // Poll every 5 seconds
  });

  const sortedMessages = useMemo(() => {
    return [...messages]
      .filter(m => !m.is_deleted)
      .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
  }, [messages]);

  // Mark messages as read
  const { data: messageReads = [] } = useQuery({
    queryKey: ['messageReads', conversationId],
    queryFn: () => base44.entities.MessageRead.filter({ conversation_id: conversationId }),
    enabled: !!conversationId && !!currentEmployee?.id,
    staleTime: 0
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (messagesToMark) => {
      if (!messagesToMark.length) return;
      
      // Batch create all MessageReads
      const readRecords = messagesToMark.map(msg => ({
        message_id: msg.id,
        employee_id: currentEmployee.id,
        conversation_id: conversationId,
        read_at: new Date().toISOString()
      }));
      
      return await base44.entities.MessageRead.bulkCreate(readRecords);
    },
    onSuccess: () => {
      // Invalidate all relevant queries immediately
      queryClient.invalidateQueries({ queryKey: ['messageReads'] });
      queryClient.invalidateQueries({ queryKey: ['myMessageReads'] });
      queryClient.invalidateQueries({ queryKey: ['myConversations'] });
      queryClient.invalidateQueries({ queryKey: ['allMessages'] });
    }
  });

  // Mark unread messages as read - batch creation
  useEffect(() => {
    if (!currentEmployee?.id || !sortedMessages.length || !messageReads) return;

    const readMessageIds = new Set(messageReads.map(mr => mr.message_id));
    const unreadMessages = sortedMessages.filter(m => 
      m.sender_employee_id !== currentEmployee.id && 
      !readMessageIds.has(m.id)
    );

    if (unreadMessages.length > 0) {
      markAsReadMutation.mutate(unreadMessages);
    }
  }, [sortedMessages, currentEmployee?.id, messageReads]);

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (text) => {
      const message = await base44.entities.Message.create({
        conversation_id: conversationId,
        sender_employee_id: currentEmployee.id,
        text: text.trim()
      });

      // Update conversation last message
      await base44.entities.Conversation.update(conversationId, {
        last_message_text: text.trim().substring(0, 100),
        last_message_at: new Date().toISOString()
      });

      return message;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['myConversations'] });
      setMessageText('');
    },
    onError: () => {
      toast.error('Erreur lors de l\'envoi');
    }
  });

  const handleSend = () => {
    if (!messageText.trim()) return;
    sendMessageMutation.mutate(messageText);
  };

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sortedMessages]);

  // Generate conversation title and avatar
  const conversationTitle = useMemo(() => {
    if (!conversation) return '';

    // For private conversations: always show other person's first name
    if (conversation.type === 'privee') {
      const otherIds = conversation.participant_employee_ids?.filter(id => id !== currentEmployee?.id) || [];
      const others = employees.filter(emp => otherIds.includes(emp.id));
      return others.map(emp => emp.first_name).join(', ') || 'Conversation';
    }

    // For team conversations: use title as-is (should already have prefix)
    if (conversation.type === 'equipe') {
      if (conversation.title) {
        // If title already starts with emoji or "Équipe", use as-is
        return conversation.title.startsWith('👥') || conversation.title.startsWith('Équipe')
          ? conversation.title
          : `👥 Équipe ${conversation.title}`;
      }
      return '👥 Équipe';
    }

    // For other types, use title or type
    if (conversation.title) return conversation.title;
    return conversation.type === 'entreprise' ? 'Entreprise' : 'Conversation';
  }, [conversation, currentEmployee, employees]);

  const avatarData = useMemo(() => {
    if (!conversation) return null;
    
    // Private conversation
    if (conversation.type === 'privee') {
      const otherIds = conversation.participant_employee_ids?.filter(id => id !== currentEmployee?.id) || [];
      const others = employees.filter(emp => otherIds.includes(emp.id));
      
      if (others.length === 0) return null;
      
      const initial = others[0].first_name?.charAt(0).toUpperCase() || '?';
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
      const hash = others[0].first_name?.charCodeAt(0) || 0;
      const color = colors[hash % colors.length];
      
      return { initial, color, type: 'privee' };
    }
    
    // Team conversation
    if (conversation.type === 'equipe') {
      return { initial: null, color: 'bg-gray-100 text-gray-600', type: 'equipe' };
    }
    
    // Other types
    return { initial: null, color: 'bg-purple-100', type: 'other' };
  }, [conversation, currentEmployee, employees]);

  if (!conversationId || !conversation) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Conversation introuvable</p>
      </div>
    );
  }

  if (!currentEmployee) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(createPageUrl('Home'))}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>

        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center",
          avatarData?.type === 'privee' && "font-semibold text-lg",
          avatarData?.color || "bg-purple-100"
        )}>
          {avatarData?.type === 'privee' ? (
            avatarData.initial || '?'
          ) : avatarData?.type === 'equipe' ? (
            <Users className="w-5 h-5" />
          ) : (
            <Users className="w-5 h-5 text-purple-600" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-gray-900 truncate">{conversationTitle}</h1>
          <p className="text-xs text-gray-500">
            {conversation.participant_employee_ids?.length || 0} participant{(conversation.participant_employee_ids?.length || 0) > 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {sortedMessages.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            <p className="text-sm">Aucun message</p>
            <p className="text-xs mt-1">Envoyez le premier message</p>
          </div>
        ) : (
          sortedMessages.map(msg => {
            const sender = employees.find(emp => emp.id === msg.sender_employee_id);
            const isMe = msg.sender_employee_id === currentEmployee.id;
            const isSystem = !msg.sender_employee_id;

            // System message
            if (isSystem) {
              return (
                <div key={msg.id} className="flex justify-center">
                  <div className="bg-gray-100 text-gray-600 text-xs px-4 py-2 rounded-full max-w-[80%] text-center">
                    {msg.text}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-2",
                  isMe ? "justify-end" : "justify-start"
                )}
              >
                {!isMe && (
                  <div className="w-8 h-8 rounded-full bg-gray-300 flex-shrink-0 flex items-center justify-center text-white text-xs font-semibold">
                    {sender?.first_name?.charAt(0)}{sender?.last_name?.charAt(0)}
                  </div>
                )}

                <div className={cn(
                  "max-w-[70%] rounded-2xl px-4 py-2",
                  isMe 
                    ? "bg-blue-600 text-white rounded-br-sm" 
                    : "bg-white text-gray-900 rounded-bl-sm shadow-sm"
                )}>
                  {!isMe && (
                    <p className="text-xs font-semibold mb-1 opacity-70">
                      {sender?.first_name} {sender?.last_name}
                    </p>
                  )}
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                  <p className={cn(
                    "text-[10px] mt-1",
                    isMe ? "text-blue-100" : "text-gray-500"
                  )}>
                    {new Date(msg.created_date).toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>

                {isMe && (
                  <div className="w-8 h-8 rounded-full bg-blue-600 flex-shrink-0 flex items-center justify-center text-white text-xs font-semibold">
                    {currentEmployee.first_name?.charAt(0)}{currentEmployee.last_name?.charAt(0)}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-4 py-3">
        <div className="flex gap-2 items-end">
          <Textarea
            placeholder="Écrivez votre message..."
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="flex-1 min-h-[44px] max-h-32 resize-none"
            rows={1}
          />
          <Button
            onClick={handleSend}
            disabled={!messageText.trim() || sendMessageMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 h-11 px-4"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}