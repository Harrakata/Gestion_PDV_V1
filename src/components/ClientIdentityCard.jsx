import { useEffect, useState } from 'react';
import { describeError } from '@/lib/errors';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Save, Loader2, UploadCloud } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { CLIENT_ID, STORAGE_BUCKET } from '@/lib/clientConfig';
import { supabase } from '@/lib/supabaseClient';
import { CLIENT_CURRENCY_OPTIONS, DEFAULT_CLIENT_CURRENCY } from '@/lib/currency';

// ════════════════════════════════════════════════════════════════════════════
//  Carte « Identité client » (multi-tenant)
//  Affiche l'identifiant technique du client (figé par le déploiement) et permet
//  d'éditer le branding (nom affiché + logo), stocké en base par-client.
// ════════════════════════════════════════════════════════════════════════════
const ClientIdentityCard = ({ canWrite = true }) => {
  const { toast } = useToast();
  const { client, setBranding } = useFeatureFlags();
  const [displayName, setDisplayName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [currency, setCurrency] = useState(DEFAULT_CLIENT_CURRENCY);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Synchronise les champs quand le branding est chargé/mis à jour.
  useEffect(() => {
    setDisplayName(client.displayName || '');
    setLogoUrl(client.logoUrl || '');
    setCurrency(client.currency || DEFAULT_CLIENT_CURRENCY);
  }, [client.currency, client.displayName, client.logoUrl]);

  // Import d'un logo local : upload vers le stockage puis renseigne l'URL publique.
  const handleLogoUpload = async (event) => {
    const file = event.target.files?.[0];
    if (event.target) event.target.value = null;
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Format invalide', description: 'Choisissez une image (PNG, JPG, SVG…).', variant: 'destructive' });
      return;
    }
    setIsUploading(true);
    try {
      const ext = (file.name?.split('.').pop() || 'png').toLowerCase();
      const fileName = `branding/${CLIENT_ID}_logo_${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(fileName, file, { cacheControl: '3600', upsert: true });
      if (error) {
        toast({ title: "Erreur d'import", description: describeError(error, 'ClientIdentityCard'), variant: 'destructive' });
      } else {
        const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(data.path);
        setLogoUrl(pub.publicUrl);
        toast({ title: 'Logo importé', description: "Cliquez sur « Sauvegarder l'identité » pour l'appliquer.", className: 'bg-success text-success-foreground' });
      }
    } catch (err) {
      toast({ title: 'Erreur', description: "Échec de l'import du logo.", variant: 'destructive' });
    }
    setIsUploading(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await setBranding({ displayName, logoUrl, currency });
      toast({ title: 'Identité client sauvegardée', className: 'bg-success text-success-foreground' });
    } catch (error) {
      toast({ title: 'Erreur de sauvegarde', description: describeError(error, 'ClientIdentityCard'), variant: 'destructive' });
    }
    setIsSaving(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-xl text-primary">
          <Building2 className="h-5 w-5" /> Identité client
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>Branding propre à ce client.</span>
          <span className="flex items-center gap-1.5">
            <Badge variant="secondary" className="font-mono">
              {CLIENT_ID}
            </Badge>
            <span className="text-xs text-muted-foreground">VITE_CLIENT_ID — non modifiable</span>
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="client-display-name">Nom affiché</Label>
            <Input
              id="client-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ex. PMU Mali"
              disabled={!canWrite || isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="client-currency">Devise</Label>
            <Select value={currency} onValueChange={setCurrency} disabled={!canWrite || isSaving}>
              <SelectTrigger id="client-currency">
                <SelectValue placeholder="Choisir une devise" />
              </SelectTrigger>
              <SelectContent>
                {CLIENT_CURRENCY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Utilisée pour les montants Mobi et l’État comptable.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="client-logo-url">Logo</Label>
            <Input
              id="client-logo-url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…/logo.png"
              disabled={!canWrite || isSaving || isUploading}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="client-logo-file"
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
                disabled={!canWrite || isSaving || isUploading}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('client-logo-file')?.click()}
                disabled={!canWrite || isSaving || isUploading}
              >
                {isUploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-1.5 h-4 w-4" />}
                Importer un logo
              </Button>
              <p className="text-xs text-muted-foreground">…ou collez un lien direct (PNG/SVG).</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-3">
          {logoUrl ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Aperçu :</span>
              <img
                src={logoUrl}
                alt="Aperçu du logo"
                className="h-9 max-w-[140px] object-contain"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
          ) : <span />}
          <Button onClick={handleSave} disabled={!canWrite || isSaving || isUploading} className="gap-2">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Sauvegarder l'identité
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ClientIdentityCard;
