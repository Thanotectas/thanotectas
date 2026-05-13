// netlify/functions/lib/render-capsula.mjs
//
// Convierte una cápsula a PNG (1080x1350, formato Instagram 4:5).
// Usa Satori para renderizar JSX→SVG y Resvg para SVG→PNG.
//
// Visual: replica el diseño Thanotectas de Canva (plantilla #3).
// Estética: placa conmemorativa oscura, serif elegante,
// detalles ornamentales mínimos en oro apagado.
//
// Fuentes: se cargan de jsDelivr en frío y se cachean en memoria
// del runtime (subsecuentes invocaciones reutilizan).

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

// ────────────────────────────────────────────────────────────
// Paleta Thanotectas (sincronizada con sitio web)
// ────────────────────────────────────────────────────────────
const COLORS = {
  bg: "#0d130c",
  bgGradient: "#141a13",
  cream: "#e8e2d0",
  sage: "#a8b598",
  sageMuted: "#7a8a6b",
  gold: "#c9a96e",
  goldDim: "#8a7549",
};

// ────────────────────────────────────────────────────────────
// Cache de fuentes (módulo-scope: persiste entre invocaciones tibias)
// ────────────────────────────────────────────────────────────
let fontsCache = null;

async function cargarFuentes() {
  if (fontsCache) return fontsCache;

  // Cormorant Garamond para el cuerpo (serif elegante con personalidad)
  // Inter Tight para metadatos (sans condensado moderno)
  const urls = {
    cormorantRegular:
      "https://cdn.jsdelivr.net/fontsource/fonts/cormorant-garamond@latest/latin-400-normal.ttf",
    cormorantItalic:
      "https://cdn.jsdelivr.net/fontsource/fonts/cormorant-garamond@latest/latin-400-italic.ttf",
    cormorantMedium:
      "https://cdn.jsdelivr.net/fontsource/fonts/cormorant-garamond@latest/latin-500-normal.ttf",
    interLight:
      "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-300-normal.ttf",
  };

  const buffers = await Promise.all(
    Object.values(urls).map(async (u) => {
      const r = await fetch(u);
      if (!r.ok) throw new Error(`No pude cargar fuente: ${u} (${r.status})`);
      return r.arrayBuffer();
    }),
  );

  fontsCache = [
    { name: "Cormorant", data: buffers[0], weight: 400, style: "normal" },
    { name: "Cormorant", data: buffers[1], weight: 400, style: "italic" },
    { name: "Cormorant", data: buffers[2], weight: 500, style: "normal" },
    { name: "Inter", data: buffers[3], weight: 300, style: "normal" },
  ];

  return fontsCache;
}

// ────────────────────────────────────────────────────────────
// Render principal
// ────────────────────────────────────────────────────────────
export async function renderCapsula({
  numero,
  categoria,
  tipo,
  texto,
  sujeto,
  año,
}) {
  const fonts = await cargarFuentes();

  // Recortar texto largo (Satori es algo lento con párrafos enormes)
  const textoLimpio = (texto || "").trim();
  const textoMostrado = textoLimpio.length > 400
    ? textoLimpio.slice(0, 397) + "…"
    : textoLimpio;

  // Tamaño dinámico de fuente según largo del texto
  const fuenteCuerpo = textoMostrado.length > 280 ? 38 : textoMostrado.length > 180 ? 44 : 52;

  const etiquetaCategoria = [categoria, tipo].filter(Boolean).join(" · ");

  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          width: "1080px",
          height: "1350px",
          display: "flex",
          flexDirection: "column",
          backgroundColor: COLORS.bg,
          backgroundImage:
            `radial-gradient(ellipse at 50% 40%, ${COLORS.bgGradient} 0%, ${COLORS.bg} 70%)`,
          padding: "100px 90px",
          fontFamily: "Cormorant",
          position: "relative",
        },
        children: [
          // Encabezado: número + línea ornamental
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                marginTop: "20px",
              },
              children: [
                {
                  type: "div",
                  props: {
                    style: {
                      fontFamily: "Inter",
                      fontSize: "22px",
                      letterSpacing: "0.32em",
                      color: COLORS.sage,
                      textTransform: "uppercase",
                    },
                    children: numero,
                  },
                },
                {
                  type: "div",
                  props: {
                    style: {
                      width: "60px",
                      height: "1px",
                      backgroundColor: COLORS.goldDim,
                      marginTop: "28px",
                    },
                  },
                },
              ],
            },
          },

          // Categoría · Tipo
          {
            type: "div",
            props: {
              style: {
                fontFamily: "Inter",
                fontSize: "20px",
                letterSpacing: "0.4em",
                color: COLORS.gold,
                textTransform: "uppercase",
                textAlign: "center",
                marginTop: "32px",
              },
              children: etiquetaCategoria || "ARCHIVO",
            },
          },

          // Texto principal
          {
            type: "div",
            props: {
              style: {
                flex: "1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "60px 20px 40px",
              },
              children: {
                type: "div",
                props: {
                  style: {
                    fontFamily: "Cormorant",
                    fontWeight: 400,
                    fontSize: `${fuenteCuerpo}px`,
                    lineHeight: 1.45,
                    color: COLORS.cream,
                    textAlign: "center",
                    fontStyle: "normal",
                  },
                  children: `«${textoMostrado}»`,
                },
              },
            },
          },

          // Atribución
          {
            type: "div",
            props: {
              style: {
                fontFamily: "Cormorant",
                fontStyle: "italic",
                fontSize: "26px",
                color: COLORS.sage,
                textAlign: "center",
                marginBottom: "60px",
              },
              children: `— ${sujeto} · ${año}`,
            },
          },

          // Ornamento decorativo (constelación de 3 puntos)
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                justifyContent: "center",
                gap: "16px",
                marginBottom: "44px",
              },
              children: [0, 1, 2].map((i) => ({
                type: "div",
                props: {
                  style: {
                    width: i === 1 ? "6px" : "4px",
                    height: i === 1 ? "6px" : "4px",
                    backgroundColor: COLORS.gold,
                    borderRadius: "50%",
                    opacity: 0.7,
                  },
                },
              })),
            },
          },

          // Pie: wordmark
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "10px",
              },
              children: [
                {
                  type: "div",
                  props: {
                    style: {
                      fontFamily: "Inter",
                      fontSize: "20px",
                      letterSpacing: "0.5em",
                      color: COLORS.cream,
                      textTransform: "uppercase",
                    },
                    children: "Thanotectas",
                  },
                },
                {
                  type: "div",
                  props: {
                    style: {
                      fontFamily: "Cormorant",
                      fontStyle: "italic",
                      fontSize: "18px",
                      color: COLORS.sageMuted,
                      letterSpacing: "0.08em",
                    },
                    children: "Archivo del Umbral · Colombia",
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      width: 1080,
      height: 1350,
      fonts,
    },
  );

  // SVG → PNG
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1080 },
    background: COLORS.bg,
  });
  const pngData = resvg.render();
  return pngData.asPng();
}
