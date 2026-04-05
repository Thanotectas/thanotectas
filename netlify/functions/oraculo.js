const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Método no permitido" };
  }

  let sujeto = "", testimonio = "";
  try {
    const body = JSON.parse(event.body);
    sujeto     = (body.sujeto     || "").trim();
    testimonio = (body.testimonio || "").trim();
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Body JSON inválido" }) };
  }

  if (!sujeto) {
    return { statusCode: 400, body: JSON.stringify({ error: 'El campo "sujeto" es obligatorio' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "GEMINI_API_KEY no configurada" }) };
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  // ── 1. POEMA ─────────────────────────────────────────
  let poema = "";
  try {
    const modelText = genAI.getGenerativeModel({
      model: "gemini-1.5-flash-latest",
      systemInstruction: `Eres el Oráculo del Umbral de Thanotectas — Guardianes del Umbral.
Escribes inscripciones poéticas de cápsulas del tiempo para honrar lo que la Tierra está perdiendo.
Usa primera persona plural (nosotros, los que quedamos).
La voz es colectiva, del futuro, que recuerda con serenidad y amor ecológico profundo.
Máximo 60 palabras. Tono: místico, solemne, melancólico. Español elegante de Colombia.
Cierra con un verso corto en latín, quechua o lengua indígena colombiana.
Sin asteriscos, sin comillas, sin markdown.`
    });

    const resultado = await modelText.generateContent(
      `Inscribe en el umbral: ${sujeto}. ${testimonio ? `Testimonio del guardián: ${testimonio}` : ""}`
    );
    poema = resultado.response.text().trim();

  } catch (err) {
    console.error("[Oráculo] Error generando poema:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }

  // ── 2. IMAGEN ────────────────────────────────────────
  // Intento separado — si falla, el poema igual se entrega
  let imagen = "";
  try {
    const modelImage = genAI.getGenerativeModel({
      model: "imagen-3.0-generate-002"
    });

    const resultImage = await modelImage.generateImages({
      prompt: `Una visión artística, oscura y etérea de "${sujeto}" emergiendo de neblina mística. 
               Estilo Thanotectas, colores ocre y musgo oscuro, cinematográfico, sagrado, 
               sin texto, sin personas, fotorrealista.`,
      numberOfImages: 1,
      aspectRatio: "16:9",
    });

    const bytes = resultImage.images?.[0]?.imageBytes;
    if (bytes) imagen = `data:image/png;base64,${bytes}`;

  } catch (imgErr) {
    console.warn("[Oráculo] Imagen no generada:", imgErr.message);
    // No interrumpe — imagen queda vacía string
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ poema, imagen }),
  };
};
