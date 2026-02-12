import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Send, Users, User, Pin, MoreVertical, X, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { calculatePresenceStatus, getOnlineCount } from '@/components/utils/presenceUtils';
import MessageReadStatus from '@/components/messaging/MessageReadStatus';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function Conversation() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef(null);
  const messageRefs = useRef({});
  const [messageText, setMessageText] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionPosition, setMentionPosition] = useState(0);
  const [isUrgent, setIsUrgent] = useState(false);
  const [urgentLevel, setUrgentLevel] = useState('info');
  const textareaRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const lastTypingUpdateRef = useRef(0);

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

  const pinnedMessages = useMemo(() => {
    return [...messages]
      .filter(m => m.is_pinned && !m.is_deleted)
      .sort((a, b) => new Date(b.pinned_at) - new Date(a.pinned_at));
  }, [messages]);

  const urgentMessages = useMemo(() => {
    return [...messages]
      .filter(m => m.is_urgent && !m.is_deleted)
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
      .slice(0, 3);
  }, [messages]);

  // Get message mentions
  const { data: messageMentions = [] } = useQuery({
    queryKey: ['messageMentions', conversationId],
    queryFn: () => base44.entities.MessageMention.filter({ conversation_id: conversationId }),
    enabled: !!conversationId
  });

  // Mentionable employees
  const mentionableEmployees = useMemo(() => {
    if (!conversation || !employees.length) return [];
    
    // For private conversations: only other participant
    if (conversation.type === 'privee') {
      const otherIds = conversation.participant_employee_ids?.filter(id => id !== currentEmployee?.id) || [];
      return employees.filter(emp => otherIds.includes(emp.id));
    }
    
    // For team/entreprise: all participants except self
    const participantIds = conversation.participant_employee_ids || [];
    return employees.filter(emp => 
      emp.id !== currentEmployee?.id && 
      participantIds.includes(emp.id) &&
      emp.is_active !== false
    );
  }, [conversation, employees, currentEmployee]);

  // Filter mentionable employees by search
  const filteredMentionableEmployees = useMemo(() => {
    if (!mentionSearch) return mentionableEmployees;
    const search = mentionSearch.toLowerCase();
    return mentionableEmployees.filter(emp =>
      emp.first_name?.toLowerCase().includes(search) ||
      emp.last_name?.toLowerCase().includes(search)
    );
  }, [mentionableEmployees, mentionSearch]);

  // Calculate who is typing (excluding current user and stale indicators)
  const whoIsTyping = useMemo(() => {
    if (!typingIndicators.length || !employees.length || !currentEmployee?.id) return [];

    const now = new Date();
    const sixSecondsAgo = new Date(now.getTime() - 6000);

    return typingIndicators
      .filter(ti => 
        ti.is_typing && 
        ti.employee_id !== currentEmployee.id &&
        new Date(ti.updated_date) > sixSecondsAgo
      )
      .map(ti => employees.find(emp => emp.id === ti.employee_id))
      .filter(Boolean);
  }, [typingIndicators, employees, currentEmployee?.id]);

  // Format typing indicator text
  const typingText = useMemo(() => {
    if (whoIsTyping.length === 0) return '';
    if (whoIsTyping.length === 1) {
      return `${whoIsTyping[0].first_name} écrit…`;
    }
    if (whoIsTyping.length === 2) {
      return `${whoIsTyping[0].first_name} et ${whoIsTyping[1].first_name} écrivent…`;
    }
    return `${whoIsTyping.length} personnes écrivent…`;
  }, [whoIsTyping]);

  // Mark messages as read - fetch ALL reads for this conversation for status calculation
  const { data: messageReads = [] } = useQuery({
    queryKey: ['messageReads', conversationId],
    queryFn: () => base44.entities.MessageRead.filter({ conversation_id: conversationId }),
    enabled: !!conversationId && !!currentEmployee?.id,
    staleTime: 0,
    refetchInterval: 10000 // Refetch every 10 seconds for real-time updates
  });

  // Get typing indicators
  const { data: typingIndicators = [] } = useQuery({
    queryKey: ['typingIndicators', conversationId],
    queryFn: () => base44.entities.TypingIndicator.filter({ conversation_id: conversationId }),
    enabled: !!conversationId && !!currentEmployee?.id,
    staleTime: 0,
    refetchInterval: 2000 // Poll every 2 seconds
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

  // Set typing indicator
  const setTypingMutation = useMutation({
    mutationFn: async (isTyping) => {
      // Try to find existing indicator
      const existing = typingIndicators.find(ti => 
        ti.conversation_id === conversationId && 
        ti.employee_id === currentEmployee.id
      );

      if (existing) {
        return await base44.entities.TypingIndicator.update(existing.id, { is_typing: isTyping });
      } else {
        return await base44.entities.TypingIndicator.create({
          conversation_id: conversationId,
          employee_id: currentEmployee.id,
          is_typing: isTyping
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['typingIndicators'] });
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
    mutationFn: async ({ text, mentions, isUrgent, urgentLevel }) => {
      const messageData = {
        conversation_id: conversationId,
        sender_employee_id: currentEmployee.id,
        text: text.trim()
      };

      if (isUrgent) {
        messageData.is_urgent = true;
        messageData.urgent_level = urgentLevel;
      }

      const message = await base44.entities.Message.create(messageData);

      // Create mentions
      if (mentions.length > 0) {
        const mentionRecords = mentions.map(empId => ({
          message_id: message.id,
          mentioned_employee_id: empId,
          conversation_id: conversationId
        }));
        await base44.entities.MessageMention.bulkCreate(mentionRecords);
      }

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
      queryClient.invalidateQueries({ queryKey: ['messageMentions'] });
      setMessageText('');
    },
    onError: () => {
      toast.error('Erreur lors de l\'envoi');
    }
  });

  // Pin/Unpin message mutation
  const togglePinMutation = useMutation({
    mutationFn: async ({ messageId, pin }) => {
      return await base44.entities.Message.update(messageId, pin ? {
        is_pinned: true,
        pinned_at: new Date().toISOString(),
        pinned_by_employee_id: currentEmployee.id
      } : {
        is_pinned: false,
        pinned_at: null,
        pinned_by_employee_id: null
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      toast.success('Message épinglé');
    },
    onError: () => {
      toast.error('Erreur');
    }
  });

  const canPinMessage = (msg) => {
    if (!currentEmployee) return false;
    // Admin can always pin
    if (currentUser?.role === 'admin') return true;
    // Message sender can pin their own message
    if (msg.sender_employee_id === currentEmployee.id) return true;
    // Manager can pin
    if (currentEmployee.permission_level === 'manager') return true;
    return false;
  };

  const scrollToMessage = (messageId) => {
    const element = messageRefs.current[messageId];
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('bg-yellow-100');
      setTimeout(() => {
        element.classList.remove('bg-yellow-100');
      }, 2000);
    }
  };

  const handleSend = () => {
    if (!messageText.trim()) return;
    
    // Clear typing indicator immediately
    clearTimeout(typingTimeoutRef.current);
    setTypingMutation.mutate(false);
    
    // Extract mentions from text
    const mentions = [];
    const regex = /@(\w+)/g;
    let match;
    while ((match = regex.exec(messageText)) !== null) {
      const name = match[1];
      const emp = mentionableEmployees.find(e => 
        e.first_name?.toLowerCase() === name.toLowerCase()
      );
      if (emp && !mentions.includes(emp.id)) {
        mentions.push(emp.id);
      }
    }
    
    sendMessageMutation.mutate({ 
      text: messageText, 
      mentions,
      isUrgent,
      urgentLevel: isUrgent ? urgentLevel : undefined
    });
    setIsUrgent(false);
  };

  const canSendUrgent = useMemo(() => {
    if (!currentEmployee) return false;
    // Admin always can
    if (currentUser?.role === 'admin') return true;
    // Check role permissions for messages_urgents
    if (currentEmployee.permission_level === 'manager') return true;
    return false;
  }, [currentUser, currentEmployee]);

  const handleTextChange = (e) => {
    const text = e.target.value;
    setMessageText(text);
    
    // Typing indicator logic (throttled)
    const now = Date.now();
    
    // Clear previous timeout
    clearTimeout(typingTimeoutRef.current);
    
    // Set typing to true (throttled - max once per 2 seconds)
    if (text.trim() && now - lastTypingUpdateRef.current > 2000) {
      setTypingMutation.mutate(true);
      lastTypingUpdateRef.current = now;
    }
    
    // Set timeout to clear typing after 3 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      setTypingMutation.mutate(false);
    }, 3000);
    
    // Detect @ for mentions
    const cursorPosition = e.target.selectionStart;
    const textBeforeCursor = text.slice(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      if (!textAfterAt.includes(' ') && textAfterAt.length < 20) {
        setMentionSearch(textAfterAt);
        setMentionPosition(lastAtIndex);
        setShowMentions(true);
        return;
      }
    }
    
    setShowMentions(false);
  };

  const insertMention = (employee) => {
    const beforeMention = messageText.slice(0, mentionPosition);
    const afterMention = messageText.slice(mentionPosition);
    const afterAt = afterMention.slice(1);
    const nextSpace = afterAt.indexOf(' ');
    const textAfterMention = nextSpace === -1 ? '' : afterAt.slice(nextSpace);
    
    const newText = `${beforeMention}@${employee.first_name} ${textAfterMention}`;
    setMessageText(newText);
    setShowMentions(false);
    setMentionSearch('');
    
    // Focus back on textarea
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sortedMessages]);

  // Cleanup typing indicator on unmount or conversation change
  useEffect(() => {
    return () => {
      clearTimeout(typingTimeoutRef.current);
      if (currentEmployee?.id && conversationId) {
        setTypingMutation.mutate(false);
      }
    };
  }, [conversationId, currentEmployee?.id]);

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
      
      return { initial, color, type: 'privee', employee: others[0] };
    }
    
    // Team conversation
    if (conversation.type === 'equipe') {
      return { initial: null, color: 'bg-gray-100 text-gray-600', type: 'equipe' };
    }
    
    // Other types
    return { initial: null, color: 'bg-purple-100', type: 'other' };
  }, [conversation, currentEmployee, employees]);

  // Calculate presence info
  const presenceInfo = useMemo(() => {
    if (!conversation || !employees.length) return null;

    // Private conversation: show other person's status
    if (conversation.type === 'privee' && avatarData?.employee) {
      return {
        type: 'single',
        presence: calculatePresenceStatus(avatarData.employee.last_seen_at)
      };
    }

    // Team/group conversation: show online count
    if (conversation.type === 'equipe' || conversation.type === 'entreprise') {
      const onlineCount = getOnlineCount(conversation.participant_employee_ids, employees);
      return {
        type: 'group',
        onlineCount,
        totalCount: conversation.participant_employee_ids?.length || 0
      };
    }

    return null;
  }, [conversation, employees, avatarData]);

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
          {presenceInfo?.type === 'single' ? (
            <div className="flex items-center gap-1.5 text-xs">
              <Circle className={cn("w-2 h-2", presenceInfo.presence.dotColor)} />
              <span className={presenceInfo.presence.color}>
                {presenceInfo.presence.label}
              </span>
            </div>
          ) : presenceInfo?.type === 'group' ? (
            <p className="text-xs text-gray-500">
              {presenceInfo.onlineCount > 0 && (
                <span className="text-green-600 font-medium">
                  {presenceInfo.onlineCount} en ligne
                </span>
              )}
              {presenceInfo.onlineCount > 0 && ' • '}
              {presenceInfo.totalCount} participant{presenceInfo.totalCount > 1 ? 's' : ''}
            </p>
          ) : (
            <p className="text-xs text-gray-500">
              {conversation.participant_employee_ids?.length || 0} participant{(conversation.participant_employee_ids?.length || 0) > 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      {/* Urgent Messages */}
      {urgentMessages.length > 0 && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">📣</span>
            <h3 className="text-sm font-semibold text-red-900">Annonces récentes</h3>
          </div>
          <div className="space-y-2">
            {urgentMessages.map(msg => {
              const sender = employees.find(emp => emp.id === msg.sender_employee_id);
              const levelColors = {
                info: 'bg-blue-50 border-blue-200',
                important: 'bg-orange-50 border-orange-200',
                critique: 'bg-red-100 border-red-300'
              };
              return (
                <button
                  key={msg.id}
                  onClick={() => scrollToMessage(msg.id)}
                  className={cn(
                    "w-full rounded-lg p-3 hover:opacity-80 transition-colors text-left border",
                    levelColors[msg.urgent_level] || levelColors.info
                  )}
                >
                  <p className="text-xs text-gray-500 mb-1">
                    📣 {sender?.first_name} {sender?.last_name}
                  </p>
                  <p className="text-sm text-gray-900 line-clamp-2">{msg.text}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Pinned Messages */}
      {pinnedMessages.length > 0 && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Pin className="w-4 h-4 text-yellow-700" />
            <h3 className="text-sm font-semibold text-yellow-900">Messages importants</h3>
          </div>
          <div className="space-y-2">
            {pinnedMessages.map(msg => {
              const sender = employees.find(emp => emp.id === msg.sender_employee_id);
              return (
                <button
                  key={msg.id}
                  onClick={() => scrollToMessage(msg.id)}
                  className="w-full bg-white rounded-lg p-3 hover:bg-yellow-100 transition-colors text-left border border-yellow-200"
                >
                  <p className="text-xs text-gray-500 mb-1">
                    {sender?.first_name} {sender?.last_name}
                  </p>
                  <p className="text-sm text-gray-900 line-clamp-2">{msg.text}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Typing indicator */}
        {typingText && (
          <div className="flex items-center gap-2 text-sm text-gray-500 italic px-2">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span>{typingText}</span>
          </div>
        )}

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

            // Check if current user is mentioned
            const isMentioned = messageMentions.some(m => 
              m.message_id === msg.id && m.mentioned_employee_id === currentEmployee.id
            );

            return (
              <div
                key={msg.id}
                ref={(el) => messageRefs.current[msg.id] = el}
                className={cn(
                  "flex gap-2 transition-colors duration-500",
                  isMe ? "justify-end" : "justify-start"
                )}
              >
                {!isMe && (
                  <div className="w-8 h-8 rounded-full bg-gray-300 flex-shrink-0 flex items-center justify-center text-white text-xs font-semibold">
                    {sender?.first_name?.charAt(0)}{sender?.last_name?.charAt(0)}
                  </div>
                )}

                <div className="relative group/message flex items-start gap-2">
                  <div className={cn(
                    "max-w-[70%] rounded-2xl px-4 py-2 relative",
                    msg.is_urgent && !isMe && (
                      msg.urgent_level === 'critique' ? "bg-red-50 text-gray-900 rounded-bl-sm shadow-sm ring-2 ring-red-300" :
                      msg.urgent_level === 'important' ? "bg-orange-50 text-gray-900 rounded-bl-sm shadow-sm ring-2 ring-orange-300" :
                      "bg-blue-50 text-gray-900 rounded-bl-sm shadow-sm ring-2 ring-blue-300"
                    ),
                    !msg.is_urgent && (
                      isMe 
                        ? "bg-blue-600 text-white rounded-br-sm" 
                        : isMentioned
                          ? "bg-blue-50 text-gray-900 rounded-bl-sm shadow-sm ring-2 ring-blue-200"
                          : "bg-white text-gray-900 rounded-bl-sm shadow-sm"
                    ),
                    msg.is_pinned && "ring-2 ring-yellow-400"
                  )}>
                    {isMentioned && !isMe && (
                      <div className="absolute -top-2 -right-2 bg-blue-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                        @
                      </div>
                    )}
                    {msg.is_pinned && (
                      <Pin className={cn("w-3 h-3 absolute -top-1 -right-1", isMe ? "text-yellow-300" : "text-yellow-600")} />
                    )}
                    {!isMe && (
                      <p className="text-xs font-semibold mb-1 opacity-70 flex items-center gap-1">
                        {msg.is_urgent && <span>📣</span>}
                        {sender?.first_name} {sender?.last_name}
                      </p>
                    )}
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <p className={cn(
                        "text-[10px]",
                        isMe ? "text-blue-100" : "text-gray-500"
                      )}>
                        {new Date(msg.created_date).toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                      {isMe && (
                        <MessageReadStatus
                          message={msg}
                          allMessageReads={messageReads}
                          conversation={conversation}
                          employees={employees}
                          currentEmployeeId={currentEmployee.id}
                        />
                      )}
                    </div>
                  </div>

                  {/* Message menu */}
                  {canPinMessage(msg) && (
                    <div className="opacity-0 group-hover/message:opacity-100 transition-opacity">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1 hover:bg-gray-100 rounded-full">
                            <MoreVertical className="w-4 h-4 text-gray-400" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => togglePinMutation.mutate({ 
                              messageId: msg.id, 
                              pin: !msg.is_pinned 
                            })}
                          >
                            {msg.is_pinned ? (
                              <>
                                <X className="w-4 h-4 mr-2" />
                                Retirer l'épingle
                              </>
                            ) : (
                              <>
                                <Pin className="w-4 h-4 mr-2" />
                                Épingler
                              </>
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
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
      <div className="bg-white border-t border-gray-200 px-4 py-3 relative">
        {/* Urgent toggle for admin/managers */}
        {canSendUrgent && (
          <div className="mb-2 flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isUrgent}
                onChange={(e) => setIsUrgent(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm font-medium text-gray-700">📣 Annonce urgente</span>
            </label>
            {isUrgent && (
              <select
                value={urgentLevel}
                onChange={(e) => setUrgentLevel(e.target.value)}
                className="text-xs border border-gray-300 rounded px-2 py-1"
              >
                <option value="info">Info</option>
                <option value="important">Important</option>
                <option value="critique">Critique</option>
              </select>
            )}
          </div>
        )}

        {/* Mentions dropdown */}
        {showMentions && filteredMentionableEmployees.length > 0 && (
          <div className="absolute bottom-full left-4 right-4 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {filteredMentionableEmployees.map(emp => (
              <button
                key={emp.id}
                onClick={() => insertMention(emp)}
                className="w-full px-4 py-2 hover:bg-gray-50 text-left flex items-center gap-2"
              >
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold">
                  {emp.first_name?.charAt(0)}{emp.last_name?.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {emp.first_name} {emp.last_name}
                  </p>
                  <p className="text-xs text-gray-500">{emp.position || emp.email}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            placeholder="Écrivez votre message... (@ pour mentionner)"
            value={messageText}
            onChange={handleTextChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !showMentions) {
                e.preventDefault();
                handleSend();
              }
              if (e.key === 'Escape') {
                setShowMentions(false);
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