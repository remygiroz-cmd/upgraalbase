import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

/**
 * Display read status for sent messages (WhatsApp-style)
 * @param {Object} props
 * @param {Object} props.message - The message object
 * @param {Array} props.allMessageReads - All MessageRead records for the conversation
 * @param {Object} props.conversation - The conversation object
 * @param {Array} props.employees - All employees
 * @param {string} props.currentEmployeeId - Current user's employee ID
 */
export default function MessageReadStatus({ 
  message, 
  allMessageReads, 
  conversation, 
  employees,
  currentEmployeeId 
}) {
  // Calculate read status
  const readStatus = React.useMemo(() => {
    if (!message || !allMessageReads || !conversation) {
      return { type: 'sent', readCount: 0, totalRecipients: 0 };
    }

    // Get recipients (all participants except sender)
    const recipientIds = (conversation.participant_employee_ids || [])
      .filter(id => id !== message.sender_employee_id);

    // Get reads for this message
    const messageReads = allMessageReads.filter(mr => mr.message_id === message.id);
    const readByIds = new Set(messageReads.map(mr => mr.employee_id));

    // Count how many recipients have read
    const readCount = recipientIds.filter(id => readByIds.has(id)).length;
    const totalRecipients = recipientIds.length;

    // Get readers info for popover
    const readers = employees.filter(emp => readByIds.has(emp.id));
    const nonReaders = employees.filter(emp => 
      recipientIds.includes(emp.id) && !readByIds.has(emp.id)
    );

    if (readCount === 0) {
      return { 
        type: 'sent', 
        readCount: 0, 
        totalRecipients,
        readers: [],
        nonReaders 
      };
    }

    if (readCount === totalRecipients) {
      return { 
        type: 'read_all', 
        readCount, 
        totalRecipients,
        readers,
        nonReaders: [] 
      };
    }

    return { 
      type: 'read_partial', 
      readCount, 
      totalRecipients,
      readers,
      nonReaders 
    };
  }, [message, allMessageReads, conversation, employees]);

  // Don't show for messages not sent by current user
  if (message.sender_employee_id !== currentEmployeeId) {
    return null;
  }

  const isPrivate = conversation.type === 'privee';
  const isGroup = conversation.type === 'equipe' || conversation.type === 'entreprise';

  // Private conversation: simple check marks
  if (isPrivate) {
    return (
      <div className="flex items-center gap-0.5 ml-1">
        {readStatus.type === 'sent' ? (
          <Check className="w-3 h-3 text-blue-100" />
        ) : (
          <>
            <Check className="w-3 h-3 text-blue-400 -mr-1.5" />
            <Check className="w-3 h-3 text-blue-400" />
          </>
        )}
      </div>
    );
  }

  // Group conversation: check marks with count and popover
  if (isGroup) {
    const content = (
      <div className="flex items-center gap-0.5">
        {readStatus.type === 'sent' ? (
          <Check className="w-3 h-3 text-blue-100" />
        ) : readStatus.type === 'read_all' ? (
          <>
            <Check className="w-3 h-3 text-blue-400 -mr-1.5" />
            <Check className="w-3 h-3 text-blue-400" />
          </>
        ) : (
          <>
            <Check className="w-3 h-3 text-blue-200 -mr-1.5" />
            <Check className="w-3 h-3 text-blue-200" />
          </>
        )}
        {readStatus.totalRecipients > 1 && (
          <span className="text-[9px] text-blue-100 ml-0.5">
            {readStatus.readCount}/{readStatus.totalRecipients}
          </span>
        )}
      </div>
    );

    // Only show popover if there are readers or non-readers to show
    if (readStatus.readers.length > 0 || readStatus.nonReaders.length > 0) {
      return (
        <Popover>
          <PopoverTrigger asChild>
            <button className="ml-1 hover:opacity-80 transition-opacity">
              {content}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="end">
            <div className="space-y-3">
              {readStatus.readers.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 mb-2">
                    Lu par ({readStatus.readers.length})
                  </h4>
                  <div className="space-y-1">
                    {readStatus.readers.map(emp => {
                      const read = allMessageReads.find(
                        mr => mr.message_id === message.id && mr.employee_id === emp.id
                      );
                      return (
                        <div key={emp.id} className="flex items-center justify-between text-xs">
                          <span className="text-gray-900">
                            {emp.first_name} {emp.last_name}
                          </span>
                          {read?.read_at && (
                            <span className="text-gray-500">
                              {new Date(read.read_at).toLocaleTimeString('fr-FR', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {readStatus.nonReaders.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 mb-2">
                    Non lu ({readStatus.nonReaders.length})
                  </h4>
                  <div className="space-y-1">
                    {readStatus.nonReaders.map(emp => (
                      <div key={emp.id} className="text-xs text-gray-600">
                        {emp.first_name} {emp.last_name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      );
    }

    return <div className="ml-1">{content}</div>;
  }

  return null;
}