import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, Clock, Eye, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export default function DailyNoteCard({ note }) {
  const queryClient = useQueryClient();
  const [showReaders, setShowReaders] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const hasRead = note.read_by?.some(r => r.user_email === currentUser?.email);
  const isAuthor = note.author === currentUser?.email;

  const markAsReadMutation = useMutation({
    mutationFn: async () => {
      const updatedReadBy = [
        ...(note.read_by || []),
        {
          user_email: currentUser?.email,
          user_name: currentUser?.full_name || currentUser?.email,
          read_at: new Date().toISOString()
        }
      ];
      return base44.entities.DailyNote.update(note.id, { read_by: updatedReadBy });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dailyNotes'] });
    }
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async () => {
      return base44.entities.DailyNote.delete(note.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dailyNotes'] });
    }
  });

  const handleClose = () => {
    if (!hasRead) {
      markAsReadMutation.mutate();
    }
  };

  if (hasRead && !isAuthor) {
    return null;
  }

  const timeLeft = () => {
    const now = new Date();
    const expires = new Date(note.expires_at);
    const diff = expires - now;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h${minutes > 0 ? ` ${minutes}min` : ''} restantes`;
    }
    return `${minutes}min restantes`;
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={cn(
          "relative p-4 sm:p-5 rounded-2xl border-2 shadow-xl",
          "bg-gradient-to-br from-orange-600/20 to-orange-700/20",
          "border-orange-500/50"
        )}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-orange-600/10 to-transparent rounded-2xl" />
        
        <div className="relative">
          <div className="flex items-start justify-between gap-3 sm:gap-4 mb-3">
            <div className="flex items-start sm:items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-orange-600 flex items-center justify-center flex-shrink-0">
                <Bell className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white text-sm sm:text-base">Note d'équipe</p>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs text-orange-200 mt-1">
                  <span className="truncate max-w-[120px] sm:max-w-none">{note.author_name}</span>
                  <span>•</span>
                  <span className="whitespace-nowrap">{format(new Date(note.created_date), 'HH:mm', { locale: fr })}</span>
                  <span>•</span>
                  <div className="flex items-center gap-1 whitespace-nowrap">
                    <Clock className="w-3 h-3" />
                    {timeLeft()}
                  </div>
                </div>
              </div>
            </div>
            
            {!isAuthor && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleClose}
                className="text-orange-200 hover:text-white hover:bg-orange-600/30 -mt-1 -mr-1 flex-shrink-0 min-h-[44px] min-w-[44px]"
              >
                <X className="w-5 h-5" />
              </Button>
            )}
          </div>

          <p className="text-white text-sm sm:text-base leading-relaxed break-words whitespace-pre-wrap overflow-wrap-anywhere">
            {note.content}
          </p>

          {isAuthor && (
            <div className="mt-4 pt-4 border-t border-orange-500/30 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowReaders(true)}
                className="text-orange-200 hover:text-white hover:bg-orange-600/30 text-xs min-h-[44px] justify-start sm:justify-center"
              >
                <Eye className="w-4 h-4 mr-2" />
                {note.read_by?.length || 0} personne{(note.read_by?.length || 0) > 1 ? 's ont' : ' a'} lu
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmDelete(true)}
                className="text-red-300 hover:text-red-100 hover:bg-red-600/30 text-xs min-h-[44px] justify-start sm:justify-center"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Supprimer
              </Button>
            </div>
          )}
        </div>
      </motion.div>

      {/* Readers Modal */}
      <Dialog open={showReaders} onOpenChange={setShowReaders}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-[95vw] sm:max-w-md mx-4">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Lecture de la note</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {note.read_by?.length > 0 ? (
              note.read_by.map((reader, index) => (
                <div 
                  key={index}
                  className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg gap-2"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-xs font-medium text-white flex-shrink-0">
                      {reader.user_name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm truncate">{reader.user_name}</span>
                  </div>
                  <span className="text-xs text-slate-400 whitespace-nowrap">
                    {format(new Date(reader.read_at), "HH:mm", { locale: fr })}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-center text-slate-400 py-4 text-sm">
                Personne n'a encore lu cette note
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Supprimer la note"
        description="Cette note sera supprimée pour tous les utilisateurs. Cette action est irréversible."
        onConfirm={() => deleteNoteMutation.mutate()}
        variant="danger"
        confirmText="Supprimer"
      />
    </>
  );
}