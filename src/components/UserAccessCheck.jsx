import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertCircle, Mail, UserX } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * UserAccessCheck - Vérifie et lie automatiquement le compte auth à la fiche Personnel
 * 
 * Logique:
 * 1. Récupère l'email du user connecté
 * 2. Cherche la fiche Personnel correspondante (email normalisé)
 * 3. Si trouvée: lie user_id si nécessaire
 * 4. Si non trouvée: affiche un écran de blocage
 */
export default function UserAccessCheck({ children }) {
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState(null);
  const queryClient = useQueryClient();

  // Get current authenticated user
  const { data: currentUser, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    staleTime: 0,
    refetchOnMount: true
  });

  // Normalize email for comparison
  const normalizeEmail = (email) => {
    if (!email) return '';
    return email.trim().toLowerCase();
  };

  // Get all employees to find match
  const { data: employees = [], isLoading: employeesLoading } = useQuery({
    queryKey: ['allEmployees'],
    queryFn: () => base44.entities.Employee.list(),
    enabled: !!currentUser && currentUser.role !== 'admin',
    staleTime: 60 * 1000
  });

  // Mutation to link user_id to employee record
  const linkUserMutation = useMutation({
    mutationFn: async ({ employeeId, userId }) => {
      return await base44.entities.Employee.update(employeeId, { user_id: userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allEmployees'] });
      queryClient.invalidateQueries({ queryKey: ['myEmployeeRecord'] });
    }
  });

  useEffect(() => {
    if (userLoading || employeesLoading) {
      return;
    }

    // Admin users bypass this check
    if (currentUser?.role === 'admin') {
      setChecking(false);
      return;
    }

    if (!currentUser?.email) {
      setError('NO_USER');
      setChecking(false);
      return;
    }

    const userEmail = normalizeEmail(currentUser.email);

    // Find matching employee record by email
    const matchingEmployee = employees.find(emp => 
      normalizeEmail(emp.email) === userEmail
    );

    if (!matchingEmployee) {
      setError('NO_EMPLOYEE_RECORD');
      setChecking(false);
      return;
    }

    // If employee found but user_id not set or different, link them
    if (!matchingEmployee.user_id || matchingEmployee.user_id !== currentUser.id) {
      linkUserMutation.mutate(
        { employeeId: matchingEmployee.id, userId: currentUser.id },
        {
          onSuccess: () => {
            console.log(`✅ User ${currentUser.email} linked to employee record ${matchingEmployee.id}`);
            setChecking(false);
          },
          onError: (err) => {
            console.error('Error linking user to employee:', err);
            setError('LINK_ERROR');
            setChecking(false);
          }
        }
      );
    } else {
      // Already linked, all good
      setChecking(false);
    }
  }, [currentUser, employees, userLoading, employeesLoading]);

  // Loading state
  if (checking || userLoading || employeesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Vérification de votre accès...</p>
        </div>
      </div>
    );
  }

  // Error states
  if (error === 'NO_EMPLOYEE_RECORD') {
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
              Votre email <strong>{currentUser?.email}</strong> n'est pas encore rattaché à une fiche personnel.
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

          <button
            onClick={() => {
              base44.auth.logout();
              window.location.href = '/';
            }}
            className="mt-6 px-6 py-2.5 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  if (error === 'LINK_ERROR') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md bg-white rounded-xl shadow-lg p-8 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Erreur de liaison</h1>
          <p className="text-gray-600 mb-6">
            Une erreur est survenue lors de la liaison de votre compte. Veuillez réessayer.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  // All checks passed, render children
  return <>{children}</>;
}