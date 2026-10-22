import { createClient } from "npm:@supabase/supabase-js@2";

const TABLE_NAME = Deno.env.get("TABLE_NAME") ?? "SUIVI_TRM_MOBI_QUOTIDIEN_V2";
const POWERBI_TABLE_NAME = Deno.env.get("POWERBI_TABLE_NAME")
  ?? "CLN_FNIR SUIVI_TRM_MOBI_QUOTIDIEN_V2";

const POWERBI_ACCESS_TOKEN = Deno.env.get("POWERBI_ACCESS_TOKEN");
const POWERBI_GROUP_ID = Deno.env.get("POWERBI_GROUP_ID");
const POWERBI_DATASET_ID = Deno.env.get("POWERBI_DATASET_ID");
const POWERBI_TENANT_ID = Deno.env.get("POWERBI_TENANT_ID");
const POWERBI_CLIENT_ID = Deno.env.get("POWERBI_CLIENT_ID");
const POWERBI_CLIENT_SECRET = Deno.env.get("POWERBI_CLIENT_SECRET");

const daxTableName = POWERBI_TABLE_NAME.replaceAll("'", "''");

const DAX_QUERY = `
EVALUATE
SUMMARIZECOLUMNS(
    '${daxTableName}'[DATE_SUIVI],
    '${daxTableName}'[ID_TRM_MOBI],
    '${daxTableName}'[AGE_D'UTILISATION],
    '${daxTableName}'[PREMIERE_UTILISATION],
    '${daxTableName}'[DERNIERE_UTILISATION],
    '${daxTableName}'[HORS_SERVICE],
    '${daxTableName}'[ENJEUX_JOUR],
    '${daxTableName}'[CUMUL_ENJEUX],
    '${daxTableName}'[CLIENT],
    '${daxTableName}'[PREMIER_PREPOSE],
    '${daxTableName}'[DERNIER_PREPOSE],
    '${daxTableName}'[NBRE_MOBI],
    '${daxTableName}'[ENJEUX],
    '${daxTableName}'[LISTE_PREPOSE_DU_JOUR],
    '${daxTableName}'[GAIN],
    '${daxTableName}'[ANNULATION]
)
`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type PBRow = Record<string, any>;

function getValue(r: PBRow, column: string) {
  if (r[column] !== undefined) return r[column];
  const qualifiedKey = Object.keys(r).find((key) => key.endsWith(`[${column}]`));
  return qualifiedKey ? r[qualifiedKey] : undefined;
}

function normalizeText(v: any) {
  if (v === undefined || v === null) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  return v;
}

function normalizeDate(v: any) {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "string") {
    const frenchDate = v.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (frenchDate) return `${frenchDate[3]}-${frenchDate[2]}-${frenchDate[1]}`;
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeNumber(v: any) {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isNaN(n) ? null : n;
}

function mapRow(r: PBRow) {
  return {
    date_suivi:             normalizeDate(getValue(r, "DATE_SUIVI")),
    id_trm_mobi:          normalizeText(getValue(r, "ID_TRM_MOBI")),
    age_d_utilisation:    normalizeNumber(getValue(r, "AGE_D'UTILISATION")),
    premiere_utilisation: normalizeDate(getValue(r, "PREMIERE_UTILISATION")),
    derniere_utilisation: normalizeDate(getValue(r, "DERNIERE_UTILISATION")),
    hors_service:         normalizeNumber(getValue(r, "HORS_SERVICE")),
    enjeux_jour:          normalizeNumber(getValue(r, "ENJEUX_JOUR")),
    cumul_enjeux:         normalizeNumber(getValue(r, "CUMUL_ENJEUX")),
    client:               normalizeText(getValue(r, "CLIENT")),
    premier_prepose:      normalizeText(getValue(r, "PREMIER_PREPOSE")),
    dernier_prepose:      normalizeText(getValue(r, "DERNIER_PREPOSE")),
    nbre_mobi:            normalizeNumber(getValue(r, "NBRE_MOBI")),
    enjeux:               normalizeNumber(getValue(r, "ENJEUX")),
    liste_prepose_du_jour: normalizeText(getValue(r, "LISTE_PREPOSE_DU_JOUR")),
    gain:                  normalizeNumber(getValue(r, "GAIN")),
    annulation:            normalizeNumber(getValue(r, "ANNULATION")),
  };
}

async function fetchPowerBIRows() {
  if (!POWERBI_GROUP_ID || !POWERBI_DATASET_ID) {
    throw new Error("Secrets manquants : POWERBI_GROUP_ID et POWERBI_DATASET_ID.");
  }

  const tokens: Array<{ source: string; value: string }> = [];
  if (POWERBI_ACCESS_TOKEN) {
    tokens.push({ source: "POWERBI_ACCESS_TOKEN", value: POWERBI_ACCESS_TOKEN });
  }

  let oauthError = "";
  if (POWERBI_TENANT_ID && POWERBI_CLIENT_ID && POWERBI_CLIENT_SECRET) {
    try {
      const tokenResponse = await fetch(
        `https://login.microsoftonline.com/${POWERBI_TENANT_ID}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: POWERBI_CLIENT_ID,
            client_secret: POWERBI_CLIENT_SECRET,
            scope: "https://analysis.windows.net/powerbi/api/.default",
          }),
        },
      );
      if (!tokenResponse.ok) {
        const details = await tokenResponse.text();
        throw new Error(`Authentification Power BI impossible (${tokenResponse.status}): ${details}`);
      }
      const oauthToken = (await tokenResponse.json())?.access_token;
      if (oauthToken) tokens.push({ source: "OAuth", value: oauthToken });
    } catch (cause: any) {
      oauthError = cause?.message ?? String(cause);
    }
  }

  if (tokens.length === 0) {
    throw new Error(oauthError ||
      "Secret manquant : POWERBI_ACCESS_TOKEN ou le trio POWERBI_TENANT_ID, POWERBI_CLIENT_ID, POWERBI_CLIENT_SECRET.");
  }

  const url =
    `https://api.powerbi.com/v1.0/myorg/groups/${POWERBI_GROUP_ID}/datasets/${POWERBI_DATASET_ID}/executeQueries`;

  const errors: string[] = [];
  for (const token of tokens) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.value}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        queries: [{ query: DAX_QUERY }],
        serializerSettings: { includeNulls: true },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return data?.results?.[0]?.tables?.[0]?.rows ?? [];
    }
    errors.push(`${token.source}: Power BI ${res.status}: ${await res.text()}`);
  }

  if (oauthError) errors.push(`OAuth: ${oauthError}`);
  throw new Error(errors.join(" | "));
}

async function upsertRows(supabase: any, payload: any[]) {
  const CHUNK = 1000;

  for (let i = 0; i < payload.length; i += CHUNK) {
    const chunk = payload.slice(i, i + CHUNK);

    const { error } = await supabase
      .from(TABLE_NAME)
      .upsert(chunk, { onConflict: "date_suivi,id_trm_mobi" });

    if (error) throw error;
  }
}

Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    if (req.method !== "POST" && req.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const rows = await fetchPowerBIRows();

    if (!rows.length) {
      return new Response(
        JSON.stringify({ ok: true, fetched: 0, upserted: 0 }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const mappedRows = rows.map(mapRow)
      .filter((row) => row.date_suivi !== null && row.id_trm_mobi !== null);
    const payload = [...new Map(mappedRows.map((row) => [
      `${row.date_suivi}\u0000${row.id_trm_mobi}`,
      row,
    ])).values()];

    await upsertRows(supabase, payload);

    return new Response(
      JSON.stringify({ ok: true, fetched: rows.length, upserted: payload.length }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message ?? String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
