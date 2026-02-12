import React from 'react';
import { UserX, Mail, LogOut } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

/**
 * Error screen shown when a user account is not linked to an Employee record
 * Used as fallback for users who are authenticated but not registered in Personnel
 */
export default function UserNotRegisteredError({ userEmail }) {
  const handleLogout = () => {
    base44.auth.logout();
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
        <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <UserX className="w-10 h-10 text-orange-600" />
        </div>
        
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          Compte non rattaché
        </h1>
        
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-700 mb-2">
            Votre email <strong>{userEmail}</strong> n'est pas encore rattaché à une fiche personnel.
          </p>
          <p className="text-sm text-gray-600">
            Contactez un gérant ou un administrateur pour activer votre accès.
          </p>
        </div>

        <div className="flex items-start gap-3 text-left bg-blue-50 border border-blue-200 rounded-lg p-4 text-xs text-gray-600">
          <Mail className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-blue-900 mb-1">Pour les administrateurs:</p>
            <p>Créez ou modifiez une fiche Personnel avec cet email pour donner l'accès à cet utilisateur.</p>
          </div>
        </div>

        <Button
          onClick={handleLogout}
          variant="outline"
          className="mt-6 w-full"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Se déconnecter
        </Button>
      </div>
    </div>
  );
}