// netlify/functions/lib/post-x.mjs
//
// Postea un tweet con imagen usando OAuth 1.0a.
// Requiere las 4 credenciales (consumer + access).
//
// Si ya tienes un módulo de posteo a X en tu pipeline actual,
// puedes reemplazar este import en capsula-diaria con el tuyo;
// solo asegúrate que acepte (texto, imagenUrl) y devuelva un objeto.

import { TwitterApi } from "twitter-api-v2";

const X_API_KEY = process.env.X_API_KEY;
const X_API_SECRET = process.env.X_API_SECRET;
const X_ACCESS_TOKEN = process.env.X_ACCESS_TOKEN;
const X_ACCESS_SECRET = process.env.X_ACCESS_SECRET;

export async function postearX(texto, imagenUrl) {
  if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_SECRET) {
    throw new Error("Credenciales X faltantes");
  }

  const client = new TwitterApi({
    appKey: X_API_KEY,
    appSecret: X_API_SECRET,
    accessToken: X_ACCESS_TOKEN,
    accessSecret: X_ACCESS_SECRET,
  });

  // 1) Descargar la imagen
  const imgRes = await fetch(imagenUrl);
  if (!imgRes.ok) {
    throw new Error(`No pude descargar la imagen: ${imgRes.status}`);
  }
  const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

  // 2) Subir media (v1.1 endpoint)
  const mediaId = await client.v1.uploadMedia(imgBuffer, {
    mimeType: "image/png",
  });

  // 3) Publicar tweet con media
  const tweet = await client.v2.tweet({
    text: texto,
    media: { media_ids: [mediaId] },
  });

  return {
    id: tweet.data.id,
    url: `https://x.com/thanotectas/status/${tweet.data.id}`,
  };
}
