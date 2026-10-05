import { createClient } from 'npm:@supabase/supabase-js@2';
import { createAssistantHandler } from '../_shared/assistantHandler.js';

Deno.serve(createAssistantHandler({ createClient, env: (key: string) => Deno.env.get(key) }));
