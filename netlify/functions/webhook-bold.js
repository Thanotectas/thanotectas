// netlify/functions/webhook-bold.js
// Recibe el webhook de Bold.co y activa la membresía del Guardián.
// Usa fetch nativo (Node 22+) — sin dependencias externas.
//
// Variables de entorno a configurar en Netlify:
//   SUPABASE_URL              = https://oygwnmfwfxbxdogaqwmi.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY = (service_role key del panel de Supabase)
//   BOLD_SECRET_KEY           = llave secreta del negocio Thanotectas en Bold
//                               (Integraciones → Llaves). Sin ella, el webhook
//                               rechaza todos los avisos.
//
// Seguridad: Bold firma cada aviso con el encabezado x-bold-signature =
// HMAC-SHA256(base64(cuerpo crudo), llave secreta) en hexadecimal. Si la firma
// no coincide, el aviso se rechaza: nadie puede activar una membresía
// enviando un "pago aprobado" falso.
// Documentación: https://developers.bold.co/webhook

const crypto = require('crypto');

// Rangos de precio en pesos por plan.
const PLANES = [
  { plan: 'guardian', min: 44000, max: 46000 },
  { plan: 'eterno', min: 248000, max: 252000 },
];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const secreto = (process.env.BOLD_SECRET_KEY || '').trim();
  if (!secreto) {
    console.error('[Webhook Bold] Falta BOLD_SECRET_KEY: aviso rechazado');
    return { statusCode: 500, body: JSON.stringify({ error: 'missing_bold_secret' }) };
  }

  // Bold firma el cuerpo crudo; Netlify puede entregarlo ya en base64.
  const cuerpoBase64 = event.isBase64Encoded
    ? (event.body || '')
    : Buffer.from(event.body || '', 'utf8').toString('base64');
  const firma = headerSinMayusculas(event.headers, 'x-bold-signature');
  if (!firmaValida(cuerpoBase64, firma, secreto)) {
    console.warn('[Webhook Bold] Firma inválida: aviso rechazado');
    return { statusCode: 401, body: JSON.stringify({ error: 'invalid_signature' }) };
  }

  try {
    const cuerpo = Buffer.from(cuerpoBase64, 'base64').toString('utf8');
    const payload = JSON.parse(cuerpo || '{}');

    const evento = payload.type || payload.event || '';
    const data = payload.data || payload;
    // Sin el correo ni el cuerpo completo en los registros (datos personales).
    console.log('[Webhook Bold] Evento:', evento, 'pago:', data.payment_id || data.id || '-');

    const eventosValidos = ['SALE_APPROVED', 'payment.approved', 'PAYMENT_APPROVED'];
    if (eventosValidos.indexOf(evento) === -1) {
      return ok({ ignored: true, reason: 'event_type', evento });
    }

    // Email del pagador
    const email = data.payer_email
      || (data.customer && data.customer.email)
      || (data.payer && data.payer.email)
      || data.email
      || null;

    if (!email) {
      console.error('[Webhook Bold] No pude encontrar email en payload');
      return ok({ error: 'missing_email' });
    }

    const referencia = data.payment_id || data.id || data.reference || null;
    if (!referencia) {
      console.error('[Webhook Bold] Aviso sin identificador de pago');
      return ok({ error: 'missing_payment_id' });
    }

    // Monto total. Se acepta en pesos o en centavos: así un cambio de formato
    // de Bold no deja pagos sin activar.
    let total = 0;
    if (data.amount && typeof data.amount === 'object') total = Number(data.amount.total) || 0;
    else if (typeof data.amount === 'number') total = data.amount;
    else if (data.total) total = parseFloat(data.total) || 0;

    let plan = planPorMonto(total) || planPorMonto(total / 100);
    let montoCOP = plan ? (planPorMonto(total) ? total : total / 100) : 0;
    if (!plan) {
      // Respaldo por link de pago
      const paymentLink = data.payment_link || data.link_id || '';
      if (paymentLink.indexOf('LNK_CIP1O28TBB') !== -1) plan = 'guardian';
      else if (paymentLink.indexOf('LNK_GGLU1OJQU3') !== -1) plan = 'eterno';
      montoCOP = plan === 'guardian' ? 45000 : plan === 'eterno' ? 250000 : 0;
    }

    if (!plan) {
      console.error('[Webhook Bold] No pude determinar plan. Total recibido:', total);
      return ok({ error: 'unknown_plan', total });
    }

    const montoUSD = montoCOP / 4000;

    // Validar env vars
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[Webhook Bold] Faltan env vars de Supabase');
      return { statusCode: 500, body: JSON.stringify({ error: 'missing_env' }) };
    }

    // Llamar a la función RPC directamente vía REST (sin SDK)
    const rpcUrl = `${process.env.SUPABASE_URL}/rest/v1/rpc/activar_membresia_por_email`;
    const rpcResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({
        email_param: email,
        plan_param: plan,
        referencia_bold_param: referencia,
        monto_usd_param: montoUSD
      })
    });

    const result = await rpcResponse.json();

    if (!rpcResponse.ok) {
      console.error('[Webhook Bold] Error de Supabase RPC:', result);
      return { statusCode: 500, body: JSON.stringify({ error: 'rpc_failed' }) };
    }

    console.log('[Webhook Bold] Membresía activada:', plan, referencia);
    return ok({ success: true, plan });

  } catch (e) {
    console.error('[Webhook Bold] Exception:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'exception' }) };
  }
};

function planPorMonto(pesos) {
  const p = PLANES.find((x) => pesos >= x.min && pesos <= x.max);
  return p ? p.plan : null;
}

function headerSinMayusculas(headers, nombre) {
  if (!headers) return null;
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === nombre) return headers[k];
  }
  return null;
}

// Compara en tiempo constante para no filtrar la firma por tiempos de respuesta.
function firmaValida(cuerpoBase64, firma, secreto) {
  if (!firma || typeof firma !== 'string') return false;
  const esperada = Buffer.from(crypto.createHmac('sha256', secreto).update(cuerpoBase64).digest('hex'), 'hex');
  const recibida = Buffer.from(firma.trim().toLowerCase(), 'hex');
  return esperada.length > 0 && esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
}

function ok(obj) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  };
}
