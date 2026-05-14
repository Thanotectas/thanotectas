// netlify/functions/capsula-diaria.mjs
//
// Background Function que se ejecuta diariamente.
// Cron: 9am COL (14 UTC)

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.SITE_URL || "https://thanotectas.com";
const IG_USER_ID = process.env.IG_USER_ID;
const IG_PAGE_TOKEN = process.env.IG_PAGE_TOKEN;

// Instagram caption: max 2200 chars. Dejamos margen para metadata + hashtags.
const IG_CAPTION_MAX = 2200;
const IG_BODY_MAX = 1700; // espacio para body + ~500 chars de metadata/hashtags

export default async (req) => {
  console.log("[capsula-diaria] Iniciando ciclo");

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

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
      return new Response(JSON.stringify({ error: "DB error", details: errSel }), { status: 500 });
    }

    if (!capsulas || capsulas.length === 0) {
      console.log("[capsula-diaria] Sin cápsulas pendientes");
      return new Response(JSON.stringify({ ok: true, message: "Sin cápsulas pendientes" }), { status: 200 });
    }

    const capsula = capsulas[0];
    console.log(`[capsula-diaria] Procesando: ${capsula.numero_certificado || capsula.id}`);

    const imagenUrl = `${SITE_URL}/umbral-og.png`;
    console.log(`[capsula-diaria] Imagen: ${imagenUrl}`);

    const captions = construirCaptions(capsula);
    console.log(`[capsula-diaria] Caption length: ${captions.instagram.length} chars`);

    let igResult = { ok: false, error: "Skipped" };
    if (IG_PAGE_TOKEN && IG_USER_ID) {
      try {
        igResult = await postearInstagram(captions.instagram, imagenUrl);
        console.log("[capsula-diaria] Instagram:", igResult);
      } catch (err) {
        console.error("[capsula-diaria] Error Instagram:", err.message);
        igResult = { ok: false, error: err.message };
      }
    } else {
      console.warn("[capsula-diaria] IG credenciales faltando");
    }

    let xResult = { ok: false, error: "X credentials not configured" };
    let threadsResult = { ok: false, error: "Threads credentials not configured" };

    const platforms = {
      instagram: igResult,
      x: xResult,
      threads: threadsResult,
    };

    if (igResult.ok) {
      const { error: errUpd } = await supabase
        .from("capsulas")
        .update({
          posteado_en: new Date().toISOString(),
          posts_metadata: platforms,
          imagen_url: imagenUrl,
        })
        .eq("id", capsula.id);

      if (errUpd) {
        console.error("[capsula-diaria] Error actualizando BD:", errUpd);
      }
    }

    return new Response(
      JSON.stringify({
        ok: igResult.ok,
        capsula: capsula.numero_certificado,
        platforms,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[capsula-diaria] Error general:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: err.message }),
      { status: 500 }
    );
  }
};

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function construirCaptions(capsula) {
  const año = new Date(capsula.created_at).getFullYear();
  const numero = capsula.numero_certificado || "";
  const sujeto = capsula.sujeto;
  const tipo = (capsula.tipo || "").toLowerCase();
  const enlace = `${SITE_URL}/c/${numero}`;
  let cuerpo = capsula.contenido.trim();

  // Truncar body si es muy largo para IG
  if (cuerpo.length > IG_BODY_MAX) {
    cuerpo = cuerpo.slice(0, IG_BODY_MAX - 1).trim() + "…";
  }

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

  let instagram =
    `${cuerpo}\n\n— ${sujeto} · ${tipo} · ${año}\n\n` +
    `${numero}\n${enlace}\n\n${hashtags}`;

  // Safety net: truncar duro si todavía es muy largo
  if (instagram.length > IG_CAPTION_MAX) {
    instagram = instagram.slice(0, IG_CAPTION_MAX - 1).trim() + "…";
  }

  return { instagram };
}

async function postearInstagram(caption, imagenUrl) {
  if (!IG_USER_ID || !IG_PAGE_TOKEN) {
    throw new Error("Missing IG_USER_ID or IG_PAGE_TOKEN");
  }

  const containerUrl = `https://graph.facebook.com/v21.0/${IG_USER_ID}/media?image_url=${encodeURIComponent(imagenUrl)}&caption=${encodeURIComponent(caption)}&access_token=${IG_PAGE_TOKEN}`;
  
  const containerRes = await fetch(containerUrl, { method: "POST" });
  const containerData = await containerRes.json();

  if (!containerData.id) {
    throw new Error(`Container creation failed: ${JSON.stringify(containerData)}`);
  }

  const containerId = containerData.id;
  console.log(`[IG] Container created: ${containerId}`);

  await new Promise((resolve) => setTimeout(resolve, 5000));

  const publishUrl = `https://graph.facebook.com/v21.0/${IG_USER_ID}/media_publish?creation_id=${containerId}&access_token=${IG_PAGE_TOKEN}`;
  
  const publishRes = await fetch(publishUrl, { method: "POST" });
  const publishData = await publishRes.json();

  if (!publishData.id) {
    throw new Error(`Publish failed: ${JSON.stringify(publishData)}`);
  }

  console.log(`[IG] Post published: ${publishData.id}`);
  return { ok: true, postId: publishData.id };
}
