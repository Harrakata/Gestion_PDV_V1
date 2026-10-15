import { fetchAllSupabaseRows } from './supabasePages.js';

export const fetchAllMobiTerminals = (client, columns) => fetchAllSupabaseRows(
  client, 'terminaux_mobi', columns, [['reference', true], ['id', true]],
);
