// netlify/functions/capsula-diaria.mjs
//
// Background Function — cron 9am COL (14 UTC)
// Genera imagen dinámica por cápsula y la postea en Instagram.

import { createClient } from "@supabase/supabase-js";
import satori from "satori";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { readFileSync } from "fs";
import { join } from "path";

// ── Entorno ──────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.SITE_URL || "https://thanotectas.com";
const IG_USER_ID = process.env.IG_USER_ID;
const IG_PAGE_TOKEN = process.env.IG_PAGE_TOKEN;

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

    const captions = construirCaptions(capsula);
    console.log(
      `[capsula-diaria] Caption length: ${captions.instagram.length} chars`
    );

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
        "@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-italic.woff2"
      )
    ),
    jostLight: readFileSync(
      join(base, "@fontsource/jost/files/jost-latin-300-normal.woff2")
    ),
    jostSemi: readFileSync(
      join(base, "@fontsource/jost/files/jost-latin-600-normal.woff2")
    ),
  };
  console.log("[imagen] Fuentes cargadas");
}

async function ensureBucket(supabase) {
  const { error } = await supabase.storage.createBucket("capsulas-imagenes", {
    public: true,
    fileSizeLimit: 10485760,
    allowedMimeTypes: ["image/png"],
  });
  if (error && !error.message.toLowerCase().includes("already exists")) {
    console.warn("[imagen] Bucket warning:", error.message);
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
