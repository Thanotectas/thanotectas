// netlify/functions/webhook-bold.js
// Recibe el webhook de Bold.co cuando un pago se completa y activa la membresía.
// Configurar en Bold → Integraciones → Webhooks → URL: https://thanotectas.com/.netlify/functions/webhook-bold

const { createClient } = require('@supabase/supabase-js');

// Variables de entorno a configurar en Netlify → Site settings → Environment variables:
//   SUPABASE_URL                = https://oygwnmfwfxbxdogaqwmi.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   = (service_role key del dashboard de Supabase)
//   BOLD_WEBHOOK_SECRET         = (opcional, para validar firma si Bold la provee)

exports.handler = async (event) => {
  // Solo aceptamos POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    console.log('[Webhook Bold] Payload recibido:', JSON.stringify(payload));

    // Bold envía diferentes estructuras según el tipo de evento.
    // Campos típicos en pagos aprobados:
    //   payload.type = "SALE_APPROVED" | "payment.approved"
    //   payload.data.payer_email o payload.data.customer.email
    //   payload.data.payment_id o payload.data.id
    //   payload.data.amount.total (en centavos COP)
    //   payload.data.metadata.reference o payload.data.reference (id del link Bold)
    const evento = payload.type || payload.event || '';
    const data = payload.data || payload;

    const eventosValidos = ['SALE_APPROVED', 'payment.approved', 'PAYMENT_APPROVED'];
    if (eventosValidos.indexOf(evento) === -1) {
      console.log('[Webhook Bold] Evento ignorado:', evento);
      return { statusCode: 200, body: JSON.stringify({ ignored: true, reason: 'event_type', evento }) };
    }

    // Extraer email del pagador
    const email = data.payer_email
      || (data.customer && data.customer.email)
      || (data.payer && data.payer.email)
      || data.email
      || null;

    if (!email) {
      console.error('[Webhook Bold] No pude encontrar email en payload');
      return { statusCode: 200, body: JSON.stringify({ error: 'missing_email' }) };
    }

    // Extraer referencia de pago (id único de Bold)
    const referencia = data.payment_id || data.id || data.reference || ('bold_' + Date.now());

    // Extraer monto para determinar plan
    // Bold envía montos en centavos COP
    let montoCOP = 0;
    if (data.amount && typeof data.amount === 'object') {
      montoCOP = (data.amount.total || 0) / 100;
    } else if (typeof data.amount === 'number') {
      montoCOP = data.amount / 100;
    } else if (data.total) {
      montoCOP = parseFloat(data.total) / 100;
    }

    // Mapear monto → plan
    // $45.000 COP ± 500 → guardian
    // $250.000 COP ± 1000 → eterno
    let plan = null;
    if (montoCOP >= 44000 && montoCOP <= 46000) plan = 'guardian';
    else if (montoCOP >= 248000 && montoCOP <= 252000) plan = 'eterno';
    else {
      // Fallback: revisar el link de pago en lugar del monto
      const paymentLink = data.payment_link || data.link_id || '';
      if (paymentLink.indexOf('LNK_X1LLSJCK4P') !== -1) plan = 'guardian';
      // TODO: agregar LNK del eterno cuando se cree
    }

    if (!plan) {
      console.error('[Webhook Bold] No pude determinar plan. Monto COP:', montoCOP);
      return { statusCode: 200, body: JSON.stringify({ error: 'unknown_plan', montoCOP }) };
    }

    // Calcular monto en USD para el registro (para tu tabla pagos)
    // Aproximación: 1 USD ≈ 4000 COP (ajustar si quieres precisión)
    const montoUSD = montoCOP / 4000;

    // Conectar a Supabase con service role (bypasses RLS para operaciones administrativas)
    const sb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Llamar a la función que activa la membresía por email (es idempotente)
    const { data: result, error } = await sb.rpc('activar_membresia_por_email', {
      email_param: email,
      plan_param: plan,
      referencia_bold_param: referencia,
      monto_usd_param: montoUSD
    });

    if (error) {
      console.error('[Webhook Bold] Error activando membresía:', error);
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }

    console.log('[Webhook Bold] Resultado:', JSON.stringify(result));
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, result })
    };

  } catch (e) {
    console.error('[Webhook Bold] Exception:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
