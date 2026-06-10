// netlify/functions/capsula-diaria.mjs
//
// Background Function — cron 9am COL (14 UTC)
// Genera imagen dinámica por cápsula y la postea en Instagram.

import { createClient } from "@supabase/supabase-js";
import satori from "satori";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import ffmpegPath from "ffmpeg-static";

// ── Entorno ──────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.SITE_URL || "https://thanotectas.com";
const IG_USER_ID = process.env.IG_USER_ID;
const IG_PAGE_TOKEN = process.env.IG_PAGE_TOKEN;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const IG_CAPTION_MAX = 2200;
const IG_BODY_MAX = 1700;

// ── Caché de módulo (persiste entre invocaciones tibias) ─────
let wasmInitialized = false;
let fonts = null;

// ── Handler principal ────────────────────────────────────────
export default async (req) => {
  console.log("[capsula-diaria] Iniciando ciclo");

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: capsulas, error: errSel } = await supabase
      .from("capsulas")
      .select(
        "id, guardian_id, sujeto, categoria, tipo, contenido, numero_certificado, created_at, es_publica, es_sellada, posteado_en"
      )
      .eq("es_publica", true)
      .eq("es_sellada", false)
      .is("posteado_en", null)
      .order("created_at", { ascending: true })
      .limit(1);

    if (errSel) {
      console.error("[capsula-diaria] Error consultando cápsulas:", errSel);
      return new Response(
        JSON.stringify({ error: "DB error", details: errSel }),
        { status: 500 }
      );
    }

    if (!capsulas || capsulas.length === 0) {
      console.log("[capsula-diaria] Sin cápsulas pendientes");
      return new Response(
        JSON.stringify({ ok: true, message: "Sin cápsulas pendientes" }),
        { status: 200 }
      );
    }

    const capsula = capsulas[0];
    console.log(
      `[capsula-diaria] Procesando: ${capsula.numero_certificado || capsula.id}`
    );

    // Generar imagen dinámica; caer en genérica si falla
    let imagenUrl;
    try {
      imagenUrl = await generarImagenCapsula(capsula, supabase);
      console.log(`[capsula-diaria] Imagen dinámica: ${imagenUrl}`);
    } catch (imgErr) {
      console.error(
        "[capsula-diaria] Fallo imagen dinámica, usando genérica:",
        imgErr.message
      );
      imagenUrl = `${SITE_URL}/umbral-og.png`;
    }

    // Generar video vertical (Reel); si falla, seguimos solo con imagen
    let videoUrl = null;
    try {
      videoUrl = await generarVideoCapsula(capsula, supabase);
      console.log(`[capsula-diaria] Video Reel: ${videoUrl}`);
    } catch (vidErr) {
      console.error(
        "[capsula-diaria] Fallo video Reel, se posteará imagen:",
        vidErr.message
      );
    }

    const captions = construirCaptions(capsula);
    console.log(
      `[capsula-diaria] Caption length: ${captions.instagram.length} chars`
    );

    let igResult = { ok: false, error: "Skipped" };
    if (IG_PAGE_TOKEN && IG_USER_ID) {
      // Intentar Reel primero (más alcance); si falla, caer a foto
      if (videoUrl) {
        try {
          igResult = await postearReel(captions.instagram, videoUrl);
          console.log("[capsula-diaria] Instagram Reel:", igResult);
        } catch (err) {
          console.error("[capsula-diaria] Error Reel, intentando foto:", err.message);
        }
      }
      if (!igResult.ok) {
        try {
          igResult = await postearInstagram(captions.instagram, imagenUrl);
          console.log("[capsula-diaria] Instagram foto:", igResult);
        } catch (err) {
          console.error("[capsula-diaria] Error Instagram foto:", err.message);
          igResult = { ok: false, error: err.message };
        }
      }
    } else {
      console.warn("[capsula-diaria] IG credenciales faltando");
    }

    const platforms = {
      instagram: igResult,
      x: { ok: false, error: "X credentials not configured" },
      threads: { ok: false, error: "Threads credentials not configured" },
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

      if (errUpd)
        console.error("[capsula-diaria] Error actualizando BD:", errUpd);
    }

    // Enviar email diario a suscriptores (independiente de Instagram)
    let emailResult = { ok: false, enviados: 0, error: "Skipped" };
    if (RESEND_API_KEY) {
      try {
        emailResult = await enviarEmailDiario(capsula, imagenUrl, supabase);
        console.log("[capsula-diaria] Email diario:", emailResult);
      } catch (err) {
        console.error("[capsula-diaria] Error email diario:", err.message);
        emailResult = { ok: false, enviados: 0, error: err.message };
      }
    } else {
      console.warn("[capsula-diaria] RESEND_API_KEY no configurada, saltando email diario");
    }

    return new Response(
      JSON.stringify({
        ok: igResult.ok,
        capsula: capsula.numero_certificado,
        platforms,
        email_diario: emailResult,
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

// ── Generación de imagen ─────────────────────────────────────

async function ensureWasm() {
  if (wasmInitialized) return;
  const wasmPath = join(
    process.cwd(),
    "node_modules/@resvg/resvg-wasm/index_bg.wasm"
  );
  await initWasm(readFileSync(wasmPath));
  wasmInitialized = true;
  console.log("[imagen] WASM inicializado");
}

async function ensureFonts() {
  if (fonts) return;
  const base = join(process.cwd(), "node_modules");
  fonts = {
    cormorant: readFileSync(
      join(
        base,
        "@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-italic.woff"
      )
    ),
    jostLight: readFileSync(
      join(base, "@fontsource/jost/files/jost-latin-300-normal.woff")
    ),
    jostSemi: readFileSync(
      join(base, "@fontsource/jost/files/jost-latin-600-normal.woff")
    ),
  };
  console.log("[imagen] Fuentes cargadas");
}

async function ensureBucket(supabase) {
  const opts = {
    public: true,
    fileSizeLimit: 52428800, // 50MB (videos)
    allowedMimeTypes: ["image/png", "video/mp4"],
  };
  const { error } = await supabase.storage.createBucket("capsulas-imagenes", opts);
  if (error) {
    if (error.message.toLowerCase().includes("already exists")) {
      // Asegurar que el bucket existente acepte video y el límite mayor
      await supabase.storage.updateBucket("capsulas-imagenes", opts);
    } else {
      console.warn("[imagen] Bucket warning:", error.message);
    }
  }
}

async function generarImagenCapsula(capsula, supabase) {
  await Promise.all([ensureWasm(), ensureFonts()]);

  const año = new Date(capsula.created_at).getFullYear();
  const sujetoDisplay = (capsula.sujeto || "Sujeto").toUpperCase();
  const tipo =
    (capsula.tipo || "").charAt(0).toUpperCase() +
    (capsula.tipo || "").slice(1).toLowerCase();
  const certNum = capsula.numero_certificado || capsula.id;
  const contenido = capsula.contenido.trim();
  const cita =
    contenido.length > 280 ? contenido.slice(0, 279).trim() + "…" : contenido;

  const citaFontSize = cita.length > 200 ? 34 : cita.length > 130 ? 38 : 44;

  const el = {
    type: "div",
    props: {
      style: {
        width: 1080,
        height: 1080,
        backgroundColor: "#14100D",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        paddingTop: 80,
        paddingRight: 80,
        paddingBottom: 80,
        paddingLeft: 80,
      },
      children: [
        // ── Cabecera ─────────────────────────────────────────
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
            },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    width: "100%",
                    height: 1,
                    backgroundColor: "#C4A45B",
                    marginBottom: 20,
                  },
                },
              },
              {
                type: "p",
                props: {
                  style: {
                    fontFamily: "Jost",
                    fontWeight: 300,
                    fontSize: 15,
                    letterSpacing: 6,
                    color: "#C4A45B",
                    marginTop: 0,
                    marginBottom: 10,
                  },
                  children: "T H A N O T E C T A S",
                },
              },
              {
                type: "p",
                props: {
                  style: {
                    fontFamily: "Jost",
                    fontWeight: 300,
                    fontSize: 11,
                    letterSpacing: 2,
                    color: "#5A4A38",
                    marginTop: 0,
                    marginBottom: 0,
                  },
                  children: "ARCHIVO DEL UMBRAL",
                },
              },
            ],
          },
        },

        // ── Cita ─────────────────────────────────────────────
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              flexGrow: 1,
              paddingTop: 40,
              paddingBottom: 40,
            },
            children: [
              {
                type: "p",
                props: {
                  style: {
                    fontFamily: "Cormorant Garamond",
                    fontStyle: "italic",
                    fontWeight: 400,
                    fontSize: citaFontSize,
                    color: "#F5EDE0",
                    textAlign: "center",
                    lineHeight: 1.55,
                    marginTop: 0,
                    marginBottom: 0,
                  },
                  children: `"${cita}"`,
                },
              },
            ],
          },
        },

        // ── Pie ──────────────────────────────────────────────
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
            },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    width: "50%",
                    height: 1,
                    backgroundColor: "#3D2E1E",
                    marginBottom: 18,
                  },
                },
              },
              {
                type: "p",
                props: {
                  style: {
                    fontFamily: "Jost",
                    fontWeight: 600,
                    fontSize: 20,
                    color: "#E8D9B8",
                    marginTop: 0,
                    marginBottom: 10,
                    letterSpacing: 2,
                    textAlign: "center",
                  },
                  children: sujetoDisplay,
                },
              },
              {
                type: "p",
                props: {
                  style: {
                    fontFamily: "Jost",
                    fontWeight: 300,
                    fontSize: 14,
                    color: "#8A7560",
                    marginTop: 0,
                    marginBottom: 12,
                    letterSpacing: 2,
                    textAlign: "center",
                  },
                  children: `${tipo} · ${año}`,
                },
              },
              {
                type: "p",
                props: {
                  style: {
                    fontFamily: "Jost",
                    fontWeight: 300,
                    fontSize: 11,
                    color: "#3D2E1E",
                    marginTop: 0,
                    marginBottom: 0,
                    letterSpacing: 1,
                    textAlign: "center",
                  },
                  children: certNum,
                },
              },
            ],
          },
        },
      ],
    },
  };

  const svg = await satori(el, {
    width: 1080,
    height: 1080,
    fonts: [
      {
        name: "Cormorant Garamond",
        data: fonts.cormorant,
        style: "italic",
        weight: 400,
      },
      { name: "Jost", data: fonts.jostLight, style: "normal", weight: 300 },
      { name: "Jost", data: fonts.jostSemi, style: "normal", weight: 600 },
    ],
  });

  // SVG → PNG
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1080 } });
  const pngBuffer = resvg.render().asPng();

  // Subir a Supabase Storage
  await ensureBucket(supabase);
  const safeFileName = certNum.replace(/[^a-zA-Z0-9_-]/g, "_") + ".png";

  const { error: uploadError } = await supabase.storage
    .from("capsulas-imagenes")
    .upload(safeFileName, pngBuffer, {
      contentType: "image/png",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Upload fallido: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage
    .from("capsulas-imagenes")
    .getPublicUrl(safeFileName);

  return urlData.publicUrl;
}

// ── Generación de video vertical (Reel) ──────────────────────

// Construye el árbol de elementos para la imagen vertical 1080x1920
function construirElementoVertical(capsula) {
  const año = new Date(capsula.created_at).getFullYear();
  const sujetoDisplay = (capsula.sujeto || "Sujeto").toUpperCase();
  const tipo =
    (capsula.tipo || "").charAt(0).toUpperCase() +
    (capsula.tipo || "").slice(1).toLowerCase();
  const certNum = capsula.numero_certificado || capsula.id;
  const contenido = capsula.contenido.trim();
  const cita =
    contenido.length > 320 ? contenido.slice(0, 319).trim() + "…" : contenido;
  const citaFontSize = cita.length > 240 ? 42 : cita.length > 150 ? 48 : 56;

  return {
    type: "div",
    props: {
      style: {
        width: 1080,
        height: 1920,
        backgroundColor: "#14100D",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        paddingTop: 140,
        paddingRight: 90,
        paddingBottom: 140,
        paddingLeft: 90,
      },
      children: [
        // Cabecera
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", alignItems: "center", width: "100%" },
            children: [
              { type: "div", props: { style: { width: "100%", height: 1, backgroundColor: "#C4A45B", marginBottom: 24 } } },
              { type: "p", props: { style: { fontFamily: "Jost", fontWeight: 300, fontSize: 20, letterSpacing: 8, color: "#C4A45B", marginTop: 0, marginBottom: 12 }, children: "T H A N O T E C T A S" } },
              { type: "p", props: { style: { fontFamily: "Jost", fontWeight: 300, fontSize: 14, letterSpacing: 3, color: "#5A4A38", marginTop: 0, marginBottom: 0 }, children: "ARCHIVO DEL UMBRAL" } },
            ],
          },
        },
        // Cita
        {
          type: "div",
          props: {
            style: { display: "flex", alignItems: "center", justifyContent: "center", width: "100%", flexGrow: 1, paddingTop: 60, paddingBottom: 60 },
            children: [
              { type: "p", props: { style: { fontFamily: "Cormorant Garamond", fontStyle: "italic", fontWeight: 400, fontSize: citaFontSize, color: "#F5EDE0", textAlign: "center", lineHeight: 1.5, marginTop: 0, marginBottom: 0 }, children: `"${cita}"` } },
            ],
          },
        },
        // Pie
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", alignItems: "center", width: "100%" },
            children: [
              { type: "div", props: { style: { width: "50%", height: 1, backgroundColor: "#3D2E1E", marginBottom: 24 } } },
              { type: "p", props: { style: { fontFamily: "Jost", fontWeight: 600, fontSize: 28, color: "#E8D9B8", marginTop: 0, marginBottom: 14, letterSpacing: 3, textAlign: "center" }, children: sujetoDisplay } },
              { type: "p", props: { style: { fontFamily: "Jost", fontWeight: 300, fontSize: 18, color: "#8A7560", marginTop: 0, marginBottom: 16, letterSpacing: 3, textAlign: "center" }, children: `${tipo} · ${año}` } },
              { type: "p", props: { style: { fontFamily: "Jost", fontWeight: 300, fontSize: 15, color: "#7A6448", marginTop: 0, marginBottom: 0, letterSpacing: 2, textAlign: "center" }, children: "thanotectas.com" } },
            ],
          },
        },
      ],
    },
  };
}

async function generarVideoCapsula(capsula, supabase) {
  await Promise.all([ensureWasm(), ensureFonts()]);

  const certNum = capsula.numero_certificado || capsula.id;
  const safe = certNum.replace(/[^a-zA-Z0-9_-]/g, "_");

  // 1. Imagen vertical 1080x1920 con satori
  const svg = await satori(construirElementoVertical(capsula), {
    width: 1080,
    height: 1920,
    fonts: [
      { name: "Cormorant Garamond", data: fonts.cormorant, style: "italic", weight: 400 },
      { name: "Jost", data: fonts.jostLight, style: "normal", weight: 300 },
      { name: "Jost", data: fonts.jostSemi, style: "normal", weight: 600 },
    ],
  });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1080 } });
  const pngBuffer = resvg.render().asPng();

  // 2. Escribir PNG temporal y generar MP4 con zoom lento (Ken Burns)
  const tmpPng = `/tmp/${safe}-v.png`;
  const tmpMp4 = `/tmp/${safe}.mp4`;
  writeFileSync(tmpPng, pngBuffer);

  try {
    execFileSync(
      ffmpegPath,
      [
        "-y",
        "-loop", "1",
        "-i", tmpPng,
        "-vf",
        "zoompan=z='min(zoom+0.0006,1.12)':d=500:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=25,format=yuv420p",
        "-t", "20",
        "-r", "25",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        tmpMp4,
      ],
      { stdio: "pipe" }
    );
  } catch (e) {
    throw new Error(`ffmpeg falló: ${e.message}`);
  }

  const mp4Buffer = readFileSync(tmpMp4);

  // 3. Subir a Supabase Storage
  await ensureBucket(supabase);
  const fileName = `${safe}.mp4`;
  const { error: uploadError } = await supabase.storage
    .from("capsulas-imagenes")
    .upload(fileName, mp4Buffer, { contentType: "video/mp4", upsert: true });

  // Limpiar temporales
  try { unlinkSync(tmpPng); } catch {}
  try { unlinkSync(tmpMp4); } catch {}

  if (uploadError) {
    throw new Error(`Upload video fallido: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage
    .from("capsulas-imagenes")
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}

// ── Captions ─────────────────────────────────────────────────

function construirCaptions(capsula) {
  const año = new Date(capsula.created_at).getFullYear();
  const numero = capsula.numero_certificado || "";
  const sujeto = capsula.sujeto;
  const tipo = (capsula.tipo || "").toLowerCase();
  const enlace = `${SITE_URL}/c/${numero}`;
  let cuerpo = capsula.contenido.trim();

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

  if (instagram.length > IG_CAPTION_MAX) {
    instagram = instagram.slice(0, IG_CAPTION_MAX - 1).trim() + "…";
  }

  return { instagram };
}

// ── Email diario a suscriptores ───────────────────────────────

async function enviarEmailDiario(capsula, imagenUrl, supabase) {
  // 1. Obtener suscriptores activos
  const { data: suscriptores, error: errSus } = await supabase
    .from("suscriptores")
    .select("id, email, idioma, token_baja, emails_enviados")
    .is("baja_at", null)
    .limit(500);

  if (errSus) throw new Error(`Supabase suscriptores: ${errSus.message}`);
  if (!suscriptores || suscriptores.length === 0) {
    return { ok: true, enviados: 0, error: null };
  }

  const cert = capsula.numero_certificado || capsula.id;
  const sujeto = capsula.sujeto || "Sin título";
  const tipo = (capsula.tipo || "").charAt(0).toUpperCase() + (capsula.tipo || "").slice(1);
  const año = new Date(capsula.created_at).getFullYear();
  const enlace = `${SITE_URL}/c/${cert}?utm_source=email&utm_medium=newsletter`;
  const asunto = `Cápsula del día: ${sujeto} · ${tipo} · ${año} — Thanotectas`;

  // 2. Construir payloads de email individuales (con token de baja único)
  const payloads = suscriptores.map((s) => ({
    from: "Thanotectas <info@thanotectas.com>",
    to: [s.email],
    subject: asunto,
    html: renderEmailDiario({ capsula, imagenUrl, enlace, cert, sujeto, tipo, año, bajaUrl: `${SITE_URL}/baja?token=${encodeURIComponent(s.token_baja)}` }),
  }));

  // 3. Enviar en lotes de 100 (límite de Resend batch)
  let totalEnviados = 0;
  const BATCH = 100;
  for (let i = 0; i < payloads.length; i += BATCH) {
    const lote = payloads.slice(i, i + BATCH);
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(lote),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[email-diario] Lote ${i / BATCH + 1} falló: ${res.status} ${errBody}`);
      continue;
    }
    totalEnviados += lote.length;
  }

  // 4. Actualizar contadores en BD
  if (totalEnviados > 0) {
    const ids = suscriptores.map((s) => s.id);
    await supabase.rpc("incrementar_emails_suscriptores", { p_ids: ids, p_capsula_id: capsula.id });
  }

  return { ok: true, enviados: totalEnviados, total_suscriptores: suscriptores.length };
}

function renderEmailDiario({ capsula, imagenUrl, enlace, cert, sujeto, tipo, año, bajaUrl }) {
  const contenido = (capsula.contenido || "").trim();
  const preview = contenido.length > 300 ? contenido.slice(0, 299).trim() + "…" : contenido;
  const previewHTML = preview.split("\n").join("<br>");

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#1a1611;font-family:Georgia,serif;color:#f0e6d3;padding:0}
.wrap{max-width:580px;margin:0 auto;padding:0}
.header{background:#141009;padding:36px 30px;text-align:center;border-bottom:1px solid rgba(196,151,59,0.2)}
.logo-txt{font-size:11px;letter-spacing:0.35em;text-transform:uppercase;color:#c4973b;margin-bottom:8px;font-family:Arial,sans-serif}
.tagline{font-size:12px;color:rgba(240,230,211,0.5);font-family:Arial,sans-serif;letter-spacing:0.1em}
.capsule{background:#0d0b08;padding:44px 36px;border-left:3px solid #c4973b;border-right:3px solid #c4973b}
.cert{font-family:Arial,sans-serif;font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:#c4973b;text-align:center;margin-bottom:14px}
.tipo-badge{font-family:Arial,sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#4a8a4b;text-align:center;margin-bottom:10px}
.sujeto{font-family:Georgia,serif;font-size:26px;font-weight:400;color:#f0e6d3;text-align:center;margin-bottom:28px;line-height:1.2}
.imagen-wrap{margin:0 0 28px;text-align:center}
.imagen-wrap img{width:100%;max-width:480px;height:auto;border:1px solid rgba(196,151,59,0.15)}
.contenido{font-family:Georgia,serif;font-size:16px;line-height:2;font-style:italic;color:#f0e6d3;text-align:center}
.separador{width:40%;margin:28px auto;height:1px;background:rgba(196,151,59,0.2)}
.meta{font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(240,230,211,0.4);text-align:center}
.footer-sec{background:#141009;padding:36px 30px;text-align:center}
.footer-text{font-family:Arial,sans-serif;font-size:13px;color:rgba(240,230,211,0.6);line-height:1.8;margin-bottom:22px}
.cta-btn{display:inline-block;padding:13px 26px;background:#c4973b;color:#1a1611;text-decoration:none;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;letter-spacing:0.08em;border-radius:4px}
.site-link{display:block;margin-top:16px;font-size:11px;color:#c4973b;text-decoration:none;font-family:Arial,sans-serif;letter-spacing:0.1em}
.compartir{margin-top:24px;padding-top:20px;border-top:1px solid rgba(196,151,59,0.15);font-family:Arial,sans-serif;font-size:11px;color:rgba(240,230,211,0.5);letter-spacing:0.08em}
.compartir a{color:#c4973b;text-decoration:none;margin:0 8px}
.referido{margin-top:14px;font-family:Arial,sans-serif;font-size:11px;color:rgba(240,230,211,0.5)}
.referido a{color:#c4973b}
.baja{margin-top:18px;font-size:10px;color:rgba(240,230,211,0.3);font-family:Arial,sans-serif}
.baja a{color:rgba(196,151,59,0.6)}
</style></head><body>
<div class="wrap">
  <div class="header">
    <div class="logo-txt">THANOTECTAS</div>
    <div class="tagline">Cápsula del día · Archivo del Umbral</div>
  </div>
  <div class="capsule">
    <div class="cert">${cert.replace(/-/g, " · ")}</div>
    <div class="tipo-badge">${tipo}</div>
    <div class="sujeto">${sujeto}</div>
    ${imagenUrl ? `<div class="imagen-wrap"><img src="${imagenUrl}" alt="Cápsula ${cert}"></div>` : ""}
    <div class="contenido">${previewHTML}</div>
    <div class="separador"></div>
    <div class="meta">${tipo} · ${año}</div>
  </div>
  <div class="footer-sec">
    <div class="footer-text">Cada amanecer, una memoria del Archivo. Gracias por ser parte del Umbral.</div>
    <a href="${enlace}" class="cta-btn">🌿 Leer cápsula completa</a>
    <a href="${SITE_URL}" class="site-link">thanotectas.com</a>
    <div class="compartir">
      Comparte esta memoria
      <br>
      <a href="https://api.whatsapp.com/send?text=${encodeURIComponent(`${sujeto} — una memoria del Archivo del Umbral: ${SITE_URL}/c/${cert}?utm_source=whatsapp&utm_medium=email-share`)}">WhatsApp</a> ·
      <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(`${sujeto} — Cápsula del Archivo del Umbral`)}&url=${encodeURIComponent(`${SITE_URL}/c/${cert}?utm_source=x&utm_medium=email-share`)}">X</a>
    </div>
    <div class="referido">¿Te reenviaron este correo? <a href="${SITE_URL}/?utm_source=referido&utm_medium=email#newsletter">Suscríbete aquí</a></div>
    <div class="baja">¿No quieres más correos? <a href="${bajaUrl}">Darte de baja en un click</a></div>
  </div>
</div>
</body></html>`;
}

// ── Instagram ─────────────────────────────────────────────────

async function postearInstagram(caption, imagenUrl) {
  if (!IG_USER_ID || !IG_PAGE_TOKEN) {
    throw new Error("Missing IG_USER_ID or IG_PAGE_TOKEN");
  }

  const containerUrl =
    `https://graph.facebook.com/v21.0/${IG_USER_ID}/media` +
    `?image_url=${encodeURIComponent(imagenUrl)}` +
    `&caption=${encodeURIComponent(caption)}` +
    `&access_token=${IG_PAGE_TOKEN}`;

  const containerRes = await fetch(containerUrl, { method: "POST" });
  const containerData = await containerRes.json();

  if (!containerData.id) {
    throw new Error(
      `Container creation failed: ${JSON.stringify(containerData)}`
    );
  }

  const containerId = containerData.id;
  console.log(`[IG] Container created: ${containerId}`);

  await new Promise((resolve) => setTimeout(resolve, 5000));

  const publishUrl =
    `https://graph.facebook.com/v21.0/${IG_USER_ID}/media_publish` +
    `?creation_id=${containerId}` +
    `&access_token=${IG_PAGE_TOKEN}`;

  const publishRes = await fetch(publishUrl, { method: "POST" });
  const publishData = await publishRes.json();

  if (!publishData.id) {
    throw new Error(`Publish failed: ${JSON.stringify(publishData)}`);
  }

  console.log(`[IG] Post published: ${publishData.id}`);
  return { ok: true, postId: publishData.id };
}

// ── Instagram Reel ────────────────────────────────────────────

async function postearReel(caption, videoUrl) {
  if (!IG_USER_ID || !IG_PAGE_TOKEN) {
    throw new Error("Missing IG_USER_ID or IG_PAGE_TOKEN");
  }

  // 1. Crear contenedor de Reel
  const containerUrl =
    `https://graph.facebook.com/v21.0/${IG_USER_ID}/media` +
    `?media_type=REELS` +
    `&video_url=${encodeURIComponent(videoUrl)}` +
    `&caption=${encodeURIComponent(caption)}` +
    `&share_to_feed=true` +
    `&access_token=${IG_PAGE_TOKEN}`;

  const containerRes = await fetch(containerUrl, { method: "POST" });
  const containerData = await containerRes.json();

  if (!containerData.id) {
    throw new Error(`Reel container failed: ${JSON.stringify(containerData)}`);
  }

  const containerId = containerData.id;
  console.log(`[Reel] Container created: ${containerId}`);

  // 2. Esperar a que termine el procesamiento del video (polling)
  const maxIntentos = 30; // ~5 min máx
  for (let i = 0; i < maxIntentos; i++) {
    await new Promise((r) => setTimeout(r, 10000)); // 10s entre checks

    const statusUrl =
      `https://graph.facebook.com/v21.0/${containerId}` +
      `?fields=status_code,status` +
      `&access_token=${IG_PAGE_TOKEN}`;
    const statusRes = await fetch(statusUrl);
    const statusData = await statusRes.json();

    console.log(`[Reel] Status check ${i + 1}: ${statusData.status_code}`);

    if (statusData.status_code === "FINISHED") break;
    if (statusData.status_code === "ERROR") {
      throw new Error(`Reel processing error: ${JSON.stringify(statusData)}`);
    }
    if (i === maxIntentos - 1) {
      throw new Error("Reel processing timeout (5min)");
    }
  }

  // 3. Publicar
  const publishUrl =
    `https://graph.facebook.com/v21.0/${IG_USER_ID}/media_publish` +
    `?creation_id=${containerId}` +
    `&access_token=${IG_PAGE_TOKEN}`;

  const publishRes = await fetch(publishUrl, { method: "POST" });
  const publishData = await publishRes.json();

  if (!publishData.id) {
    throw new Error(`Reel publish failed: ${JSON.stringify(publishData)}`);
  }

  console.log(`[Reel] Published: ${publishData.id}`);
  return { ok: true, postId: publishData.id, tipo: "reel" };
}
