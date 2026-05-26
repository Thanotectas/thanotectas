// ═══════════════════════════════════════════════════════════════
// Thanotectas — Endpoint POST /suscribir
// Inscribe email a la newsletter "cápsula del día".
// Suscripción directa (sin double opt-in). Honeypot anti-bots.
// Requiere env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY
// ═══════════════════════════════════════════════════════════════

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "https://thanotectas.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};

function respond(statusCode, bodyObj) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(bodyObj) };
}

const SITE = "https://thanotectas.com";

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Method not allowed" });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const RESEND = process.env.RESEND_API_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("[suscribir] Supabase env vars missing");
    return respond(500, { error: "config_supabase" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return respond(400, { error: "json_invalido" });
  }

  // Honeypot: si llega lleno, es bot. Devolvemos OK silenciosamente.
  if (body.website && body.website.length > 0) {
    console.warn("[suscribir] honeypot triggered, silent ok");
    return respond(200, { ok: true });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const idioma = String(body.idioma || "es").trim().slice(0, 5);
  const fuente = String(body.fuente || "desconocida").trim().slice(0, 80);

  if (!email || !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
    return respond(400, { error: "email_invalido" });
  }

  const ip = (event.headers["x-nf-client-connection-ip"]
    || event.headers["x-forwarded-for"]?.split(",")[0]?.trim()
    || null);

  // ── Llamar RPC inscribir_suscriptor ─────────────────────────────
  const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/inscribir_suscriptor`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ p_email: email, p_idioma: idioma, p_fuente: fuente, p_ip: ip })
  });

  if (!rpcRes.ok) {
    const errBody = await rpcRes.text();
    console.error("[suscribir] RPC failed", rpcRes.status, errBody);
    return respond(502, { error: "rpc_failed" });
  }

  const result = await rpcRes.json();
  if (!result || result.ok !== true) {
    return respond(400, { error: result?.error || "rpc_error" });
  }

  const tokenBaja = result.token_baja;
  const yaExistia = result.ya_existia === true;
  const reactivado = result.reactivado === true;

  // ── Enviar email de bienvenida (si tenemos RESEND, no es duplicado) ──
  if (RESEND && !yaExistia) {
    try {
      const bajaUrl = `${SITE}/baja?token=${encodeURIComponent(tokenBaja)}`;
      const asunto = reactivado
        ? "Volviste al Umbral — Thanotectas"
        : "Estás en el Archivo — Thanotectas";
      const html = renderEmailBienvenida({ email, bajaUrl, reactivado });

      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "Thanotectas <info@thanotectas.com>",
          to: [email],
          subject: asunto,
          html
        })
      });
      if (!r.ok) {
        console.warn("[suscribir] Resend status", r.status, await r.text());
      }
    } catch (e) {
      // No fallar la suscripción si Resend falla.
      console.warn("[suscribir] Resend exception:", e.message);
    }
  }

  return respond(200, { ok: true, ya_existia: yaExistia, reactivado });
};

// ── Plantilla email de bienvenida ─────────────────────────────────
function renderEmailBienvenida({ email, bajaUrl, reactivado }) {
  const titulo = reactivado
    ? "Volviste al Umbral"
    : "Estás en el Archivo";
  const subtitulo = reactivado
    ? "Te reactivamos. La próxima cápsula del día llegará en su hora."
    : "Cada amanecer en Colombia (9 AM, hora local), una memoria del Archivo aterriza aquí.";

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#1a1611;font-family:Georgia,serif;color:#f0e6d3;padding:0}
.wrap{max-width:560px;margin:0 auto;padding:0}
.header{background:#141009;padding:36px 30px;text-align:center;border-bottom:1px solid rgba(196,151,59,0.2)}
.logo-txt{font-size:11px;letter-spacing:0.35em;text-transform:uppercase;color:#c4973b;margin-bottom:8px;font-family:Arial,sans-serif}
.tagline{font-size:12px;color:rgba(240,230,211,0.5);font-family:Arial,sans-serif;letter-spacing:0.1em}
.body{background:#0d0b08;padding:48px 36px;border-left:3px solid #c4973b;border-right:3px solid #c4973b}
.seal{font-size:20px;color:#c4973b;text-align:center;margin-bottom:18px}
.titulo{font-family:Georgia,serif;font-size:22px;color:#f0e6d3;text-align:center;margin-bottom:14px;font-style:italic}
.subtitulo{font-family:Arial,sans-serif;font-size:14px;color:rgba(240,230,211,0.7);text-align:center;line-height:1.7;max-width:420px;margin:0 auto 26px}
.divider{width:50%;margin:30px auto;height:1px;background:rgba(196,151,59,0.25)}
.detail{font-family:Arial,sans-serif;font-size:13px;color:rgba(240,230,211,0.55);line-height:1.85;text-align:center}
.detail strong{color:#c4973b}
.cta-row{text-align:center;margin:36px 0 8px}
.cta-btn{display:inline-block;padding:13px 26px;background:#c4973b;color:#1a1611;text-decoration:none;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;letter-spacing:0.06em;border-radius:6px}
.footer-section{padding:30px 30px 20px;text-align:center;font-family:Arial,sans-serif;font-size:11px;color:rgba(240,230,211,0.4);line-height:1.7;letter-spacing:0.05em}
.footer-section a{color:#c4973b;text-decoration:none}
.baja{margin-top:18px;font-size:10px;color:rgba(240,230,211,0.3)}
.baja a{color:rgba(196,151,59,0.6)}
</style></head>
<body>
<div class="wrap">
  <div class="header">
    <div class="logo-txt">THANOTECTAS</div>
    <div class="tagline">Archivo del Umbral</div>
  </div>
  <div class="body">
    <div class="seal">❦</div>
    <div class="titulo">${titulo}</div>
    <div class="subtitulo">${subtitulo}</div>
    <div class="divider"></div>
    <div class="detail">
      Inscripción confirmada para<br>
      <strong>${email}</strong>
    </div>
    <div class="cta-row">
      <a href="${SITE}" class="cta-btn">Visitar el Archivo</a>
    </div>
  </div>
  <div class="footer-section">
    Thanotectas · Guardianes del Umbral · Bogotá, Colombia<br>
    <a href="${SITE}">thanotectas.com</a>
    <div class="baja">
      ¿No querías esto? <a href="${bajaUrl}">Darte de baja en un click</a>
    </div>
  </div>
</div>
</body></html>`;
}
