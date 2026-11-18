import React from 'react';
import { Loader2, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';

/** Formulaire d’accès commun à tous les espaces applicatifs. */
export default function SpaceLoginCard({
  title,
  description,
  icon,
  identifier,
  onIdentifierChange,
  identifierLabel = 'Identifiant',
  identifierPlaceholder = 'Email ou matricule',
  identifierType = 'text',
  password,
  onPasswordChange,
  isLoading = false,
  onSubmit,
  onForgotPassword,
}) {
  return (
    <Card variant="elevated" className="w-full max-w-md border-border">
      <CardHeader className="items-center text-center">
        <div className="mb-1 flex h-12 items-center justify-center text-primary">
          {React.isValidElement(icon) ? React.cloneElement(icon, { className: 'h-7 w-7', 'aria-hidden': true }) : <LogIn className="h-7 w-7" />}
        </div>
        <CardTitle className="text-2xl text-primary sm:text-3xl">{title}</CardTitle>
        <CardDescription className="max-w-sm">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-5" aria-busy={isLoading}>
          <FormField label={identifierLabel} required>
            <Input
              type={identifierType}
              value={identifier}
              onChange={(event) => onIdentifierChange(event.target.value)}
              placeholder={identifierPlaceholder}
              disabled={isLoading}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
            />
          </FormField>
          <FormField label="Mot de passe" required>
            <PasswordInput
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="••••••••"
              disabled={isLoading}
              autoComplete="current-password"
            />
          </FormField>
          <Button type="submit" size="touch" className="w-full" disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogIn className="h-4 w-4" aria-hidden="true" />}
            {isLoading ? 'Connexion…' : 'Se connecter'}
          </Button>
          {onForgotPassword ? (
            <div className="text-center">
              <button type="button" onClick={onForgotPassword} className="rounded text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Mot de passe oublié ?
              </button>
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
