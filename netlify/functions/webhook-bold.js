// netlify/functions/webhook-bold.js
// Recibe el webhook de Bold.co y activa la membresía del Guardián.
// Usa fetch nativo (Node 22+) — sin dependencias externas.
//
// Variables de entorno a configurar en Netlify:
//   SUPABASE_URL              = https://oygwnmfwfxbxdogaqwmi.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY = (service_role key del panel de Supabase)

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    console.log('[Webhook Bold] Payload recibido:', JSON.stringify(payload));

    const evento = payload.type || payload.event || '';
    const data = payload.data || payload;

    const eventosValidos = ['SALE_APPROVED', 'payment.approved', 'PAYMENT_APPROVED'];
    if (eventosValidos.indexOf(evento) === -1) {
      console.log('[Webhook Bold] Evento ignorado:', evento);
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

    const referencia = data.payment_id || data.id || data.reference || ('bold_' + Date.now());

    // Monto en COP (Bold envía centavos)
    let montoCOP = 0;
    if (data.amount && typeof data.amount === 'object') {
      montoCOP = (data.amount.total || 0) / 100;
    } else if (typeof data.amount === 'number') {
      montoCOP = data.amount / 100;
    } else if (data.total) {
      montoCOP = parseFloat(data.total) / 100;
    }

    // Mapear monto → plan
    let plan = null;
    if (montoCOP >= 44000 && montoCOP <= 46000) plan = 'guardian';
    else if (montoCOP >= 248000 && montoCOP <= 252000) plan = 'eterno';
    else {
      // Fallback por link ID
      const paymentLink = data.payment_link || data.link_id || '';
      if (paymentLink.indexOf('LNK_CIP1O28TBB') !== -1) plan = 'guardian';
      else if (paymentLink.indexOf('LNK_GGLU1OJQU3') !== -1) plan = 'eterno';
    }

    if (!plan) {
      console.error('[Webhook Bold] No pude determinar plan. Monto COP:', montoCOP);
      return ok({ error: 'unknown_plan', montoCOP });
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
      return { statusCode: 500, body: JSON.stringify({ error: result }) };
    }

    console.log('[Webhook Bold] Resultado:', JSON.stringify(result));
    return ok({ success: true, result });

  } catch (e) {
    console.error('[Webhook Bold] Exception:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

function ok(obj) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  };
}
