// Requiere: RESEND_API_KEY en Netlify environment variables
// Configurar en resend.com: verificar dominio thanotectas.com
// Variable: RESEND_API_KEY = re_xxxxxxxxxxxx

exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
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
      return { statusCode: 400, body: JSON.stringify({ error: "Email invalido" }) };
    }
    if (!poema || !sujeto) {
      return { statusCode: 400, body: JSON.stringify({ error: "Datos incompletos" }) };
    }
    if (!RESEND) {
      return { statusCode: 500, body: JSON.stringify({ error: "Servicio de email no configurado. Agrega RESEND_API_KEY en Netlify." }) };
    }

    // Etiquetas por tipo e idioma
    var tipoLabels = {
      poema:     { es: "Capsula Poetica",       en: "Poetic Capsule",        pt: "Capsula Poetica",       fr: "Capsule Poetique" },
      dato:      { es: "Dato Cientifico",        en: "Scientific Data",       pt: "Dado Cientifico",       fr: "Donnee Scientifique" },
      carta:     { es: "Carta al Futuro",        en: "Letter to the Future",  pt: "Carta ao Futuro",       fr: "Lettre au Futur" },
      obituario: { es: "Obituario Ecologico",    en: "Ecological Obituary",   pt: "Obituario Ecologico",   fr: "Necrologe Ecologique" },
      alerta:    { es: "Mensaje de Alerta",      en: "Alert Message",         pt: "Mensagem de Alerta",    fr: "Message d Alerte" },
      ritual:    { es: "Oracion del Umbral",     en: "Threshold Prayer",      pt: "Oracao do Umbral",      fr: "Priere du Seuil" }
    };

    var asuntos = {
      es: "Tu capsula del umbral: " + sujeto + " | Thanotectas",
      en: "Your threshold capsule: " + sujeto + " | Thanotectas",
      pt: "Sua capsula do umbral: " + sujeto + " | Thanotectas",
      fr: "Votre capsule du seuil: " + sujeto + " | Thanotectas"
    };

    var footers = {
      es: "Gracias por ser Guardian del Umbral. Tu memoria contribuye a que el futuro sepa lo que amamos.",
      en: "Thank you for being a Guardian of the Threshold. Your memory helps the future know what we loved.",
      pt: "Obrigado por ser um Guardiao do Umbral. Sua memoria ajuda o futuro a saber o que amamos.",
      fr: "Merci d etre un Gardien du Seuil. Votre memoire aide le futur a savoir ce que nous aimions."
    };

    var ctaTexts = {
      es: "Deposita esta capsula permanentemente",
      en: "Deposit this capsule permanently",
      pt: "Deposite esta capsula permanentemente",
      fr: "Deposer cette capsule en permanence"
    };

    var tipoLabel = (tipoLabels[tipo] && tipoLabels[tipo][idioma]) || "Capsula del Umbral";
    var asunto    = asuntos[idioma]  || asuntos.es;
    var footer    = footers[idioma]  || footers.es;
    var ctaText   = ctaTexts[idioma] || ctaTexts.es;

    var fecha = new Date().toLocaleDateString(
      idioma === "es" ? "es-CO" : idioma === "pt" ? "pt-BR" : idioma === "fr" ? "fr-FR" : "en-US",
      { year: "numeric", month: "long", day: "numeric" }
    );

    var poemaHTML = poema.split("\n").join("<br>");

    var html = "<!DOCTYPE html><html lang='" + idioma + "'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'>" +
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
      ".divider{height:1px;background:linear-gradient(to right,transparent,rgba(196,151,59,0.4),transparent);margin:40px 0}" +
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
      "<div class='cert'>Certificado de inscripcion en el Umbral &middot; " + fecha + "</div>" +
      "</div>" +
      "</div>" +
      "</body></html>";

    var resEmail = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + RESEND,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Thanotectas <info@thanotectas.com>",
        to: [email],
        subject: asunto,
        html: html
      })
    });

    if (!resEmail.ok) {
      var errBody = await resEmail.text();
      throw new Error("Resend " + resEmail.status + ": " + errBody);
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error("[Email]", error.message);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
