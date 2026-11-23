import React, { useEffect, useState } from 'react';
import { describeError } from '@/lib/errors';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import PasswordInput from '@/components/ui/password-input';
import FormField from '@/components/ui/form-field';
import FormActions from '@/components/ui/form-actions';
import FeedbackPanel from '@/components/ui/feedback-panel';
import { useToast } from '@/components/ui/use-toast';
import { defaultSupabase } from '@/lib/supabaseClient';

const MIN_PASSWORD_LENGTH = 6;

/**
 * Page de réinitialisation du mot de passe, atteinte via le lien reçu par e-mail.
 * Supabase établit une session « recovery » à partir du token présent dans l'URL.
 */
const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [status, setStatus] = useState('checking'); // checking | ready | invalid | done
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    let cancelled = false;

    // 1) Écoute l'évènement PASSWORD_RECOVERY (déclenché par detectSessionInUrl)
    const { data: sub } = defaultSupabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setStatus('ready');
      }
    });

    // 2) Au cas où la session est déjà établie au montage
    defaultSupabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data?.session) {
        setStatus('ready');
      } else {
        // Laisse 2.5s à detectSessionInUrl pour traiter le hash, sinon lien invalide/expiré
        setTimeout(() => {
          if (cancelled) return;
          setStatus((current) => (current === 'checking' ? 'invalid' : current));
        }, 2500);
      }
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setFieldErrors({ newPassword: `Utilisez au moins ${MIN_PASSWORD_LENGTH} caractères.` });
      return;
    }
    if (newPassword !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'Les deux mots de passe ne correspondent pas.' });
      return;
    }

    setFieldErrors({});
    setIsLoading(true);
    try {
      const { error } = await defaultSupabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast({ title: 'Échec', description: describeError(error, 'ResetPasswordPage'), variant: 'destructive' });
        setIsLoading(false);
        return;
      }
      // On déconnecte la session de récupération pour forcer une reconnexion propre.
      await defaultSupabase.auth.signOut().catch(() => {});
      setStatus('done');
      toast({ title: 'Mot de passe réinitialisé', description: 'Vous pouvez maintenant vous reconnecter.', className: 'bg-success text-success-foreground' });
    } catch (err) {
      toast({ title: 'Erreur', description: "Une erreur inattendue s'est produite.", variant: 'destructive' });
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-center min-h-[calc(100vh-12rem)] p-4"
    >
      <Card variant="elevated" className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
            Réinitialiser le mot de passe
          </CardTitle>
          <CardDescription>Choisissez un nouveau mot de passe pour votre compte.</CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'checking' && (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Vérification du lien…
            </div>
          )}

          {status === 'invalid' && (
            <div className="space-y-4 py-2">
              <FeedbackPanel
                tone="warning"
                title="Lien invalide ou expiré"
                description="Relancez une demande de réinitialisation depuis la page de connexion."
              />
              <Button asChild className="w-full"><Link to="/">Retour à l'accueil</Link></Button>
            </div>
          )}

          {status === 'done' && (
            <div className="space-y-4 py-2">
              <FeedbackPanel
                tone="success"
                title="Mot de passe réinitialisé"
                description="Reconnectez-vous avec votre nouveau mot de passe."
              />
              <Button asChild className="w-full"><Link to="/">Aller à la connexion</Link></Button>
            </div>
          )}

          {status === 'ready' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <FormField
                id="reset-new"
                label="Nouveau mot de passe"
                hint={`Utilisez au moins ${MIN_PASSWORD_LENGTH} caractères.`}
                error={fieldErrors.newPassword}
                required
              >
                <PasswordInput
                  visible={showPassword}
                  onVisibleChange={setShowPassword}
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); if (fieldErrors.newPassword) setFieldErrors({}); }}
                  placeholder="Saisissez votre nouveau mot de passe"
                  disabled={isLoading}
                  autoComplete="new-password"
                />
              </FormField>
              <FormField
                id="reset-confirm"
                label="Confirmer le mot de passe"
                error={fieldErrors.confirmPassword}
                required
              >
                <PasswordInput
                  visible={showPassword}
                  onVisibleChange={setShowPassword}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); if (fieldErrors.confirmPassword) setFieldErrors({}); }}
                  placeholder="Saisissez-le à nouveau"
                  disabled={isLoading}
                  autoComplete="new-password"
                />
              </FormField>
              <FormActions>
                <Button type="submit" className="w-full sm:w-auto" disabled={isLoading}>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  Réinitialiser
                </Button>
              </FormActions>
            </form>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default ResetPasswordPage;
