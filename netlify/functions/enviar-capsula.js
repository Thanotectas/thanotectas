// ═══════════════════════════════════════════════════════════════
// Thanotectas · Oráculo del Umbral — Envío de cápsula por correo
// ═══════════════════════════════════════════════════════════════
// Requiere: RESEND_API_KEY en Netlify environment variables
// Configurar en resend.com: verificar dominio thanotectas.com
// Ubicación: netlify/functions/enviar-capsula.js
// ═══════════════════════════════════════════════════════════════

// ── Headers CORS reutilizables ──────────────────────────────────
var CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};

// ── Helper: respuesta con CORS siempre incluido ─────────────────
function respond(statusCode, bodyObj) {
  return {
    statusCode: statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(bodyObj)
  };
}

// ── Handler principal ───────────────────────────────────────────
exports.handler = async function(event) {

  // ✅ FIX 1: Manejar preflight OPTIONS (CORS)
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Method not allowed" });
  }

  try {
    var body      = JSON.parse(event.body);
    var email     = (body.email     || "").trim();
    var poema     = (body.poema     || "").trim();
    var sujeto    = (body.sujeto    || "").trim();
    var tipo      = body.tipo       || "poema";
    var idioma    = body.idioma     || "es";
    var categoria = body.categoria  || "especies";
    var RESEND    = process.env.RESEND_API_KEY;

    if (!email || !email.includes("@")) {
      return respond(400, { error: "Email inválido" });
    }
    if (!poema || !sujeto) {
      return respond(400, { error: "Datos incompletos: se requieren poema y sujeto" });
    }
    if (!RESEND) {
      console.error("[Config] RESEND_API_KEY no configurada");
      return respond(500, { error: "Servicio de email no configurado. Agrega RESEND_API_KEY en Netlify." });
    }

    // ── Etiquetas por tipo e idioma ─────────────────────────────
    var tipoLabels = {
      poema:     { es: "Cápsula Poética",        en: "Poetic Capsule",        pt: "Cápsula Poética",       fr: "Capsule Poétique",      de: "Poetische Kapsel",      it: "Capsula Poetica",       ja: "詩的カプセル",            ar: "كبسولة شعرية" },
      dato:      { es: "Dato Científico",         en: "Scientific Data",       pt: "Dado Científico",       fr: "Donnée Scientifique",   de: "Wissenschaftliche Daten", it: "Dato Scientifico",      ja: "科学データ",              ar: "بيانات علمية" },
      carta:     { es: "Carta al Futuro",         en: "Letter to the Future",  pt: "Carta ao Futuro",       fr: "Lettre au Futur",       de: "Brief an die Zukunft",  it: "Lettera al Futuro",     ja: "未来への手紙",            ar: "رسالة إلى المستقبل" },
      obituario: { es: "Obituario Ecológico",     en: "Ecological Obituary",   pt: "Obituário Ecológico",   fr: "Nécrologie Écologique", de: "Ökologischer Nachruf",  it: "Necrologio Ecologico",  ja: "生態学的死亡記事",         ar: "نعي بيئي" },
      alerta:    { es: "Mensaje de Alerta",       en: "Alert Message",         pt: "Mensagem de Alerta",    fr: "Message d'Alerte",      de: "Warnmeldung",           it: "Messaggio di Allerta",  ja: "警告メッセージ",           ar: "رسالة تنبيه" },
      ritual:    { es: "Oración del Umbral",      en: "Threshold Prayer",      pt: "Oração do Umbral",      fr: "Prière du Seuil",       de: "Gebet der Schwelle",    it: "Preghiera della Soglia", ja: "門の祈り",               ar: "صلاة العتبة" }
    };

    var asuntos = {
      es: "Tu cápsula del umbral: " + sujeto + " | Thanotectas",
      en: "Your threshold capsule: " + sujeto + " | Thanotectas",
      pt: "Sua cápsula do umbral: " + sujeto + " | Thanotectas",
      fr: "Votre capsule du seuil: " + sujeto + " | Thanotectas",
      de: "Deine Schwellenkapsel: " + sujeto + " | Thanotectas",
      it: "La tua capsula della soglia: " + sujeto + " | Thanotectas",
      ja: "あなたの門のカプセル: " + sujeto + " | Thanotectas",
      ar: "كبسولتك من العتبة: " + sujeto + " | Thanotectas"
    };

    var footers = {
      es: "Gracias por ser Guardián del Umbral. Tu memoria contribuye a que el futuro sepa lo que amamos.",
      en: "Thank you for being a Guardian of the Threshold. Your memory helps the future know what we loved.",
      pt: "Obrigado por ser um Guardião do Umbral. Sua memória ajuda o futuro a saber o que amamos.",
      fr: "Merci d'être un Gardien du Seuil. Votre mémoire aide le futur à savoir ce que nous aimions.",
      de: "Danke, dass du ein Wächter der Schwelle bist. Deine Erinnerung hilft der Zukunft zu wissen, was wir geliebt haben.",
      it: "Grazie per essere un Guardiano della Soglia. La tua memoria aiuta il futuro a sapere cosa abbiamo amato.",
      ja: "門の守護者でいてくれてありがとう。あなたの記憶が、未来に私たちが愛したものを伝えます。",
      ar: "شكراً لكونك حارساً للعتبة. ذاكرتك تساعد المستقبل على معرفة ما أحببنا."
    };

    var ctaTexts = {
      es: "Deposita esta cápsula permanentemente",
      en: "Deposit this capsule permanently",
      pt: "Deposite esta cápsula permanentemente",
      fr: "Déposer cette capsule en permanence",
      de: "Diese Kapsel dauerhaft hinterlegen",
      it: "Deposita questa capsula permanentemente",
      ja: "このカプセルを永久に保存する",
      ar: "أودع هذه الكبسولة بشكل دائم"
    };

    var tipoLabel = (tipoLabels[tipo] && tipoLabels[tipo][idioma]) || "Cápsula del Umbral";
    var asunto    = asuntos[idioma]  || asuntos.es;
    var footer    = footers[idioma]  || footers.es;
    var ctaText   = ctaTexts[idioma] || ctaTexts.es;

    // ── Fecha localizada ────────────────────────────────────────
    var localeMap = { es: "es-CO", en: "en-US", pt: "pt-BR", fr: "fr-FR", de: "de-DE", it: "it-IT", ja: "ja-JP", ar: "ar-SA" };
    var fecha = new Date().toLocaleDateString(
      localeMap[idioma] || "es-CO",
      { year: "numeric", month: "long", day: "numeric" }
    );

    // ── Construir HTML del correo ───────────────────────────────
    var poemaHTML = poema.split("\n").join("<br>");

    var html = '<!DOCTYPE html><html lang="' + idioma + '"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      "<style>*{margin:0;padding:0;box-sizing:border-box}" +
      "body{background:#1a1611;font-family:Georgia,serif;color:#f0e6d3;padding:0}" +
      ".wrap{max-width:600px;margin:0 auto;padding:0}" +
      ".header{background:#141009;padding:40px 30px;text-align:center;border-bottom:1px solid rgba(196,151,59,0.2)}" +
      ".logo-txt{font-size:11px;letter-spacing:0.35em;text-transform:uppercase;color:#c4973b;margin-bottom:10px;font-family:Arial,sans-serif}" +
      ".tagline{font-size:13px;color:rgba(240,230,211,0.5);font-family:Arial,sans-serif;letter-spacing:0.1em}" +
      ".capsule{background:#0d0b08;margin:0;padding:50px 40px;border-left:3px solid #c4973b;border-right:3px solid #c4973b}" +
      ".seal{font-size:18px;color:#c4973b;text-align:center;margin-bottom:20px}" +
      ".tipo{font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#4a8a4b;text-align:center;margin-bottom:12px;font-family:Arial,sans-serif}" +
      ".sujeto{font-size:13px;letter-spacing:0.25em;text-transform:uppercase;color:#c4973b;text-align:center;margin-bottom:35px;font-family:Arial,sans-serif}" +
      ".poema-text{font-size:17px;line-height:2.1;font-style:italic;text-align:center;color:#f0e6d3}" +
      ".fecha{font-size:11px;color:rgba(240,230,211,0.4);text-align:center;margin-top:35px;letter-spacing:0.1em;font-family:Arial,sans-serif}" +
      ".footer-section{background:#141009;padding:40px 30px;text-align:center}" +
      ".footer-text{font-size:13px;color:rgba(240,230,211,0.6);line-height:1.8;font-family:Arial,sans-serif;margin-bottom:25px}" +
      ".cta-btn{display:inline-block;padding:14px 28px;background:#c4973b;color:#1a1611;text-decoration:none;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;letter-spacing:0.06em;border-radius:6px}" +
      ".site-link{display:block;margin-top:20px;font-size:12px;color:#c4973b;text-decoration:none;font-family:Arial,sans-serif;letter-spacing:0.1em}" +
      ".cert{font-size:10px;color:rgba(240,230,211,0.3);margin-top:20px;font-family:Arial,sans-serif}" +
      "</style></head><body>" +
      "<div class='wrap'>" +
        "<div class='header'>" +
          "<div class='logo-txt'>THANOTECTAS</div>" +
          "<div class='tagline'>Guardianes del Umbral</div>" +
        "</div>" +
        "<div class='capsule'>" +
          "<div class='seal'>&#10086;</div>" +
          "<div class='tipo'>" + tipoLabel + "</div>" +
          "<div class='sujeto'>&mdash; " + sujeto.toUpperCase() + " &mdash;</div>" +
          "<div class='poema-text'>" + poemaHTML + "</div>" +
          "<div class='fecha'>Inscrita el " + fecha + "</div>" +
        "</div>" +
        "<div class='footer-section'>" +
          "<div class='footer-text'>" + footer + "</div>" +
          "<a href='https://thanotectas.com/depositar' class='cta-btn'>&#127807; " + ctaText + "</a>" +
          "<a href='https://thanotectas.com' class='site-link'>thanotectas.com</a>" +
          "<div class='cert'>Certificado de inscripci&oacute;n en el Umbral &middot; " + fecha + "</div>" +
        "</div>" +
      "</div>" +
      "</body></html>";

    // ── Enviar con Resend API ───────────────────────────────────
    // ✅ FIX 2: Usar node-fetch como fallback si fetch global no existe
    var fetchFn = typeof fetch !== "undefined" ? fetch : require("node-fetch");

    var resEmail = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + RESEND,
        "Content-Type":  "application/json"
      },
      body: JSON.stringify({
        from:    "Thanotectas <info@thanotectas.com>",
        to:      [email],
        subject: asunto,
        html:    html
      })
    });

    if (!resEmail.ok) {
      var errBody = await resEmail.text();
      console.error("[Resend Error]", resEmail.status, errBody);
      return respond(502, {
        error: "Error al enviar correo",
        detail: "Resend respondió con status " + resEmail.status
      });
    }

    var resData = await resEmail.json();
    console.log("[Email OK]", email, sujeto, resData.id || "");

    return respond(200, { success: true, id: resData.id || null });

  } catch (error) {
    console.error("[Email Fatal]", error.message);
    return respond(500, { error: "Error interno: " + error.message });
  }
};
