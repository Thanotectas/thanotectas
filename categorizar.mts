import type { Context, Config } from "@netlify/functions";

// ============================================================================
// /categorizar — Auto-detección híbrida de categoría con Gemini
// ============================================================================
// Recibe: { sujeto, testimonio, imagen_url? }
// Estrategia:
//   - Si hay testimonio (>10 chars): Gemini text (barato, ~$0.0003)
//   - Sino, si hay imagen_url: Gemini Vision (caro, ~$0.0025)
//   - Sino: heurística por palabras clave del sujeto
// Retorna: { categoria, confianza, alternativas, descripcion?, metodo }
// ============================================================================

const CATEGORIAS = ['especies', 'ecosistemas', 'rios', 'sonidos', 'territorios', 'saberes'] as const;
type Categoria = typeof CATEGORIAS[number];

const CATEGORIA_DESC: Record<Categoria, string> = {
  especies:    'animales, plantas, hongos, organismos vivos individuales o colectivos en peligro o extintos',
  ecosistemas: 'biomas completos: selvas, bosques, páramos, manglares, arrecifes, sabanas, humedales',
  rios:        'cuerpos de agua: ríos, lagos, lagunas, ciénagas, glaciares, mares, océanos, arroyos',
  sonidos:     'sonidos del mundo: cantos de aves, lenguas en extinción, música, voces, silencios, ruidos del entorno',
  territorios: 'lugares físicos con identidad: montañas, valles, ciudades, barrios, casas, regiones, países, paisajes',
  saberes:     'conocimientos, tradiciones, rituales, recetas, técnicas, oficios, memorias familiares, personas amadas, cultura inmaterial'
};

// Heurística simple por palabras clave (fallback sin IA)
function inferirHeuristica(sujeto: string): { categoria: Categoria; confianza: number } {
  const s = sujeto.toLowerCase();
  if (/\b(rio|río|glaciar|nevado|laguna|cienaga|ciénaga|lago|mar|océano|oceano|arroyo|quebrada|estero|fjordo|fiord)\b/i.test(s))
    return { categoria: 'rios', confianza: 0.85 };
  if (/\b(selva|bosque|paramo|páramo|sabana|desierto|arrecife|manglar|humedal|jungla|tundra|bioma|ecosistema)\b/i.test(s))
    return { categoria: 'ecosistemas', confianza: 0.85 };
  if (/\b(canto|sonido|silencio|música|musica|voz|lengua|idioma|melodía|melodia|grito|aullido|rugido|bramido|trino)\b/i.test(s))
    return { categoria: 'sonidos', confianza: 0.8 };
  if (/\b(saber|conocimiento|tradición|tradicion|ritual|ceremonia|chicha|yagé|yage|receta|abuela|abuelo|t[ií]a|t[ií]o|madre|padre|familia|memoria)\b/i.test(s))
    return { categoria: 'saberes', confianza: 0.7 };
  if (/\b(montaña|montana|cerro|valle|territorio|tierra|región|region|ciudad|barrio|casa|hogar|pueblo|aldea|paisaje|paramo|nevado|cumbre)\b/i.test(s))
    return { categoria: 'territorios', confianza: 0.75 };
  // Por defecto: especies (más probable cuando se nombra algo concreto)
  return { categoria: 'especies', confianza: 0.4 };
}

// Llamar a Gemini (text-only)
async function categorizarConGeminiText(sujeto: string, testimonio: string, apiKey: string): Promise<any> {
  const prompt = `Eres un curador del Archivo del Umbral, donde se preservan memorias de lo que el mundo está perdiendo.

Tu tarea: clasificar la siguiente memoria en UNA de estas 6 categorías:

${CATEGORIAS.map(c => `- ${c}: ${CATEGORIA_DESC[c]}`).join('\n')}

Memoria a clasificar:
- Sujeto: "${sujeto}"
- Testimonio: "${testimonio}"

Responde SOLO con un JSON válido (sin markdown, sin explicaciones extra):
{
  "categoria": "una_de_las_6",
  "confianza": 0.0_a_1.0,
  "alternativas": ["otra1", "otra2"],
  "razon": "una frase corta explicando por qué"
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 300,
      responseMimeType: 'application/json'
    }
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    clearTimeout(timer);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Gemini text error ${res.status}: ${txt.slice(0, 200)}`);
    }
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// Llamar a Gemini Vision (con imagen)
async function categorizarConGeminiVision(sujeto: string, imagenUrl: string, apiKey: string): Promise<any> {
  // Descargar la imagen y convertirla a base64
  const imgRes = await fetch(imagenUrl);
  if (!imgRes.ok) throw new Error(`No se pudo descargar imagen: ${imgRes.status}`);
  const imgBuf = await imgRes.arrayBuffer();
  // Detectar mime
  const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
  if (!/^image\/(jpeg|png|webp|gif)$/.test(mimeType)) {
    throw new Error(`Mime no soportado por Gemini Vision: ${mimeType}`);
  }
  // Limitar a 4MB (Gemini limit)
  if (imgBuf.byteLength > 4 * 1024 * 1024) {
    throw new Error('Imagen demasiado grande para Vision (>4MB)');
  }
  // Convertir a base64
  const bytes = new Uint8Array(imgBuf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const imageBase64 = btoa(binary);

  const prompt = `Eres un curador del Archivo del Umbral, donde se preservan memorias de lo que el mundo está perdiendo.

Analiza la imagen Y el sujeto declarado para clasificar esta memoria en UNA de las 6 categorías:

${CATEGORIAS.map(c => `- ${c}: ${CATEGORIA_DESC[c]}`).join('\n')}

Sujeto declarado por el usuario: "${sujeto}"

Mira la imagen y considera:
- ¿Qué se ve principalmente? (un ser vivo, un paisaje, agua, un objeto cultural, un lugar...)
- ¿Cómo se relaciona con el sujeto declarado?
- ¿Qué se está perdiendo o queriendo preservar?

Responde SOLO con un JSON válido (sin markdown, sin texto extra):
{
  "categoria": "una_de_las_6",
  "confianza": 0.0_a_1.0,
  "alternativas": ["otra1", "otra2"],
  "razon": "una frase corta",
  "descripcion_visual": "qué se ve en la imagen, en una oración"
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: imageBase64 } }
      ]
    }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 400,
      responseMimeType: 'application/json'
    }
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 18000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    clearTimeout(timer);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Gemini vision error ${res.status}: ${txt.slice(0, 200)}`);
    }
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// Validar que la respuesta de Gemini sea coherente
function validarRespuesta(parsed: any): { categoria: Categoria; confianza: number; alternativas: Categoria[]; razon?: string; descripcion_visual?: string } {
  let categoria: Categoria = 'especies';
  let confianza = 0.5;
  let alternativas: Categoria[] = [];

  if (parsed?.categoria && CATEGORIAS.includes(parsed.categoria as Categoria)) {
    categoria = parsed.categoria as Categoria;
  }
  if (typeof parsed?.confianza === 'number') {
    confianza = Math.max(0, Math.min(1, parsed.confianza));
  }
  if (Array.isArray(parsed?.alternativas)) {
    alternativas = parsed.alternativas
      .filter((a: any) => CATEGORIAS.includes(a))
      .filter((a: Categoria) => a !== categoria)
      .slice(0, 2);
  }

  return {
    categoria,
    confianza,
    alternativas,
    razon: typeof parsed?.razon === 'string' ? parsed.razon.slice(0, 200) : undefined,
    descripcion_visual: typeof parsed?.descripcion_visual === 'string' ? parsed.descripcion_visual.slice(0, 200) : undefined
  };
}

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const sujeto = (payload?.sujeto || '').toString().trim();
  const testimonio = (payload?.testimonio || '').toString().trim();
  const imagen_url = (payload?.imagen_url || '').toString().trim();

  if (!sujeto || sujeto.length < 2) {
    return new Response(JSON.stringify({ error: 'Sujeto requerido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const apiKey = Netlify.env.get('GEMINI_API_KEY') || Netlify.env.get('GOOGLE_API_KEY');

  // Si no hay API key configurada, usar heurística
  if (!apiKey) {
    const h = inferirHeuristica(sujeto);
    return new Response(JSON.stringify({
      categoria: h.categoria,
      confianza: h.confianza,
      alternativas: [],
      metodo: 'heuristica',
      razon: 'Detectado por palabras clave del sujeto'
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  // Estrategia híbrida
  try {
    if (testimonio.length >= 10) {
      // Camino 1: Gemini text (barato)
      const parsed = await categorizarConGeminiText(sujeto, testimonio, apiKey);
      const validated = validarRespuesta(parsed);
      return new Response(JSON.stringify({
        ...validated,
        metodo: 'gemini-text'
      }), { headers: { 'Content-Type': 'application/json' } });
    } else if (imagen_url && /^https?:\/\//.test(imagen_url)) {
      // Camino 2: Gemini Vision (caro pero más preciso)
      const parsed = await categorizarConGeminiVision(sujeto, imagen_url, apiKey);
      const validated = validarRespuesta(parsed);
      return new Response(JSON.stringify({
        ...validated,
        metodo: 'gemini-vision'
      }), { headers: { 'Content-Type': 'application/json' } });
    } else {
      // Camino 3: Heurística (sin testimonio ni imagen)
      const h = inferirHeuristica(sujeto);
      return new Response(JSON.stringify({
        categoria: h.categoria,
        confianza: h.confianza,
        alternativas: [],
        metodo: 'heuristica',
        razon: 'Detectado por palabras clave del sujeto'
      }), { headers: { 'Content-Type': 'application/json' } });
    }
  } catch (e: any) {
    // Si Gemini falla, fallback a heurística — nunca bloqueamos al usuario
    console.error('[categorizar] Gemini falló:', e?.message);
    const h = inferirHeuristica(sujeto);
    return new Response(JSON.stringify({
      categoria: h.categoria,
      confianza: h.confianza,
      alternativas: [],
      metodo: 'heuristica-fallback',
      razon: 'Gemini falló, usando palabras clave',
      _error: e?.message
    }), { headers: { 'Content-Type': 'application/json' } });
  }
};

export const config: Config = {
  path: '/.netlify/functions/categorizar'
};
