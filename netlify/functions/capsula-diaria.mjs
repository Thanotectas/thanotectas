// netlify/functions/capsula-diaria.mjs
//
// Background Function que se ejecuta diariamente (15min de timeout).
// Orquesta el ciclo completo:
//   1. Selecciona la próxima cápsula pública no posteada
//   2. Renderiza un PNG con la plantilla Thanotectas
//   3. Lo sube a Supabase Storage (bucket capsulas-imagenes)
//   4. Postea a X, Instagram y Threads en paralelo
//   5. Marca la cápsula como posteada
//
// Cron: configurar en netlify.toml [functions."capsula-diaria"] schedule = "0 14 * * *" (9am COL)
//
// Env vars requeridas: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SITE_URL, GEMINI_API_KEY,
//                      IG_USER_ID, IG_PAGE_TOKEN, X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.SITE_URL || "https://thanotectas.com";
const IG_USER_ID = process.env.IG_USER_ID;
const IG_PAGE_TOKEN = process.env.IG_PAGE_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const STORAGE_BUCKET = "capsulas-imagenes";

export default async (req) => {
  console.log("[capsula-diaria] Iniciando ciclo");

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Seleccionar próxima cápsula: pública, no sellada, no posteada
    const { data: capsulas, error: errSel } = await supabase
      .from("capsulas")
      .select(`
        id,
        guardian_id,
        sujeto,
        categoria,
        tipo,
        contenido,
        numero_certificado,
        created_at,
        es_publica,
        es_sellada,
        posteado_en
      `)
      .eq("es_publica", true)
      .eq("es_sellada", false)
      .is("posteado_en", null)
      .order("created_at", { ascending: true })
      .limit(1);

    if (errSel) {
      console.error("[capsula-diaria] Error consultando cápsulas:", errSel);
      return new Response(JSON.stringify({ error: "DB error" }), { status: 500 });
    }

    if (!capsulas || capsulas.length === 0) {
      console.log("[capsula-diaria] Sin cápsulas pendientes");
      return new Response(JSON.stringify({ ok: true, message: "Sin cápsulas pendientes" }), { status: 200 });
    }

    const capsula = capsulas[0];
    console.log(`[capsula-diaria] Procesando: ${capsula.numero_certificado || capsula.id}`);

    // 2) Generar imagen con Gemini (placeholder: usar URL directa por ahora)
    // TODO: Implementar renderizado de PNG con imagen
    const imagenUrl = `${SITE_URL}/umbral-og.png`;

    // 3) Construir captions
    const captions = construirCaptions(capsula, imagenUrl);

    // 4) Postear a Instagram
    let igResult = { ok: false, error: "Skipped" };
    if (IG_PAGE_TOKEN && IG_USER_ID) {
      try {
        igResult = await postearInstagram(captions.instagram, imagenUrl);
      } catch (err) {
        console.error("[capsula-diaria] Error posteando a IG:", err);
        igResult = { ok: false, error: err.message };
      }
    }

    // 5) Postear a X (si tenemos credenciales)
    let xResult = { ok: false, error: "Credentials not configured" };
    // TODO: Implementar X posting cuando tengamos keys

    // 6) Postear a Threads (si tenemos token)
    let threadsResult = { ok: false, error: "Credentials not configured" };
    // TODO: Implementar Threads posting cuando tengamos token

    const platforms = {
      instagram: igResult,
      x: xResult,
      threads: threadsResult,
    };

    // 7) Marcar cápsula como posteada
    const { error: errUpd } = await supabase
      .from("capsulas")
      .update({
        posteado_en: new Date().toISOString(),
        posts_metadata: platforms,
        imagen_url: imagenUrl,
      })
      .eq("id", capsula.id);

    if (errUpd) {
      console.error("[capsula-diaria] Error marcando como posteada:", errUpd);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        capsula: capsula.numero_certificado,
        platforms,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[capsula-diaria] Error general:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function construirCaptions(capsula, imagenUrl) {
  const año = new Date(capsula.created_at).getFullYear();
  const numero = capsula.numero_certificado || "";
  const sujeto = capsula.sujeto;
  const tipo = (capsula.tipo || "").toLowerCase();
  const enlace = `${process.env.SITE_URL || "https://thanotectas.com"}/c/${numero}`;
  const cuerpo = capsula.contenido.trim();

  // X — máx 280 chars
  const xMaxBody = 200;
  const xCuerpo = cuerpo.length > xMaxBody
    ? cuerpo.slice(0, xMaxBody - 1) + "…"
    : cuerpo;
  const x = `${xCuerpo}\n\n— ${sujeto} · ${tipo} · ${año}\n\n🌿 ${enlace}`;

  // Instagram — con hashtags
  const hashtags = [
    "#archivodelumbral",
    "#dueloecologico",
    "#thanotectas",
    "#memoriaecologica",
    "#colombia",
    `#${(capsula.categoria || "").toLowerCase()}`,
  ]
    .filter(Boolean)
    .join(" ");

  const instagram =
    `${cuerpo}\n\n— ${sujeto} · ${tipo} · ${año}\n\n` +
    `${numero}\n${enlace}\n\n${hashtags}`;

  // Threads — hasta 500 chars
  const threadsMaxBody = 380;
  const tCuerpo = cuerpo.length > threadsMaxBody
    ? cuerpo.slice(0, threadsMaxBody - 1) + "…"
    : cuerpo;
  const threads = `${tCuerpo}\n\n— ${sujeto} · ${tipo} · ${año}\n\n${enlace}`;

  return { x, instagram, threads };
}

async function postearInstagram(caption, imagenUrl) {
  const IG_USER_ID = process.env.IG_USER_ID;
  const IG_PAGE_TOKEN = process.env.IG_PAGE_TOKEN;

  if (!IG_USER_ID || !IG_PAGE_TOKEN) {
    return { ok: false, error: "Missing IG credentials" };
  }

  try {
    // Crear container
    const containerRes = await fetch(
      `https://graph.instagram.com/v21.0/${IG_USER_ID}/media?image_url=${encodeURIComponent(imagenUrl)}&caption=${encodeURIComponent(caption)}&access_token=${IG_PAGE_TOKEN}`,
      { method: "POST" }
    );

    const containerData = await containerRes.json();
    if (!containerData.id) {
      throw new Error(`Container creation failed: ${JSON.stringify(containerData)}`);
    }

    const containerId = containerData.id;
    console.log(`[IG] Container creado: ${containerId}`);

    // Esperar a que se procese
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Publicar
    const publishRes = await fetch(
      `https://graph.instagram.com/v21.0/${IG_USER_ID}/media_publish?creation_id=${containerId}&access_token=${IG_PAGE_TOKEN}`,
      { method: "POST" }
    );

    const publishData = await publishRes.json();
    if (!publishData.id) {
      throw new Error(`Publish failed: ${JSON.stringify(publishData)}`);
    }

    console.log(`[IG] Post publicado: ${publishData.id}`);
    return { ok: true, postId: publishData.id };
  } catch (err) {
    console.error("[IG] Error:", err.message);
    return { ok: false, error: err.message };
  }
}
