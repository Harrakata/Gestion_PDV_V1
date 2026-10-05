export async function requestAssistant(client, body, signal) {
  const { data: { session } = {} } = await client.auth.getSession();
  if (!session?.access_token) {
    const error = new Error('Connectez-vous à cet espace pour utiliser l’IA.');
    error.status = 401;
    throw error;
  }
  const base = new URL(import.meta.env.VITE_SUPABASE_URL, window.location.origin).toString().replace(/\/$/, '');
  const response = await fetch(`${base}/functions/v1/operational-assistant`, {
    method: 'POST', signal,
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(typeof result.error === 'string' ? result.error : 'Service IA indisponible.');
    error.status = response.status;
    throw error;
  }
  if (!['guide', 'ai'].includes(result.mode)) throw new Error('Réponse du service invalide.');
  return result;
}
