// Genera endcard.png (720x1280) y watermark.png (transparente) con la
// identidad de Thanotectas, usando satori + resvg del propio proyecto.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire('/home/user/thanotectas/package.json');
const satoriMod = await import(require.resolve('satori'));
const satori = typeof satoriMod.default === 'function' ? satoriMod.default : satoriMod.default.default;
const resvgMod = await import(require.resolve('@resvg/resvg-wasm'));
const { initWasm, Resvg } = resvgMod.initWasm ? resvgMod : resvgMod.default;

const base = '/home/user/thanotectas/node_modules';
await initWasm(readFileSync(join(base, '@resvg/resvg-wasm/index_bg.wasm')));
const fonts = [
  {
    name: 'Cormorant Garamond',
    data: readFileSync(join(base, '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-italic.woff')),
    style: 'italic',
    weight: 400,
  },
  { name: 'Jost', data: readFileSync(join(base, '@fontsource/jost/files/jost-latin-300-normal.woff')), style: 'normal', weight: 300 },
  { name: 'Jost', data: readFileSync(join(base, '@fontsource/jost/files/jost-latin-600-normal.woff')), style: 'normal', weight: 600 },
];

// Logo oficial (árbol con estrella) como data-URI, igual al SVG del sitio
const logoSvg = `<svg viewBox="0 0 220 220" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ntg" x1="110" y1="40" x2="110" y2="160" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#f4d989"/><stop offset="100%" stop-color="#d4a547"/></linearGradient>
    <linearGradient id="nrg" x1="110" y1="130" x2="110" y2="200" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#6cc06d"/><stop offset="100%" stop-color="#2d5237"/></linearGradient>
  </defs>
  <line x1="40" y1="132" x2="180" y2="132" stroke="#d4a547" stroke-width="1.2" opacity="0.4"/>
  <path d="M108 132 L108 180 M112 132 L112 180" stroke="url(#nrg)" stroke-width="3.6" stroke-linecap="round"/>
  <path d="M108 148 Q94 158 80 168" stroke="url(#nrg)" stroke-width="2.8" stroke-linecap="round" opacity="0.85"/>
  <path d="M112 148 Q126 158 140 168" stroke="url(#nrg)" stroke-width="2.8" stroke-linecap="round" opacity="0.85"/>
  <path d="M108 132 Q109 110 110 72" stroke="url(#ntg)" stroke-width="5" stroke-linecap="round"/>
  <path d="M110 90 Q92 76 70 66" stroke="url(#ntg)" stroke-width="3" stroke-linecap="round"/>
  <path d="M110 90 Q128 76 150 66" stroke="url(#ntg)" stroke-width="3" stroke-linecap="round"/>
  <circle cx="110" cy="72" r="7" fill="#f4d989" opacity="0.95"/>
  <circle cx="110" cy="72" r="3.5" fill="#fffaee"/>
</svg>`;
const logoUri = 'data:image/svg+xml;base64,' + Buffer.from(logoSvg).toString('base64');

async function render(el, w, h, out) {
  const svg = await satori(el, { width: w, height: h, fonts });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: w } }).render().asPng();
  writeFileSync(out, png);
  console.log('OK', out);
}

const p = (txt, style) => ({ type: 'p', props: { style, children: txt } });

// ── Tarjeta final 720x1280 ──────────────────────────────────
const endcard = {
  type: 'div',
  props: {
    style: {
      width: 720, height: 1280, backgroundColor: '#0d130c',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      paddingLeft: 70, paddingRight: 70,
    },
    children: [
      { type: 'img', props: { src: logoUri, width: 210, height: 210, style: { marginBottom: 10 } } },
      p('T H A N O T E C T A S', { fontFamily: 'Jost', fontWeight: 600, fontSize: 34, letterSpacing: 10, color: '#d4a547', margin: 0, marginBottom: 14 }),
      p('ARCHIVO DEL UMBRAL', { fontFamily: 'Jost', fontWeight: 300, fontSize: 16, letterSpacing: 6, color: '#8A7560', margin: 0, marginBottom: 60 }),
      { type: 'div', props: { style: { width: 110, height: 1, backgroundColor: '#3D2E1E', marginBottom: 60 } } },
      p('¿Qué pequeño fragmento de vida salvarías para siempre?', {
        fontFamily: 'Cormorant Garamond', fontStyle: 'italic', fontWeight: 400, fontSize: 44,
        color: '#F5EDE0', textAlign: 'center', lineHeight: 1.45, margin: 0, marginBottom: 90,
      }),
      p('Inscribe tu memoria', { fontFamily: 'Jost', fontWeight: 300, fontSize: 19, letterSpacing: 4, color: '#8A7560', margin: 0, marginBottom: 16 }),
      p('thanotectas.com', { fontFamily: 'Jost', fontWeight: 600, fontSize: 26, letterSpacing: 4, color: '#f4d989', margin: 0 }),
    ],
  },
};
await render(endcard, 720, 1280, process.argv[2] + '/endcard.png');

// ── Marca de agua (versión brillante, con pastilla de contraste) ──
const logoBrightSvg = logoSvg
  .replace('stop-color="#f4d989"/><stop offset="100%" stop-color="#d4a547"', 'stop-color="#fff3c4"/><stop offset="100%" stop-color="#f4d989"')
  .replace('stop-color="#6cc06d"/><stop offset="100%" stop-color="#2d5237"', 'stop-color="#9ef0a0"/><stop offset="100%" stop-color="#5aa85c"')
  .replace('stroke="#d4a547" stroke-width="1.2" opacity="0.4"', 'stroke="#f4d989" stroke-width="1.4" opacity="0.65"');
const logoBrightUri = 'data:image/svg+xml;base64,' + Buffer.from(logoBrightSvg).toString('base64');

const watermark = {
  type: 'div',
  props: {
    style: { width: 400, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' },
    children: [
      {
        type: 'div',
        props: {
          style: {
            display: 'flex', flexDirection: 'row', alignItems: 'center',
            backgroundColor: 'rgba(10,14,9,0.42)', borderRadius: 999,
            paddingTop: 10, paddingBottom: 10, paddingLeft: 22, paddingRight: 28,
          },
          children: [
            { type: 'img', props: { src: logoBrightUri, width: 66, height: 66, style: { marginRight: 10 } } },
            p('THANOTECTAS', { fontFamily: 'Jost', fontWeight: 600, fontSize: 24, letterSpacing: 6, color: '#ffe9a8', margin: 0 }),
          ],
        },
      },
    ],
  },
};
await render(watermark, 400, 96, process.argv[2] + '/watermark.png');
