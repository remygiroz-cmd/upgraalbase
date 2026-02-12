import React, { useState } from 'react';
import { Megaphone, Pin, AlertCircle, Info, Calendar, Users, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

const categoryIcons = {
  info: Info,
  urgent: AlertCircle,
  planning: Calendar,
  rh: Users,
  promo: Megaphone
};

const categoryColors = {
  info: 'bg-blue-50 border-blue-200 text-blue-700',
  urgent: 'bg-red-50 border-red-200 text-red-700',
  planning: 'bg-purple-50 border-purple-200 text-purple-700',
  rh: 'bg-green-50 border-green-200 text-green-700',
  promo: 'bg-orange-50 border-orange-200 text-orange-700'
};

const categoryLabels = {
  info: 'Info',
  urgent: 'Urgent',
  planning: 'Planning',
  rh: 'RH',
  promo: 'Promo'
};

export default function AnnouncementsList({ announcements, currentEmployee }) {
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);

  return (
    <>
      <div className="space-y-3">
        {announcements.map(announcement => {
          const Icon = categoryIcons[announcement.category] || Megaphone;
          const colorClass = categoryColors[announcement.category] || categoryColors.info;

          return (
            <button
              key={announcement.id}
              onClick={() => setSelectedAnnouncement(announcement)}
              className={cn(
                "w-full text-left rounded-lg border-2 p-4 transition-all hover:shadow-md",
                colorClass
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  "p-2 rounded-lg flex-shrink-0",
                  announcement.is_pinned && "bg-white/50"
                )}>
                  {announcement.is_pinned ? (
                    <Pin className="w-5 h-5" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-sm line-clamp-1">
                      {announcement.title}
                    </h3>
                    <Badge variant="outline" className="text-[10px] flex-shrink-0">
                      {categoryLabels[announcement.category]}
                    </Badge>
                  </div>
                  
                  <p className="text-xs opacity-80 line-clamp-2">
                    {announcement.content}
                  </p>
                  
                  <p className="text-[10px] opacity-60 mt-2">
                    {new Date(announcement.created_date).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Announcement Detail Modal */}
      <Dialog open={!!selectedAnnouncement} onOpenChange={() => setSelectedAnnouncement(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedAnnouncement && (() => {
                const Icon = categoryIcons[selectedAnnouncement.category] || Megaphone;
                return (
                  <>
                    <Icon className="w-5 h-5" />
                    {selectedAnnouncement.title}
                  </>
                );
              })()}
            </DialogTitle>
          </DialogHeader>
          
          {selectedAnnouncement && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {categoryLabels[selectedAnnouncement.category]}
                </Badge>
                {selectedAnnouncement.is_pinned && (
                  <Badge variant="outline" className="bg-yellow-50">
                    <Pin className="w-3 h-3 mr-1" />
                    Épinglé
                  </Badge>
                )}
              </div>
              
              <div className="prose prose-sm max-w-none">
                <p className="whitespace-pre-wrap">{selectedAnnouncement.content}</p>
              </div>
              
              <div className="text-xs text-gray-500 border-t pt-3">
                Publié le {new Date(selectedAnnouncement.created_date).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}