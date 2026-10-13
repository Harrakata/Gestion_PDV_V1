import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getCurrentSupabaseClient } from '@/lib/supabaseClient';
import { requestAssistant } from '@/lib/assistantService';
import {
  ASSISTANT_VISIBILITY_EVENT,
  isFloatingAssistantVisible,
} from '@/lib/assistantPreferences';
import { assistantSpaceFromPath } from '../../../supabase/functions/_shared/assistantAccess.js';
import AssistantPanel from './AssistantPanel';

export default function FloatingAssistant() {
  const location = useLocation();
  const navigate = useNavigate();
  const space = assistantSpaceFromPath(location.pathname);
  const client = useMemo(() => getCurrentSupabaseClient(), [space]);
  const [authUser, setAuthUser] = useState(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [visible, setVisible] = useState(true);
  const identity = authUser?.id || null;
  const normalizedPath = location.pathname.replace(/\/+$/, '') || '/';
  const isHomePage = normalizedPath === '/';
  useEffect(() => {
    let active = true;
    setAuthResolved(false);
    client.auth.getSession().then(({ data }) => {
      if (!active) return;
      const user = data.session?.user || null;
      setAuthUser(user);
      setVisible(isFloatingAssistantVisible(user));
      setAuthResolved(true);
    });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      const user = session?.user || null;
      setAuthUser(user);
      setVisible(isFloatingAssistantVisible(user));
      setAuthResolved(true);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [client]);

  useEffect(() => {
    const handleVisibilityChange = (event) => {
      if (!identity || event.detail?.userId !== identity) return;
      setVisible(event.detail.visible !== false);
    };
    window.addEventListener(ASSISTANT_VISIBILITY_EVENT, handleVisibilityChange);
    return () => window.removeEventListener(ASSISTANT_VISIBILITY_EVENT, handleVisibilityChange);
  }, [identity]);

  const request = useCallback((body, signal) => requestAssistant(client, body, signal), [client]);
  if (
    import.meta.env.VITE_ASSISTANT_ENABLED === 'false'
    || isHomePage
    || !authResolved
    || (identity && !visible)
  ) return null;
  return <AssistantPanel key={`${space || 'public'}:${identity || 'guest'}`} space={space}
    currentTab={location.pathname.split('/')[2] || ''} authenticated={Boolean(identity)} request={request} onNavigate={navigate} />;
}
