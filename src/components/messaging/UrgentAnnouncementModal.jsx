import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const SEVERITY_CONFIG = {
  info: {
    icon: Info,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    label: 'Information'
  },
  important: {
    icon: AlertCircle,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-300',
    label: 'Important'
  },
  critique: {
    icon: AlertTriangle,
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-300',
    label: 'Critique'
  }
};

export default function UrgentAnnouncementModal({ 
  announcement, 
  currentEmployee,
  onAcknowledge 
}) {
  const queryClient = useQueryClient();

  const acknowledgeMutation = useMutation({
    mutationFn: async () => {
      return await base44.entities.UrgentAnnouncementAck.create({
        announcement_id: announcement.id,
        employee_id: currentEmployee.id,
        acknowledged_at: new Date().toISOString(),
        acknowledged_by_user_id: currentEmployee.user_id
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['urgentAnnouncements'] });
      queryClient.invalidateQueries({ queryKey: ['urgentAnnouncementAcks'] });
      onAcknowledge();
      toast.success('Annonce marquée comme lue');
    },
    onError: () => {
      toast.error('Erreur lors de la validation');
    }
  });

  if (!announcement) return null;

  const config = SEVERITY_CONFIG[announcement.severity] || SEVERITY_CONFIG.important;
  const Icon = config.icon;

  return (
    <Dialog open={!!announcement} onOpenChange={() => {}}>
      <DialogContent 
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        hideCloseButton
      >
        <DialogHeader>
          <div className={cn(
            "flex items-center gap-3 p-4 rounded-lg mb-4",
            config.bg,
            config.border,
            "border-2"
          )}>
            <Icon className={cn("w-8 h-8", config.color)} />
            <div className="flex-1">
              <div className={cn("text-xs font-semibold uppercase mb-1", config.color)}>
                {config.label}
              </div>
              <DialogTitle className="text-xl font-bold text-gray-900">
                {announcement.title}
              </DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="prose prose-sm max-w-none">
            <p className="text-gray-700 whitespace-pre-wrap">
              {announcement.content}
            </p>
          </div>

          {announcement.ends_at && (
            <div className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded">
              📅 Valable jusqu'au {new Date(announcement.ends_at).toLocaleString('fr-FR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          )}

          {announcement.ack_deadline_at && (
            <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded font-medium">
              ⏰ À lire avant le {new Date(announcement.ack_deadline_at).toLocaleString('fr-FR', {
                day: 'numeric',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          )}

          <div className="pt-4 border-t">
            <Button
              onClick={() => acknowledgeMutation.mutate()}
              disabled={acknowledgeMutation.isPending}
              className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-base font-semibold"
            >
              ✅ J'ai lu et compris
            </Button>
            <p className="text-xs text-center text-gray-500 mt-2">
              Vous devez confirmer avoir lu cette annonce pour continuer
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}