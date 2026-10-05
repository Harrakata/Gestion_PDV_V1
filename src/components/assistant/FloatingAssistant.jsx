import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getCurrentSupabaseClient } from '@/lib/supabaseClient';
import { requestAssistant } from '@/lib/assistantService';
import { assistantSpaceFromPath } from '../../../supabase/functions/_shared/assistantAccess.js';
import AssistantPanel from './AssistantPanel';

export default function FloatingAssistant() {
  const location = useLocation();
  const navigate = useNavigate();
  const space = assistantSpaceFromPath(location.pathname);
  const client = useMemo(() => getCurrentSupabaseClient(), [space]);
  const [identity, setIdentity] = useState(null);
  useEffect(() => {
    let active = true;
    setIdentity(null);
    client.auth.getSession().then(({ data }) => { if (active) setIdentity(data.session?.user?.id || null); });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => setIdentity(session?.user?.id || null));
    return () => { active = false; subscription.unsubscribe(); };
  }, [client]);
  const request = useCallback((body, signal) => requestAssistant(client, body, signal), [client]);
  if (import.meta.env.VITE_ASSISTANT_ENABLED === 'false') return null;
  return <AssistantPanel key={`${space || 'public'}:${identity || 'guest'}`} space={space}
    currentTab={location.pathname.split('/')[2] || ''} authenticated={Boolean(identity)} request={request} onNavigate={navigate} />;
}
