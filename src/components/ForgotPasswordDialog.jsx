import React, { useState } from 'react';
import { describeError } from '@/lib/errors';
import { Mail, Loader2, Send } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import FormField from '@/components/ui/form-field';
import FormActions from '@/components/ui/form-actions';
import FeedbackPanel from '@/components/ui/feedback-panel';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';

/**
 * Boîte de dialogue « Mot de passe oublié » : envoie un lien de réinitialisation
 * par e-mail (Supabase Auth) qui redirige vers /reset-password.
 *
 * @param {boolean}  open
 * @param {Function} onOpenChange
 * @param {string}   [defaultEmail]  e-mail pré-rempli (depuis le champ de login)
 */
const ForgotPasswordDialog = ({ open, onOpenChange, defaultEmail = '' }) => {
  const { toast } = useToast();
  const [email, setEmail] = useState(defaultEmail);
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [emailError, setEmailError] = useState('');

  React.useEffect(() => {
    if (open) {
      setEmail(defaultEmail || '');
      setSent(false);
      setIsLoading(false);
      setEmailError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setEmailError('Saisissez votre adresse e-mail.');
      return;
    }
    setEmailError('');

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      // On affiche un message neutre dans tous les cas (ne pas révéler si l'e-mail existe).
      if (error && !/rate limit|too many/i.test(error.message || '')) {
        // Erreur technique réelle (config, réseau) — on informe.
        toast({ title: 'Erreur', description: describeError(error, 'ForgotPasswordDialog'), variant: 'destructive' });
        setIsLoading(false);
        return;
      }
      setSent(true);
    } catch (err) {
      toast({ title: 'Erreur', description: "Une erreur inattendue s'est produite.", variant: 'destructive' });
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isLoading) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" aria-hidden="true" />
            Mot de passe oublié
          </DialogTitle>
          <DialogDescription>
            Saisissez votre e-mail : si un compte existe, vous recevrez un lien pour réinitialiser votre mot de passe.
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="space-y-3 py-2">
            <FeedbackPanel tone="success" title="Demande envoyée">
              <p className="mt-1 leading-6">
                Si un compte est associé à <span className="font-semibold">{email.trim().toLowerCase()}</span>, un e-mail de réinitialisation vient d’être envoyé. Vérifiez votre boîte de réception et vos spams.
              </p>
            </FeedbackPanel>
            <FormActions>
              <Button type="button" onClick={() => onOpenChange(false)}>Fermer</Button>
            </FormActions>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField
              id="forgot-email"
              label="Adresse e-mail"
              hint="Utilisez l’adresse associée à votre compte."
              error={emailError}
              required
            >
              <Input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(''); }}
                placeholder="exemple@groupecarrus.com"
                disabled={isLoading}
                autoComplete="email"
              />
            </FormField>
            <FormActions>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>Annuler</Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Envoyer le lien
              </Button>
            </FormActions>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ForgotPasswordDialog;
