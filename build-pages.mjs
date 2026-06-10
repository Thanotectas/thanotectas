// ============================================================================
// build-pages.mjs — Pregenerador estático de páginas de cápsula + categorías
// + imágenes OG + sitemap + robots + RSS + ping IndexNow.
// Ejecutado por Netlify en cada deploy.
// ============================================================================

import { writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import satori from 'satori';
import { initWasm, Resvg } from '@resvg/resvg-wasm';

const SITE = 'https://thanotectas.com';
// Clave IndexNow: debe coincidir con el archivo <clave>.txt servido en la raíz
// (lo escribe este mismo build).
const INDEXNOW_KEY = '7d4f2c9b1e8a4063a5c2b7f0d9e6418c';
const SB_URL = 'https://oygwnmfwfxbxdogaqwmi.supabase.co';
const SB_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95Z3dubWZ3ZnhieGRvZ2Fxd21pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1Njc3NzEsImV4cCI6MjA5MTE0Mzc3MX0.RqnATwitqlTWThw27qw4Z2TlHiQBEVpvsKfbBe0kJ8I';

const TIPO_LABEL = {
  poema: 'Poema',
  dato: 'Dato científico',
  carta: 'Carta',
  obituario: 'Obituario',
  alerta: 'Alerta',
  ritual: 'Ritual',
};
const CAT_LABEL = {
  especies: 'Especies',
  ecosistemas: 'Ecosistemas',
  rios: 'Ríos',
  sonidos: 'Sonidos',
  territorios: 'Territorios',
  saberes: 'Saberes',
};

// Copy SEO por categoría — títulos pensados para búsqueda, voz del proyecto.
const CAT_SEO = {
  especies: {
    titulo: 'Especies en peligro y extintas',
    h1: 'Especies que el mundo está <em>perdiendo</em>',
    desc: 'Memorias de especies en peligro o ya extintas, inscritas en el Archivo del Umbral. Cada una con certificado permanente.',
    intro: 'Cada especie que se apaga deja un hueco con su forma exacta. Aquí los guardianes del Archivo nombran a las que se van: las que aún luchan y las que ya cruzaron el umbral.',
  },
  ecosistemas: {
    titulo: 'Ecosistemas que desaparecen',
    h1: 'Ecosistemas que <em>desaparecen</em>',
    desc: 'Páramos, bosques, arrecifes y humedales que se transforman o mueren. Memorias inscritas en el Archivo del Umbral.',
    intro: 'Un ecosistema no muere de golpe: se va apagando pieza por pieza. Estas cápsulas dejan constancia de los lugares vivos que conocimos.',
  },
  rios: {
    titulo: 'Ríos que mueren',
    h1: 'Ríos que <em>mueren</em>',
    desc: 'Memorias de ríos contaminados, secos o desviados, inscritas en el Archivo del Umbral con certificado permanente.',
    intro: 'Un río es la memoria líquida de un territorio. Cuando se seca o se envenena, alguien tiene que decir su nombre. Aquí lo decimos.',
  },
  sonidos: {
    titulo: 'Sonidos que se apagan',
    h1: 'Sonidos que se <em>apagan</em>',
    desc: 'Cantos de aves, lenguas, acentos y paisajes sonoros que se extinguen. Memorias del Archivo del Umbral.',
    intro: 'Hay extinciones que no se ven: se dejan de oír. Estas cápsulas guardan los sonidos que el mundo está silenciando.',
  },
  territorios: {
    titulo: 'Territorios que cambian para siempre',
    h1: 'Territorios que cambian <em>para siempre</em>',
    desc: 'Lugares, pueblos y paisajes transformados sin vuelta atrás. Memorias inscritas en el Archivo del Umbral.',
    intro: 'Algunos lugares solo siguen existiendo en quienes los recuerdan. Aquí los guardianes inscriben los territorios que ya no volverán a ser lo que fueron.',
  },
  saberes: {
    titulo: 'Saberes ancestrales en riesgo',
    h1: 'Saberes que se <em>olvidan</em>',
    desc: 'Oficios, técnicas, medicinas y conocimientos ancestrales en riesgo de perderse. Memorias del Archivo del Umbral.',
    intro: 'Cuando muere el último que sabía hacer algo, muere también una manera de estar en el mundo. Estas cápsulas guardan los saberes que se están yendo.',
  },
};

// Páginas estáticas conocidas y su prioridad SEO
const STATIC_PAGES = [
  { url: '/', priority: 1.0, changefreq: 'daily' },
  { url: '/oraculo.html', priority: 0.9, changefreq: 'weekly' },
  { url: '/planes.html', priority: 0.9, changefreq: 'monthly' },
  { url: '/archivo.html', priority: 0.8, changefreq: 'daily' },
  { url: '/bienvenida.html', priority: 0.7, changefreq: 'monthly' },
  { url: '/umbral.html', priority: 0.6, changefreq: 'monthly' },
  { url: '/guardian.html', priority: 0.6, changefreq: 'monthly' },
  { url: '/guardianes.html', priority: 0.6, changefreq: 'weekly' },
  { url: '/generador.html', priority: 0.5, changefreq: 'monthly' },
  { url: '/politica-privacidad.html', priority: 0.3, changefreq: 'yearly' },
];

// Páginas que NO van al sitemap (privadas / sin valor SEO)
// Quedan accesibles pero no las anunciamos a Google.
// Las gestiona robots.txt con Disallow.

// ----------------------------------------------------------------------------
// Util: escapar HTML
// ----------------------------------------------------------------------------
const escapeHtml = (s = '') =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Render markdown-lite del contenido de la cápsula:
//  - **negrita** -> <strong>
//  - *cursiva*   -> <em>
//  - LÍNEAS_EN_MAYÚSCULA cortas -> <h2>
//  - párrafos separados por \n\n
//  - saltos \n dentro de párrafo -> <br>
function renderContenido(texto = '') {
  const bloques = texto.split(/\n\n+/);
  return bloques
    .map((b) => {
      const trimmed = b.trim();
      if (!trimmed) return '';
      // Heading: línea única en mayúsculas (al menos 2 chars, sin minúsculas latinas)
      if (
        !trimmed.includes('\n') &&
        trimmed.length <= 80 &&
        trimmed.length >= 2 &&
        trimmed === trimmed.toUpperCase() &&
        /[A-ZÁÉÍÓÚÑ]/.test(trimmed)
      ) {
        return `<h2 class="cap-h">${escapeHtml(trimmed)}</h2>`;
      }
      // Procesar inline
      let html = escapeHtml(trimmed)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
      return `<p>${html}</p>`;
    })
    .filter(Boolean)
    .join('\n');
}

// ----------------------------------------------------------------------------
// Imagen OG 1200×630 por cápsula (mismo lenguaje visual que capsula-diaria)
// ----------------------------------------------------------------------------
let ogFonts = null;

async function initOG() {
  const wasmPath = path.join(process.cwd(), 'node_modules/@resvg/resvg-wasm/index_bg.wasm');
  await initWasm(readFileSync(wasmPath));
  const base = path.join(process.cwd(), 'node_modules');
  ogFonts = {
    cormorant: readFileSync(
      path.join(base, '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-italic.woff')
    ),
    jostLight: readFileSync(path.join(base, '@fontsource/jost/files/jost-latin-300-normal.woff')),
    jostSemi: readFileSync(path.join(base, '@fontsource/jost/files/jost-latin-600-normal.woff')),
  };
}

async function generarOGImagen(cap) {
  const año = new Date(cap.created_at).getFullYear();
  const sujetoDisplay = (cap.sujeto || 'Memoria').toUpperCase();
  const tipo = (cap.tipo || '').charAt(0).toUpperCase() + (cap.tipo || '').slice(1).toLowerCase();
  const certNum = cap.numero_certificado;
  const contenido = (cap.contenido || '').replace(/[#*`]/g, '').replace(/\s+/g, ' ').trim();
  const cita = contenido.length > 180 ? contenido.slice(0, 179).trim() + '…' : contenido;
  const citaFontSize = cita.length > 130 ? 30 : cita.length > 80 ? 36 : 42;

  const el = {
    type: 'div',
    props: {
      style: {
        width: 1200, height: 630, backgroundColor: '#14100D',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 50, paddingRight: 90, paddingBottom: 50, paddingLeft: 90,
      },
      children: [
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' },
            children: [
              { type: 'div', props: { style: { width: '100%', height: 1, backgroundColor: '#C4A45B', marginBottom: 16 } } },
              { type: 'p', props: { style: { fontFamily: 'Jost', fontWeight: 300, fontSize: 15, letterSpacing: 6, color: '#C4A45B', marginTop: 0, marginBottom: 8 }, children: 'T H A N O T E C T A S' } },
              { type: 'p', props: { style: { fontFamily: 'Jost', fontWeight: 300, fontSize: 11, letterSpacing: 2, color: '#5A4A38', marginTop: 0, marginBottom: 0 }, children: 'ARCHIVO DEL UMBRAL' } },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', flexGrow: 1, paddingTop: 24, paddingBottom: 24 },
            children: [
              { type: 'p', props: { style: { fontFamily: 'Cormorant Garamond', fontStyle: 'italic', fontWeight: 400, fontSize: citaFontSize, color: '#F5EDE0', textAlign: 'center', lineHeight: 1.5, marginTop: 0, marginBottom: 0 }, children: `"${cita}"` } },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' },
            children: [
              { type: 'div', props: { style: { width: '50%', height: 1, backgroundColor: '#3D2E1E', marginBottom: 14 } } },
              { type: 'p', props: { style: { fontFamily: 'Jost', fontWeight: 600, fontSize: 19, color: '#E8D9B8', marginTop: 0, marginBottom: 8, letterSpacing: 2, textAlign: 'center' }, children: sujetoDisplay } },
              { type: 'p', props: { style: { fontFamily: 'Jost', fontWeight: 300, fontSize: 13, color: '#8A7560', marginTop: 0, marginBottom: 0, letterSpacing: 2, textAlign: 'center' }, children: `${tipo} · ${año} · ${certNum}` } },
            ],
          },
        },
      ],
    },
  };

  const svg = await satori(el, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Cormorant Garamond', data: ogFonts.cormorant, style: 'italic', weight: 400 },
      { name: 'Jost', data: ogFonts.jostLight, style: 'normal', weight: 300 },
      { name: 'Jost', data: ogFonts.jostSemi, style: 'normal', weight: 600 },
    ],
  });
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
  return resvg.render().asPng();
}

// Meta description limpia (155 chars max, sin saltos ni markdown)
function metaDesc(texto = '') {
  const plain = texto
    .replace(/[#*`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > 155 ? plain.substring(0, 152).trimEnd() + '…' : plain;
}

// ----------------------------------------------------------------------------
// Template HTML de página /c/[numero]
// ----------------------------------------------------------------------------
function renderCapsulaHTML(cap, relacionadas = []) {
  const cert = cap.numero_certificado;
  const sujeto = cap.sujeto || '';
  const tipoLabel = TIPO_LABEL[cap.tipo] || cap.tipo || 'Cápsula';
  const catLabel = CAT_LABEL[cap.categoria] || cap.categoria || '';
  const created = cap.created_at;
  const dateISO = created ? new Date(created).toISOString() : '';
  const dateFmt = created
    ? new Date(created).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  const guardian = cap.guardian_nombre || 'Thanotectas';
  const guardianAvatar = cap.guardian_avatar || '🌿';
  const guardianSlug = cap.guardian_slug || '';
  const imagen = cap.imagen_url || `${SITE}/img/hero-capsula-mano.png`;
  // Imagen OG 1200×630 propia, generada por este build en /og/
  const ogImagen = `${SITE}/og/${cert}.png`;
  const url = `${SITE}/c/${cert}`;
  const catUrl = `${SITE}/categoria/${cap.categoria}`;
  const titulo = `${sujetoCapitalizado(sujeto)} · ${tipoLabel}`;
  const tituloCompleto = `${titulo} · Cápsula ${cert} · Thanotectas`;
  const descripcion = metaDesc(cap.contenido);
  const contenidoHTML = renderContenido(cap.contenido);

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: titulo,
    image: [ogImagen, imagen],
    datePublished: dateISO,
    dateModified: dateISO,
    author: { '@type': 'Person', name: guardian },
    publisher: {
      '@type': 'Organization',
      name: 'Thanotectas',
      logo: { '@type': 'ImageObject', url: `${SITE}/icons/icon-512.png` },
    },
    description: descripcion,
    url: url,
    inLanguage: cap.idioma || 'es',
    articleSection: catLabel,
    keywords: [sujeto, tipoLabel, catLabel, 'duelo ecológico', 'memoria', 'archivo'].join(', '),
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: SITE },
      { '@type': 'ListItem', position: 2, name: 'Archivo Colectivo', item: `${SITE}/archivo.html` },
      { '@type': 'ListItem', position: 3, name: titulo, item: url },
    ],
  };

  const relacionadasHTML = relacionadas.length
    ? `<section class="related"><h2 class="related-title">Otras memorias del Archivo</h2><div class="related-grid">${relacionadas
        .map(
          (r) => `<a class="rel-card" href="/c/${r.numero_certificado}">
        <div class="rel-num">${r.numero_certificado.replace(/-/g, ' · ')}</div>
        <div class="rel-sujeto">${escapeHtml(sujetoCapitalizado(r.sujeto || ''))}</div>
        <div class="rel-meta"><span class="rel-cat">${CAT_LABEL[r.categoria] || r.categoria}</span> · ${TIPO_LABEL[r.tipo] || r.tipo}</div>
      </a>`
        )
        .join('\n')}</div><p class="related-more"><a href="/categoria/${escapeHtml(cap.categoria)}">Ver todas las memorias de ${escapeHtml(catLabel)} →</a></p></section>`
    : '';

  return `<!DOCTYPE html>
<html lang="${cap.idioma || 'es'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(tituloCompleto)}</title>
<meta name="description" content="${escapeHtml(descripcion)}">
<meta name="theme-color" content="#0d130c">
<link rel="canonical" href="${url}">
<link rel="alternate" type="application/rss+xml" title="Thanotectas — Cápsula del día" href="${SITE}/feed.xml">
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='28' font-size='28'>🌿</text></svg>">

<!-- Open Graph -->
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${escapeHtml(titulo)} — Thanotectas">
<meta property="og:description" content="${escapeHtml(descripcion)}">
<meta property="og:image" content="${ogImagen}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="es_CO">
<meta property="og:site_name" content="Thanotectas — Archivo del Umbral">
<meta property="article:published_time" content="${dateISO}">
<meta property="article:author" content="${escapeHtml(guardian)}">
<meta property="article:section" content="${escapeHtml(catLabel)}">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@thanotectas">
<meta name="twitter:title" content="${escapeHtml(titulo)} — Thanotectas">
<meta name="twitter:description" content="${escapeHtml(descripcion)}">
<meta name="twitter:image" content="${ogImagen}">

<!-- Schema.org -->
<script type="application/ld+json">${JSON.stringify(articleSchema)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,300;1,9..144,400&family=Manrope:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@300;400;500&display=swap" rel="stylesheet">

<style>
:root{
  --noche:#0d130c;--noche-2:#141d12;--noche-3:#1c2719;
  --bosque:#1f3a25;--bosque-claro:#2d5237;
  --musgo:#4a8a4b;--musgo-glow:#6cc06d;
  --oro:#d4a547;--oro-claro:#e5c068;--oro-glow:#f4d989;
  --crema:#f0e6d3;--crema-50:rgba(240,230,211,.5);--crema-30:rgba(240,230,211,.3);
  --linea:rgba(212,165,71,.18);--linea-2:rgba(212,165,71,.35);
  --serif:'Fraunces',Georgia,serif;--sans:'Manrope',system-ui,sans-serif;--mono:'IBM Plex Mono',ui-monospace,monospace;
}
*{margin:0;padding:0;box-sizing:border-box}
::selection{background:var(--oro);color:var(--noche)}
html{scroll-behavior:smooth}
body{font-family:var(--sans);background:var(--noche);color:var(--crema);min-height:100vh;font-weight:300;line-height:1.7;-webkit-font-smoothing:antialiased}
body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:1;background:radial-gradient(ellipse at 20% 0%, rgba(74,138,75,.06) 0%, transparent 50%),radial-gradient(ellipse at 80% 100%, rgba(212,165,71,.04) 0%, transparent 50%)}

/* NAV */
.nav{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:1rem 2rem;background:rgba(13,19,12,.92);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-bottom:1px solid var(--linea)}
.nav-logo{font-family:var(--serif);font-size:1.05rem;font-weight:500;color:var(--oro);text-decoration:none;letter-spacing:.18em;text-transform:uppercase;display:flex;align-items:center;gap:.7rem}
.nav-logo svg{width:32px;height:32px}
.nav-links{display:flex;gap:1.4rem;align-items:center;list-style:none}
.nav-links a{color:var(--crema-50);text-decoration:none;font-size:.78rem;font-weight:400;letter-spacing:.08em;transition:color .3s}
.nav-links a:hover{color:var(--oro)}
.nav-cta{padding:.55rem 1.3rem;border:1px solid var(--oro);border-radius:2px;color:var(--oro);font-size:.7rem;font-weight:500;letter-spacing:.2em;text-transform:uppercase;text-decoration:none;transition:all .3s}
.nav-cta:hover{background:rgba(212,165,71,.1)}

/* MAIN CAP */
main{position:relative;z-index:2;padding:7rem 1.5rem 4rem;max-width:760px;margin:0 auto}

.breadcrumb{font-family:var(--mono);font-size:.65rem;letter-spacing:.18em;text-transform:uppercase;color:var(--crema-30);margin-bottom:2rem}
.breadcrumb a{color:var(--crema-50);text-decoration:none}
.breadcrumb a:hover{color:var(--oro)}
.breadcrumb span{margin:0 .5rem;color:var(--linea-2)}

.cap-head{margin-bottom:3rem}
.cap-cert{font-family:var(--mono);font-size:.7rem;letter-spacing:.32em;text-transform:uppercase;color:var(--oro);margin-bottom:1.2rem;display:flex;align-items:center;gap:.7rem}
.cap-cert::before{content:'';width:18px;height:1px;background:var(--oro)}
h1{font-family:var(--serif);font-size:clamp(2.2rem,5.5vw,3.6rem);font-weight:400;line-height:1.1;letter-spacing:-0.01em;color:var(--crema)}
h1 em{font-style:italic;color:var(--oro-claro)}
.cap-tipo{font-family:var(--serif);font-style:italic;color:var(--oro-claro)}
.cap-meta{display:flex;flex-wrap:wrap;gap:1.2rem;align-items:center;margin-top:1.8rem;padding:1.2rem 0;border-top:1px solid var(--linea);border-bottom:1px solid var(--linea);font-family:var(--mono);font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;color:var(--crema-50)}
.cap-meta .musgo{color:var(--musgo-glow)}
.cap-meta .sep{color:var(--linea-2)}
.cap-meta .guardian-avatar{font-size:1.2rem;margin-right:.3rem}

/* Imagen hero */
.cap-imagen{margin:2.5rem 0;border:1px solid var(--linea);border-radius:2px;overflow:hidden;background:var(--noche-2)}
.cap-imagen img{width:100%;height:auto;display:block}

/* Contenido */
.cap-body{font-family:var(--serif);font-size:1.15rem;line-height:1.85;color:var(--crema);font-weight:300}
.cap-body p{margin-bottom:1.4rem}
.cap-body strong{color:var(--oro-claro);font-weight:500}
.cap-body em{font-style:italic;color:var(--crema)}
.cap-h{font-family:var(--mono);font-size:.78rem;letter-spacing:.32em;text-transform:uppercase;color:var(--oro);margin:2.8rem 0 1rem;padding-top:1.2rem;border-top:1px dashed var(--linea);font-weight:500}

/* CTA al final de cápsula */
.cap-cta{margin-top:4rem;padding:2.5rem 2rem;background:linear-gradient(135deg, rgba(31,58,37,.4), rgba(13,19,12,.95));border:1px solid var(--linea-2);border-radius:2px;text-align:center}
.cap-cta-title{font-family:var(--serif);font-style:italic;font-size:1.5rem;line-height:1.3;color:var(--crema);margin-bottom:.6rem}
.cap-cta-title em{color:var(--oro-claro)}
.cap-cta-sub{font-family:var(--mono);font-size:.72rem;letter-spacing:.2em;text-transform:uppercase;color:var(--crema-50);margin-bottom:1.6rem}
.btn-primary{display:inline-flex;align-items:center;gap:.6rem;padding:1.05rem 2.5rem;background:linear-gradient(135deg, var(--oro), var(--oro-claro));color:var(--noche);font-family:var(--sans);font-size:.78rem;font-weight:600;letter-spacing:.2em;text-transform:uppercase;border:none;border-radius:2px;cursor:pointer;text-decoration:none;transition:all .4s cubic-bezier(.16,1,.3,1)}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 12px 40px rgba(212,165,71,.4)}

/* Share */
.share-box{margin-top:2rem;text-align:center;font-family:var(--mono);font-size:.7rem;letter-spacing:.18em;text-transform:uppercase;color:var(--crema-50)}
.share-box a{display:inline-block;margin:0 .6rem;color:var(--oro);text-decoration:none;transition:transform .3s}
.share-box a:hover{transform:translateY(-2px)}

/* Newsletter capture */
.newsletter{margin-top:3.5rem;padding:2.5rem 2rem;border:1px dashed var(--linea-2);border-radius:2px;background:rgba(13,11,8,.4);text-align:center}
.newsletter-eyebrow{font-family:var(--mono);font-size:.6rem;letter-spacing:.4em;text-transform:uppercase;color:var(--musgo-glow);margin-bottom:.9rem}
.newsletter-title{font-family:var(--serif);font-style:italic;font-size:1.5rem;line-height:1.3;color:var(--crema);font-weight:400;margin-bottom:.5rem}
.newsletter-title em{color:var(--oro-claro);font-style:italic}
.newsletter-sub{font-family:var(--serif);font-size:.95rem;color:var(--crema-50);margin-bottom:1.6rem;line-height:1.7;font-weight:300;font-style:italic}
.newsletter-form{display:flex;gap:.5rem;max-width:420px;margin:0 auto;flex-wrap:wrap}
.newsletter-form input[type=email]{flex:1;min-width:220px;background:rgba(13,11,8,.6);border:1px solid var(--linea-2);border-radius:2px;padding:.85rem 1rem;color:var(--crema);font-family:var(--sans);font-size:.85rem;font-weight:300;outline:none;transition:border-color .3s}
.newsletter-form input[type=email]::placeholder{color:var(--crema-30)}
.newsletter-form input[type=email]:focus{border-color:var(--oro)}
.newsletter-form button{padding:.85rem 1.6rem;background:linear-gradient(135deg,var(--oro),var(--oro-claro));color:var(--noche);border:none;border-radius:2px;font-family:var(--sans);font-size:.72rem;font-weight:600;letter-spacing:.2em;text-transform:uppercase;cursor:pointer;transition:transform .3s,box-shadow .3s}
.newsletter-form button:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 8px 24px rgba(212,165,71,.3)}
.newsletter-form button:disabled{opacity:.5;cursor:not-allowed}
.newsletter-form .hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.newsletter-msg{margin-top:1rem;font-family:var(--mono);font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;min-height:1.2em}
.newsletter-msg.ok{color:var(--musgo-glow)}
.newsletter-msg.err{color:#c47050}
.newsletter-fineprint{font-family:var(--mono);font-size:.6rem;color:var(--crema-30);letter-spacing:.15em;margin-top:1.2rem;text-transform:uppercase}

/* Relacionadas */
.related{margin-top:5rem;padding-top:3rem;border-top:1px solid var(--linea)}
.related-title{font-family:var(--serif);font-size:1.4rem;font-weight:400;margin-bottom:1.5rem;color:var(--crema)}
.related-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1px;background:var(--linea);border:1px solid var(--linea)}
.rel-card{background:var(--noche-2);padding:1.4rem 1.3rem;text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:.4rem;transition:background .3s}
.rel-card:hover{background:var(--noche-3)}
.rel-num{font-family:var(--mono);font-size:.55rem;letter-spacing:.25em;color:var(--oro);text-transform:uppercase}
.rel-sujeto{font-family:var(--serif);font-size:1.15rem;font-weight:500;line-height:1.2;color:var(--crema)}
.rel-meta{font-family:var(--mono);font-size:.6rem;letter-spacing:.18em;text-transform:uppercase;color:var(--crema-50)}
.rel-cat{color:var(--musgo-glow)}
.related-more{margin-top:1.4rem;font-family:var(--mono);font-size:.7rem;letter-spacing:.15em;text-transform:uppercase}
.related-more a{color:var(--oro);text-decoration:none}
.related-more a:hover{color:var(--oro-claro)}

/* FOOTER */
footer{position:relative;z-index:2;padding:3rem 1.5rem 2rem;border-top:1px solid var(--linea);margin-top:5rem;text-align:center}
footer p{font-family:var(--mono);font-size:.65rem;color:var(--crema-50);letter-spacing:.18em;text-transform:uppercase;margin-bottom:.5rem}
footer a{color:var(--oro);text-decoration:none}

@media(max-width:680px){
  .nav{padding:.9rem 1.2rem}
  .nav-links{gap:.8rem}
  .nav-links a:not(.nav-cta){display:none}
  main{padding:5.5rem 1.2rem 3rem}
  h1{font-size:2rem}
  .cap-body{font-size:1.05rem}
}
</style>
</head>
<body>

<nav class="nav">
  <a href="/" class="nav-logo">
    <svg viewBox="0 0 220 220" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ntg" x1="110" y1="40" x2="110" y2="160" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#f4d989"/><stop offset="100%" stop-color="#d4a547"/></linearGradient>
        <linearGradient id="nrg" x1="110" y1="130" x2="110" y2="200" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#6cc06d"/><stop offset="100%" stop-color="#2d5237"/></linearGradient>
      </defs>
      <line x1="40" y1="132" x2="180" y2="132" stroke="#d4a547" stroke-width="0.5" opacity="0.4"/>
      <path d="M108 132 L108 180 M112 132 L112 180" stroke="url(#nrg)" stroke-width="2" stroke-linecap="round"/>
      <path d="M108 148 Q94 158 80 168" stroke="url(#nrg)" stroke-width="1.5" stroke-linecap="round" opacity="0.85"/>
      <path d="M112 148 Q126 158 140 168" stroke="url(#nrg)" stroke-width="1.5" stroke-linecap="round" opacity="0.85"/>
      <path d="M108 132 Q109 110 110 72" stroke="url(#ntg)" stroke-width="2.8" stroke-linecap="round"/>
      <path d="M110 90 Q92 76 70 66" stroke="url(#ntg)" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M110 90 Q128 76 150 66" stroke="url(#ntg)" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="110" cy="72" r="5" fill="#f4d989" opacity="0.95"/>
      <circle cx="110" cy="72" r="2.5" fill="#fffaee"/>
    </svg>
    THANOTECTAS
  </a>
  <ul class="nav-links">
    <li><a href="/oraculo.html">Oráculo</a></li>
    <li><a href="/archivo.html">Archivo</a></li>
    <li><a href="/planes.html">Planes</a></li>
    <li><a href="/oraculo.html" class="nav-cta">Inscribir cápsula</a></li>
  </ul>
</nav>

<main>
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href="/">Inicio</a><span>·</span><a href="/archivo.html">Archivo</a><span>·</span>${escapeHtml(cert)}
  </nav>

  <header class="cap-head">
    <div class="cap-cert">Cápsula ${escapeHtml(cert)}</div>
    <h1>${escapeHtml(sujetoCapitalizado(sujeto))}<br><span class="cap-tipo">· ${escapeHtml(tipoLabel)}</span></h1>
    <div class="cap-meta">
      <a class="musgo" href="/categoria/${escapeHtml(cap.categoria)}" style="color:inherit;text-decoration:none">${escapeHtml(catLabel)}</a>
      <span class="sep">·</span>
      <span><span class="guardian-avatar">${escapeHtml(guardianAvatar)}</span> ${escapeHtml(guardian)}</span>
      <span class="sep">·</span>
      <time datetime="${dateISO}">${escapeHtml(dateFmt)}</time>
    </div>
  </header>

  ${
    cap.imagen_url
      ? `<figure class="cap-imagen"><img src="${escapeHtml(imagen)}" alt="Cápsula ${escapeHtml(cert)} — ${escapeHtml(sujeto)}" loading="lazy"></figure>`
      : ''
  }

  <article class="cap-body">
    ${contenidoHTML}
  </article>

  <div class="share-box">
    Compartir esta memoria
    <br><br>
    <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(titulo + ' — Cápsula del Archivo del Umbral')}&url=${encodeURIComponent(url + '?utm_source=x&utm_medium=share')}" target="_blank" rel="noopener" aria-label="Compartir en X">𝕏</a>
    <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url + '?utm_source=facebook&utm_medium=share')}" target="_blank" rel="noopener" aria-label="Compartir en Facebook">f</a>
    <a href="https://api.whatsapp.com/send?text=${encodeURIComponent(titulo + ' — una memoria del Archivo del Umbral: ' + url + '?utm_source=whatsapp&utm_medium=share')}" target="_blank" rel="noopener" aria-label="Compartir en WhatsApp">✆</a>
    <a href="mailto:?subject=${encodeURIComponent(titulo)}&body=${encodeURIComponent('Te comparto esta cápsula del Archivo del Umbral: ' + url + '?utm_source=correo&utm_medium=share')}" aria-label="Compartir por correo">✉</a>
    <a href="#" id="copy-link" data-url="${url}?utm_source=enlace&utm_medium=share" aria-label="Copiar enlace">⎘</a>
  </div>

  <section class="cap-cta">
    <p class="cap-cta-title">¿Qué pequeño <em>fragmento de vida</em> salvarías para siempre?</p>
    <p class="cap-cta-sub">Inscribe tu propia memoria · Las 3 primeras son gratis</p>
    <a href="/oraculo.html" class="btn-primary">🌿 Abrir el Oráculo</a>
  </section>

  <section class="newsletter" aria-labelledby="news-title">
    <div class="newsletter-eyebrow">✦ Una memoria al amanecer ✦</div>
    <h2 class="newsletter-title" id="news-title">Recibe la <em>cápsula del día</em><br>por correo</h2>
    <p class="newsletter-sub">Cada amanecer en Colombia, una nueva memoria del Archivo aterriza en tu bandeja.</p>
    <form class="newsletter-form" id="news-form" novalidate>
      <label class="hp"><input type="text" name="website" tabindex="-1" autocomplete="off"></label>
      <input type="email" name="email" placeholder="tu@correo.com" required aria-label="Tu correo electrónico">
      <button type="submit">Suscribirme</button>
    </form>
    <p class="newsletter-msg" id="news-msg" role="status" aria-live="polite"></p>
    <p class="newsletter-fineprint">Sin spam · Te puedes dar de baja en un click</p>
  </section>

  ${relacionadasHTML}
</main>

<script>
(function(){
  var c = document.getElementById('copy-link');
  if (c) c.addEventListener('click', function(e){
    e.preventDefault();
    navigator.clipboard.writeText(c.getAttribute('data-url')).then(function(){
      var prev = c.textContent;
      c.textContent = '✓';
      setTimeout(function(){ c.textContent = prev; }, 1500);
    });
  });
  var f = document.getElementById('news-form');
  var msg = document.getElementById('news-msg');
  if (!f) return;
  f.addEventListener('submit', async function(e){
    e.preventDefault();
    var btn = f.querySelector('button');
    var emailEl = f.querySelector('input[name=email]');
    var hpEl = f.querySelector('input[name=website]');
    var email = (emailEl.value || '').trim();
    if (!email || !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$/.test(email)) {
      msg.className = 'newsletter-msg err';
      msg.textContent = 'Correo inválido';
      return;
    }
    btn.disabled = true;
    msg.className = 'newsletter-msg';
    msg.textContent = 'Enviando…';
    try {
      var r = await fetch('/.netlify/functions/suscribir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          idioma: document.documentElement.lang || 'es',
          fuente: 'capsula:' + window.location.pathname.replace(/^\\//, ''),
          website: hpEl ? hpEl.value : ''
        })
      });
      var data = await r.json();
      if (r.ok && data && data.ok) {
        msg.className = 'newsletter-msg ok';
        msg.textContent = data.ya_existia
          ? '✓ Ya estabas suscrito — gracias por volver'
          : (data.reactivado ? '✓ Te reactivamos en la lista' : '✓ Inscrito — revisa tu correo');
        f.reset();
      } else {
        msg.className = 'newsletter-msg err';
        msg.textContent = (data && data.error === 'email_invalido') ? 'Correo inválido' : 'No se pudo procesar — intenta de nuevo';
      }
    } catch(err) {
      msg.className = 'newsletter-msg err';
      msg.textContent = 'Error de conexión';
    } finally {
      btn.disabled = false;
    }
  });
})();
</script>

<footer>
  <p>© 2026 Thanotectas · Archivo del Umbral · Bogotá, Colombia</p>
  <p><a href="/">thanotectas.com</a> · <a href="/planes.html">Planes</a> · <a href="/politica-privacidad.html">Privacidad</a></p>
</footer>

</body>
</html>
`;
}

function sujetoCapitalizado(s = '') {
  return s
    .toLowerCase()
    .split(' ')
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// ----------------------------------------------------------------------------
// Template HTML de página /categoria/[slug]
// ----------------------------------------------------------------------------
function renderCategoriaHTML(slug, caps) {
  const seo = CAT_SEO[slug] || { titulo: CAT_LABEL[slug] || slug, h1: CAT_LABEL[slug] || slug, desc: '', intro: '' };
  const url = `${SITE}/categoria/${slug}`;
  const tituloCompleto = `${seo.titulo} · Archivo del Umbral — Thanotectas`;

  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: seo.titulo,
    description: seo.desc,
    url: url,
    inLanguage: 'es',
    isPartOf: { '@type': 'WebSite', name: 'Thanotectas — Archivo del Umbral', url: SITE },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: caps.length,
      itemListElement: caps.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: sujetoCapitalizado(c.sujeto || ''),
        url: `${SITE}/c/${c.numero_certificado}`,
      })),
    },
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: SITE },
      { '@type': 'ListItem', position: 2, name: 'Archivo Colectivo', item: `${SITE}/archivo.html` },
      { '@type': 'ListItem', position: 3, name: seo.titulo, item: url },
    ],
  };

  const cardsHTML = caps
    .map(
      (c) => `<a class="rel-card" href="/c/${c.numero_certificado}">
      <div class="rel-num">${c.numero_certificado.replace(/-/g, ' · ')}</div>
      <div class="rel-sujeto">${escapeHtml(sujetoCapitalizado(c.sujeto || ''))}</div>
      <div class="rel-meta">${TIPO_LABEL[c.tipo] || c.tipo} · ${escapeHtml(c.guardian_nombre || 'Thanotectas')}</div>
      <p class="rel-extract">${escapeHtml(metaDesc(c.contenido))}</p>
    </a>`
    )
    .join('\n');

  const otrasCategorias = Object.keys(CAT_SEO)
    .filter((s) => s !== slug)
    .map((s) => `<a href="/categoria/${s}">${CAT_LABEL[s]}</a>`)
    .join('\n      ');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(tituloCompleto)}</title>
<meta name="description" content="${escapeHtml(seo.desc)}">
<meta name="theme-color" content="#0d130c">
<link rel="canonical" href="${url}">
<link rel="alternate" type="application/rss+xml" title="Thanotectas — Cápsula del día" href="${SITE}/feed.xml">
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='28' font-size='28'>🌿</text></svg>">

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${escapeHtml(seo.titulo)} — Thanotectas">
<meta property="og:description" content="${escapeHtml(seo.desc)}">
<meta property="og:image" content="${SITE}/umbral-og.png">
<meta property="og:locale" content="es_CO">
<meta property="og:site_name" content="Thanotectas — Archivo del Umbral">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@thanotectas">
<meta name="twitter:title" content="${escapeHtml(seo.titulo)} — Thanotectas">
<meta name="twitter:description" content="${escapeHtml(seo.desc)}">
<meta name="twitter:image" content="${SITE}/umbral-og.png">

<!-- Schema.org -->
<script type="application/ld+json">${JSON.stringify(collectionSchema)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,300;1,9..144,400&family=Manrope:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@300;400;500&display=swap" rel="stylesheet">

<style>
:root{
  --noche:#0d130c;--noche-2:#141d12;--noche-3:#1c2719;
  --bosque:#1f3a25;--bosque-claro:#2d5237;
  --musgo:#4a8a4b;--musgo-glow:#6cc06d;
  --oro:#d4a547;--oro-claro:#e5c068;--oro-glow:#f4d989;
  --crema:#f0e6d3;--crema-50:rgba(240,230,211,.5);--crema-30:rgba(240,230,211,.3);
  --linea:rgba(212,165,71,.18);--linea-2:rgba(212,165,71,.35);
  --serif:'Fraunces',Georgia,serif;--sans:'Manrope',system-ui,sans-serif;--mono:'IBM Plex Mono',ui-monospace,monospace;
}
*{margin:0;padding:0;box-sizing:border-box}
::selection{background:var(--oro);color:var(--noche)}
html{scroll-behavior:smooth}
body{font-family:var(--sans);background:var(--noche);color:var(--crema);min-height:100vh;font-weight:300;line-height:1.7;-webkit-font-smoothing:antialiased}
body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:1;background:radial-gradient(ellipse at 20% 0%, rgba(74,138,75,.06) 0%, transparent 50%),radial-gradient(ellipse at 80% 100%, rgba(212,165,71,.04) 0%, transparent 50%)}
.nav{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:1rem 2rem;background:rgba(13,19,12,.92);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-bottom:1px solid var(--linea)}
.nav-logo{font-family:var(--serif);font-size:1.05rem;font-weight:500;color:var(--oro);text-decoration:none;letter-spacing:.18em;text-transform:uppercase;display:flex;align-items:center;gap:.7rem}
.nav-links{display:flex;gap:1.4rem;align-items:center;list-style:none}
.nav-links a{color:var(--crema-50);text-decoration:none;font-size:.78rem;font-weight:400;letter-spacing:.08em;transition:color .3s}
.nav-links a:hover{color:var(--oro)}
.nav-cta{padding:.55rem 1.3rem;border:1px solid var(--oro);border-radius:2px;color:var(--oro);font-size:.7rem;font-weight:500;letter-spacing:.2em;text-transform:uppercase;text-decoration:none;transition:all .3s}
.nav-cta:hover{background:rgba(212,165,71,.1)}
main{position:relative;z-index:2;padding:7rem 1.5rem 4rem;max-width:960px;margin:0 auto}
.breadcrumb{font-family:var(--mono);font-size:.65rem;letter-spacing:.18em;text-transform:uppercase;color:var(--crema-30);margin-bottom:2rem}
.breadcrumb a{color:var(--crema-50);text-decoration:none}
.breadcrumb a:hover{color:var(--oro)}
.breadcrumb span{margin:0 .5rem;color:var(--linea-2)}
.cat-eyebrow{font-family:var(--mono);font-size:.7rem;letter-spacing:.32em;text-transform:uppercase;color:var(--oro);margin-bottom:1.2rem;display:flex;align-items:center;gap:.7rem}
.cat-eyebrow::before{content:'';width:18px;height:1px;background:var(--oro)}
h1{font-family:var(--serif);font-size:clamp(2.2rem,5.5vw,3.4rem);font-weight:400;line-height:1.15;letter-spacing:-0.01em;color:var(--crema);margin-bottom:1.4rem}
h1 em{font-style:italic;color:var(--oro-claro)}
.cat-intro{font-family:var(--serif);font-size:1.15rem;font-style:italic;line-height:1.8;color:var(--crema-50);max-width:640px;margin-bottom:3rem}
.cat-count{font-family:var(--mono);font-size:.7rem;letter-spacing:.2em;text-transform:uppercase;color:var(--musgo-glow);margin-bottom:1.5rem}
.related-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1px;background:var(--linea);border:1px solid var(--linea)}
.rel-card{background:var(--noche-2);padding:1.6rem 1.4rem;text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:.5rem;transition:background .3s}
.rel-card:hover{background:var(--noche-3)}
.rel-num{font-family:var(--mono);font-size:.55rem;letter-spacing:.25em;color:var(--oro);text-transform:uppercase}
.rel-sujeto{font-family:var(--serif);font-size:1.25rem;font-weight:500;line-height:1.2;color:var(--crema)}
.rel-meta{font-family:var(--mono);font-size:.6rem;letter-spacing:.18em;text-transform:uppercase;color:var(--crema-50)}
.rel-extract{font-family:var(--serif);font-size:.9rem;font-style:italic;line-height:1.6;color:var(--crema-50)}
.otras-cats{margin-top:3.5rem;padding-top:2rem;border-top:1px solid var(--linea);font-family:var(--mono);font-size:.7rem;letter-spacing:.18em;text-transform:uppercase;color:var(--crema-50)}
.otras-cats a{display:inline-block;margin:.4rem .8rem .4rem 0;padding:.5rem 1rem;border:1px solid var(--linea-2);border-radius:2px;color:var(--oro);text-decoration:none;transition:background .3s}
.otras-cats a:hover{background:rgba(212,165,71,.1)}
.cap-cta{margin-top:4rem;padding:2.5rem 2rem;background:linear-gradient(135deg, rgba(31,58,37,.4), rgba(13,19,12,.95));border:1px solid var(--linea-2);border-radius:2px;text-align:center}
.cap-cta-title{font-family:var(--serif);font-style:italic;font-size:1.5rem;line-height:1.3;color:var(--crema);margin-bottom:.6rem}
.cap-cta-title em{color:var(--oro-claro)}
.cap-cta-sub{font-family:var(--mono);font-size:.72rem;letter-spacing:.2em;text-transform:uppercase;color:var(--crema-50);margin-bottom:1.6rem}
.btn-primary{display:inline-flex;align-items:center;gap:.6rem;padding:1.05rem 2.5rem;background:linear-gradient(135deg, var(--oro), var(--oro-claro));color:var(--noche);font-family:var(--sans);font-size:.78rem;font-weight:600;letter-spacing:.2em;text-transform:uppercase;border:none;border-radius:2px;cursor:pointer;text-decoration:none;transition:all .4s cubic-bezier(.16,1,.3,1)}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 12px 40px rgba(212,165,71,.4)}
footer{position:relative;z-index:2;padding:3rem 1.5rem 2rem;border-top:1px solid var(--linea);margin-top:5rem;text-align:center}
footer p{font-family:var(--mono);font-size:.65rem;color:var(--crema-50);letter-spacing:.18em;text-transform:uppercase;margin-bottom:.5rem}
footer a{color:var(--oro);text-decoration:none}
@media(max-width:680px){
  .nav{padding:.9rem 1.2rem}
  .nav-links{gap:.8rem}
  .nav-links a:not(.nav-cta){display:none}
  main{padding:5.5rem 1.2rem 3rem}
  h1{font-size:2rem}
}
</style>
</head>
<body>

<nav class="nav">
  <a href="/" class="nav-logo">THANOTECTAS</a>
  <ul class="nav-links">
    <li><a href="/oraculo.html">Oráculo</a></li>
    <li><a href="/archivo.html">Archivo</a></li>
    <li><a href="/planes.html">Planes</a></li>
    <li><a href="/oraculo.html" class="nav-cta">Inscribir cápsula</a></li>
  </ul>
</nav>

<main>
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href="/">Inicio</a><span>·</span><a href="/archivo.html">Archivo</a><span>·</span>${escapeHtml(CAT_LABEL[slug] || slug)}
  </nav>

  <header>
    <div class="cat-eyebrow">Archivo del Umbral</div>
    <h1>${seo.h1}</h1>
    <p class="cat-intro">${escapeHtml(seo.intro)}</p>
  </header>

  <p class="cat-count">${caps.length} ${caps.length === 1 ? 'memoria inscrita' : 'memorias inscritas'}</p>

  <div class="related-grid">
    ${cardsHTML}
  </div>

  <div class="otras-cats">
    Otras salas del Archivo
    <br><br>
      ${otrasCategorias}
  </div>

  <section class="cap-cta">
    <p class="cap-cta-title">¿Qué pequeño <em>fragmento de vida</em> salvarías para siempre?</p>
    <p class="cap-cta-sub">Inscribe tu propia memoria · Las 3 primeras son gratis</p>
    <a href="/oraculo.html" class="btn-primary">🌿 Abrir el Oráculo</a>
  </section>
</main>

<footer>
  <p>© 2026 Thanotectas · Archivo del Umbral · Bogotá, Colombia</p>
  <p><a href="/">thanotectas.com</a> · <a href="/planes.html">Planes</a> · <a href="/politica-privacidad.html">Privacidad</a></p>
</footer>

</body>
</html>
`;
}

// ----------------------------------------------------------------------------
// RSS feed.xml — para lectores RSS, agregadores y descubrimiento
// ----------------------------------------------------------------------------
function renderRSS(caps) {
  const items = caps
    .slice(0, 50)
    .map((c) => {
      const url = `${SITE}/c/${c.numero_certificado}`;
      const titulo = `${sujetoCapitalizado(c.sujeto || '')} · ${TIPO_LABEL[c.tipo] || c.tipo}`;
      const pubDate = c.created_at ? new Date(c.created_at).toUTCString() : new Date().toUTCString();
      return `  <item>
    <title>${escapeXml(titulo)}</title>
    <link>${url}?utm_source=rss&amp;utm_medium=feed</link>
    <guid isPermaLink="true">${url}</guid>
    <pubDate>${pubDate}</pubDate>
    <category>${escapeXml(CAT_LABEL[c.categoria] || c.categoria || '')}</category>
    <description>${escapeXml(metaDesc(c.contenido))}</description>
  </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Thanotectas — Archivo del Umbral</title>
  <link>${SITE}</link>
  <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
  <description>Cada día, una memoria de lo que el mundo está perdiendo. Cápsulas selladas con certificado permanente.</description>
  <language>es</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
</channel>
</rss>
`;
}

// ----------------------------------------------------------------------------
// IndexNow — avisa a Bing/Yandex y agregadores de cada URL nueva o cambiada
// ----------------------------------------------------------------------------
async function pingIndexNow(urls) {
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: 'thanotectas.com',
        key: INDEXNOW_KEY,
        keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`,
        urlList: urls.slice(0, 10000),
      }),
    });
    console.log(`[build-pages] IndexNow ping: ${res.status}`);
  } catch (err) {
    console.warn('[build-pages] IndexNow ping falló (no fatal):', err.message);
  }
}

// ----------------------------------------------------------------------------
// Sitemap.xml
// ----------------------------------------------------------------------------
function renderSitemap(caps, categorias = []) {
  const today = new Date().toISOString().split('T')[0];
  const urls = [
    ...STATIC_PAGES.map(
      (p) =>
        `  <url><loc>${SITE}${p.url}</loc><lastmod>${today}</lastmod><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`
    ),
    ...categorias.map(
      (slug) =>
        `  <url><loc>${SITE}/categoria/${slug}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`
    ),
    ...caps.map((c) => {
      const lastmod = c.created_at ? c.created_at.split('T')[0] : today;
      return `  <url><loc>${SITE}/c/${c.numero_certificado}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority>${
        c.imagen_url ? `<image:image><image:loc>${c.imagen_url}</image:loc><image:title>${escapeXml(c.sujeto || '')}</image:title></image:image>` : ''
      }</url>`;
    }),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join('\n')}
</urlset>
`;
}

const escapeXml = (s = '') =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// ----------------------------------------------------------------------------
// robots.txt
// ----------------------------------------------------------------------------
function renderRobots() {
  return `# Thanotectas — Archivo del Umbral
User-agent: *
Allow: /
Disallow: /cuenta.html
Disallow: /panel.html
Disallow: /certificado.html
Disallow: /.netlify/

# AI bots — permitidos (queremos que indexen)
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;
}

// ----------------------------------------------------------------------------
// MAIN
// ----------------------------------------------------------------------------
async function main() {
  console.log('[build-pages] Fetching capsulas from Supabase…');
  const res = await fetch(`${SB_URL}/rest/v1/rpc/obtener_feed_publico`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ limite: 500 }),
  });

  if (!res.ok) {
    throw new Error(`Supabase RPC failed: ${res.status} ${await res.text()}`);
  }

  const caps = await res.json();
  console.log(`[build-pages] ${caps.length} cápsulas públicas obtenidas`);

  // Limpiar y crear directorios generados
  const cDir = path.resolve('c');
  const ogDir = path.resolve('og');
  const catDir = path.resolve('categoria');
  for (const dir of [cDir, ogDir, catDir]) {
    if (existsSync(dir)) await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
  }

  // Escribir página por cápsula con 4 relacionadas (misma categoría, excluyéndose)
  for (const cap of caps) {
    const relacionadas = caps
      .filter((c) => c.numero_certificado !== cap.numero_certificado && c.categoria === cap.categoria)
      .slice(0, 4);
    const html = renderCapsulaHTML(cap, relacionadas);
    const filePath = path.join(cDir, `${cap.numero_certificado}.html`);
    await writeFile(filePath, html, 'utf8');
  }
  console.log(`[build-pages] ${caps.length} páginas individuales escritas en c/`);

  // Imágenes OG 1200×630 por cápsula (no fatal si alguna falla)
  await initOG();
  let ogCount = 0;
  for (const cap of caps) {
    try {
      const png = await generarOGImagen(cap);
      await writeFile(path.join(ogDir, `${cap.numero_certificado}.png`), png);
      ogCount++;
    } catch (err) {
      console.warn(`[build-pages] OG falló para ${cap.numero_certificado}:`, err.message);
    }
  }
  console.log(`[build-pages] ${ogCount} imágenes OG escritas en og/`);

  // Páginas de categoría (solo las que tienen cápsulas)
  const categorias = [...new Set(caps.map((c) => c.categoria).filter((c) => CAT_SEO[c]))];
  for (const slug of categorias) {
    const capsCat = caps.filter((c) => c.categoria === slug);
    await writeFile(path.join(catDir, `${slug}.html`), renderCategoriaHTML(slug, capsCat), 'utf8');
  }
  console.log(`[build-pages] ${categorias.length} páginas de categoría escritas en categoria/`);

  // Sitemap
  await writeFile('sitemap.xml', renderSitemap(caps, categorias), 'utf8');
  console.log('[build-pages] sitemap.xml generado');

  // RSS
  const capsOrdenadas = [...caps].sort(
    (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
  );
  await writeFile('feed.xml', renderRSS(capsOrdenadas), 'utf8');
  console.log('[build-pages] feed.xml generado');

  // Robots
  await writeFile('robots.txt', renderRobots(), 'utf8');
  console.log('[build-pages] robots.txt generado');

  // IndexNow: archivo de verificación + ping (solo en builds de Netlify)
  await writeFile(`${INDEXNOW_KEY}.txt`, INDEXNOW_KEY, 'utf8');
  if (process.env.NETLIFY === 'true') {
    const urlsIndexNow = [
      ...STATIC_PAGES.map((p) => `${SITE}${p.url}`),
      ...categorias.map((s) => `${SITE}/categoria/${s}`),
      ...caps.map((c) => `${SITE}/c/${c.numero_certificado}`),
    ];
    await pingIndexNow(urlsIndexNow);
  } else {
    console.log('[build-pages] IndexNow ping omitido (build local)');
  }

  console.log('[build-pages] ✓ Done');
}

main().catch((err) => {
  console.error('[build-pages] FAILED:', err);
  process.exit(1);
});
