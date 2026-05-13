// netlify/functions/lib/post-threads.mjs
//
// Postea a Threads vía Meta Threads API.
// Estructura idéntica a Instagram pero distinto host (graph.threads.net).
//
// Pre-requisitos (ver META-SETUP-instagram-threads.md):
//   - Cuenta Threads activa
//   - App de Meta con permisos: threads_basic, threads_content_publish
//   - Token de larga duración
//   - THREADS_USER_ID = ID numérico de la cuenta Threads

const THREADS_USER_ID = process.env.THREADS_USER_ID;
const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN;
const API_VERSION = "v1.0";
const BASE = `https://graph.threads.net/${API_VERSION}`;

export async function postearThreads(texto, imagenUrl) {
  if (!THREADS_USER_ID || !THREADS_ACCESS_TOKEN) {
    throw new Error(
      "Credenciales Threads faltantes (THREADS_USER_ID / THREADS_ACCESS_TOKEN)",
    );
  }

  // 1) Crear container
  const crearUrl = new URL(`${BASE}/${THREADS_USER_ID}/threads`);
  crearUrl.searchParams.set("media_type", "IMAGE");
  crearUrl.searchParams.set("image_url", imagenUrl);
  crearUrl.searchParams.set("text", texto);
  crearUrl.searchParams.set("access_token", THREADS_ACCESS_TOKEN);

  const crearRes = await fetch(crearUrl.toString(), { method: "POST" });
  const crearData = await crearRes.json();

  if (!crearRes.ok || !crearData.id) {
    throw new Error(
      `Threads container falló: ${crearRes.status} ${JSON.stringify(crearData)}`,
    );
  }

  const creationId = crearData.id;

  // Threads recomienda esperar ~30s antes de publicar para containers
  // con media. Para PNG pequeño desde CDN es generalmente menos.
  await new Promise((r) => setTimeout(r, 5000));

  // 2) Publicar
  const pubUrl = new URL(`${BASE}/${THREADS_USER_ID}/threads_publish`);
  pubUrl.searchParams.set("creation_id", creationId);
  pubUrl.searchParams.set("access_token", THREADS_ACCESS_TOKEN);

  const pubRes = await fetch(pubUrl.toString(), { method: "POST" });
  const pubData = await pubRes.json();

  if (!pubRes.ok || !pubData.id) {
    throw new Error(
      `Threads publish falló: ${pubRes.status} ${JSON.stringify(pubData)}`,
    );
  }

  return {
    media_id: pubData.id,
    creation_id: creationId,
  };
}
