import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Invite() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    if (tokenParam) {
      setToken(tokenParam);
    }
  }, []);

  const { data: invitation, isLoading, error: fetchError } = useQuery({
    queryKey: ['invitation', token],
    queryFn: async () => {
      if (!token) return null;
      const invitations = await base44.entities.Invitation.filter({ token, status: 'pending' });
      return invitations[0] || null;
    },
    enabled: !!token
  });

  const acceptMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.functions.invoke('acceptInvitation', data);
    },
    onSuccess: () => {
      setSuccess(true);
      setTimeout(() => {
        window.location.href = '/login';
      }, 2000);
    },
    onError: (err) => {
      setError(err.response?.data?.error || 'Erreur lors de l\'activation');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    acceptMutation.mutate({
      token,
      password
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!token || !invitation || fetchError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Invitation invalide</h1>
          <p className="text-slate-400 mb-6">
            Cette invitation n'existe pas, a expiré ou a déjà été utilisée.
          </p>
          <Button
            onClick={() => window.location.href = '/login'}
            className="bg-orange-600 hover:bg-orange-700"
          >
            Retour à la connexion
          </Button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-md w-full text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Compte activé !</h1>
          <p className="text-slate-400 mb-6">
            Votre compte a été activé avec succès. Vous allez être redirigé vers la page de connexion...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Bienvenue !</h1>
          <p className="text-slate-400">
            Vous avez été invité par <span className="text-orange-500 font-semibold">{invitation.invited_by_name}</span>
          </p>
        </div>

        <div className="bg-slate-700/50 rounded-xl p-4 mb-6">
          <p className="text-sm text-slate-300">
            <span className="font-semibold">{invitation.first_name} {invitation.last_name}</span>
            <br />
            {invitation.email}
            {invitation.team && (
              <>
                <br />
                <span className="text-slate-400">Équipe : {invitation.team}</span>
              </>
            )}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="password">Choisissez votre mot de passe</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-slate-700 border-slate-600 mt-1"
              placeholder="Minimum 8 caractères"
              required
            />
          </div>

          <div>
            <Label htmlFor="confirm">Confirmez le mot de passe</Label>
            <Input
              id="confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="bg-slate-700 border-slate-600 mt-1"
              placeholder="Retapez votre mot de passe"
              required
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={acceptMutation.isPending}
            className="w-full bg-orange-600 hover:bg-orange-700 min-h-[44px]"
          >
            {acceptMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Activer mon compte
          </Button>
        </form>
      </div>
    </div>
  );
}