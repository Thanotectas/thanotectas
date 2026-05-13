// netlify/functions/lib/post-instagram.mjs
//
// Postea a Instagram vía Meta Graph API.
// Flujo de 2 pasos requerido por la API:
//   1. Crear "container" con la imagen y caption → retorna creation_id
//   2. Publicar el container → retorna media_id
//
// Pre-requisitos (ver META-SETUP-instagram-threads.md):
//   - Cuenta IG Business/Creator vinculada a Página FB
//   - App de Meta con permisos: instagram_basic, instagram_content_publish,
//     pages_show_list, pages_read_engagement
//   - Token de acceso de larga duración (60 días, renovable)
//   - IG_USER_ID = el ID numérico de la cuenta IG Business
//
// Límite: 25 publicaciones por cuenta IG por rolling 24h.

const IG_USER_ID = process.env.IG_USER_ID;
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
const API_VERSION = "v21.0";
const BASE = `https://graph.facebook.com/${API_VERSION}`;

export async function postearInstagram(caption, imagenUrl) {
  if (!IG_USER_ID || !IG_ACCESS_TOKEN) {
    throw new Error("Credenciales Instagram faltantes (IG_USER_ID / IG_ACCESS_TOKEN)");
  }

  // 1) Crear container con la imagen
  const crearUrl = new URL(`${BASE}/${IG_USER_ID}/media`);
  crearUrl.searchParams.set("image_url", imagenUrl);
  crearUrl.searchParams.set("caption", caption);
  crearUrl.searchParams.set("access_token", IG_ACCESS_TOKEN);

  const crearRes = await fetch(crearUrl.toString(), { method: "POST" });
  const crearData = await crearRes.json();

  if (!crearRes.ok || !crearData.id) {
    throw new Error(
      `IG container falló: ${crearRes.status} ${JSON.stringify(crearData)}`,
    );
  }

  const creationId = crearData.id;

  // 2) Esperar un momento (Meta procesa el container asincrónicamente
  //    en imágenes grandes/lentas; en general no es necesario para PNG
  //    de Storage, pero damos margen)
  await new Promise((r) => setTimeout(r, 1500));

  // 3) Publicar el container
  const pubUrl = new URL(`${BASE}/${IG_USER_ID}/media_publish`);
  pubUrl.searchParams.set("creation_id", creationId);
  pubUrl.searchParams.set("access_token", IG_ACCESS_TOKEN);

  const pubRes = await fetch(pubUrl.toString(), { method: "POST" });
  const pubData = await pubRes.json();

  if (!pubRes.ok || !pubData.id) {
    throw new Error(
      `IG publish falló: ${pubRes.status} ${JSON.stringify(pubData)}`,
    );
  }

  return {
    media_id: pubData.id,
    creation_id: creationId,
    url: `https://www.instagram.com/p/${pubData.id}`, // best-effort
  };
}
