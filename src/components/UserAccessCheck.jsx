import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertCircle, Mail } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function UserAccessCheck({ children }) {
  const { data: currentUser, isLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    staleTime: 0, // Pas de cache pour vérifier le status en temps réel
    refetchOnMount: true,
    refetchOnWindowFocus: true
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  // Vérifier si le compte est désactivé, supprimé, ou sans rôle
  if (!currentUser || currentUser.status === 'disabled' || currentUser.status === 'deleted' || !currentUser.role_id) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border-2 border-red-300 p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            Profil désactivé
          </h1>
          <p className="text-gray-700 mb-6 leading-relaxed">
            Votre profil est désactivé. Merci de vous rapprocher des personnes autorisées.
          </p>
          <div className="bg-gray-50 rounded-xl p-4 mb-6 border border-gray-200">
            <p className="text-sm text-gray-600 mb-2 flex items-center justify-center gap-2">
              <Mail className="w-4 h-4" />
              Contactez votre administrateur
            </p>
            <p className="text-xs text-gray-500">
              Pour toute question concernant votre accès
            </p>
          </div>
          <button
            onClick={() => base44.auth.logout()}
            className="w-full bg-gray-900 hover:bg-gray-800 text-white font-medium py-3 px-4 rounded-xl transition-colors"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  return children;
}