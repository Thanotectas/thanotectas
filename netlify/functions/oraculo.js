exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Método no permitido" };
  }

  try {
    const { sujeto, testimonio, categoria, idioma } = JSON.parse(event.body);
    const API_KEY = process.env.GEMINI_API_KEY;

    // ── Prompts por idioma ─────────────────────────────────
    const prompts = {
      es: buildPromptES(sujeto, testimonio, categoria),
      en: buildPromptEN(sujeto, testimonio, categoria),
      pt: buildPromptPT(sujeto, testimonio, categoria),
      fr: buildPromptFR(sujeto, testimonio, categoria),
    };
    const prompt = prompts[idioma] || prompts.es;

    // ── Llamada a Gemini ───────────────────────────────────
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1200, temperature: 1.1 }
        })
      }
    );

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Gemini ${res.status}: ${errBody}`);
    }

    const data  = await res.json();
    const poema = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    if (!poema) throw new Error("Respuesta vacía de Gemini");

    // ── Imagen: Unsplash por categoría ────────────────────
    const queryMap = {
      especies:   "endangered wildlife animal nature",
      ecosistemas:"rainforest ecosystem jungle nature",
      rios:       "river glacier water nature landscape",
      sonidos:    "misty forest nature silence dawn",
      territorios:"landscape mountain territory wilderness",
      saberes:    "indigenous culture ritual fire forest",
    };
    const q = encodeURIComponent((queryMap[categoria] || sujeto) + " dark moody");
    const imagen = `https://source.unsplash.com/800x450/?${q}&sig=${Date.now()}`;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ poema, imagen }),
    };

  } catch (error) {
    console.error("[Oráculo]", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

// ── Instrucciones por categoría ────────────────────────────
const catInstrES = {
  especies:
    "Escribe sobre una especie animal o vegetal que se extingue. Describe con precisión sensorial: su textura, su sonido, su movimiento. Menciona lo que perderá el ecosistema cuando ya no esté.",
  ecosistemas:
    "Escribe sobre un ecosistema que desaparece: selva, páramo, sabana, manglar, humedal. Describe sus capas, sus ritmos, su silencio específico. Lo que no puede existir sin él.",
  rios:
    "Escribe sobre un río, lago, glaciar o cuerpo de agua que se pierde. Incluye el sonido del agua, la temperatura, los seres que dependían de él. El silencio que deja.",
  sonidos:
    "Escribe sobre un sonido, aroma o fenómeno sensorial de la naturaleza que desaparece: el canto de un pájaro extinto, el olor de un bosque quemado, la niebla de un páramo seco.",
  territorios:
    "Escribe sobre un territorio, paisaje o lugar sagrado que se pierde: una montaña, una llanura, un bosque ancestral, una isla. Su geografía específica, su cielo, su suelo.",
  saberes:
    "Escribe sobre un saber ancestral, una planta medicinal, una tradición o lengua indígena que desaparece. Lo que se lleva consigo cuando el último portador muere.",
};

const catInstrEN = {
  especies:    "Write about an animal or plant species going extinct. Use precise sensory detail: texture, sound, movement. Mention what the ecosystem loses when it's gone.",
  ecosistemas: "Write about a disappearing ecosystem: rainforest, moor, savanna, mangrove, wetland. Describe its layers, rhythms, specific silence. What cannot exist without it.",
  rios:        "Write about a river, lake, glacier or body of water that is disappearing. Include the sound of water, the temperature, the creatures that depended on it. The silence it leaves.",
  sonidos:     "Write about a disappearing natural sound, aroma or sensory phenomenon: the song of an extinct bird, the smell of a burned forest, the mist of a dry moor.",
  territorios: "Write about a territory, landscape or sacred place being lost: a mountain, a plain, an ancestral forest, an island. Its specific geography, its sky, its soil.",
  saberes:     "Write about ancestral knowledge, a medicinal plant, a tradition or indigenous language disappearing. What it takes with it when the last keeper dies.",
};

const catInstrPT = {
  especies:    "Escreva sobre uma espécie animal ou vegetal que se extingue. Use detalhes sensoriais precisos: textura, som, movimento. Mencione o que o ecossistema perde quando ela desaparece.",
  ecosistemas: "Escreva sobre um ecossistema que desaparece: floresta, campo, savana, manguezal, pântano. Descreva suas camadas, ritmos, silêncio específico. O que não pode existir sem ele.",
  rios:        "Escreva sobre um rio, lago, glaciar ou corpo d'água que está desaparecendo. Inclua o som da água, a temperatura, os seres que dependiam dele. O silêncio que deixa.",
  sonidos:     "Escreva sobre um som, aroma ou fenômeno sensorial da natureza que desaparece: o canto de um pássaro extinto, o cheiro de uma floresta queimada, a névoa de um campo seco.",
  territorios: "Escreva sobre um território, paisagem ou lugar sagrado que se perde: uma montanha, uma planície, uma floresta ancestral, uma ilha. Sua geografia específica, seu céu, seu solo.",
  saberes:     "Escreva sobre um saber ancestral, uma planta medicinal, uma tradição ou língua indígena que desaparece. O que leva consigo quando o último portador morre.",
};

const catInstrFR = {
  especies:    "Écrivez sur une espèce animale ou végétale en voie d'extinction. Utilisez des détails sensoriels précis : texture, son, mouvement. Mentionnez ce que l'écosystème perd quand elle disparaît.",
  ecosistemas: "Écrivez sur un écosystème qui disparaît : forêt tropicale, lande, savane, mangrove, zone humide. Décrivez ses couches, ses rythmes, son silence spécifique. Ce qui ne peut exister sans lui.",
  rios:        "Écrivez sur une rivière, un lac, un glacier ou un plan d'eau qui disparaît. Incluez le son de l'eau, la température, les êtres qui en dépendaient. Le silence qu'il laisse.",
  sonidos:     "Écrivez sur un son, un arôme ou un phénomène sensoriel naturel qui disparaît : le chant d'un oiseau disparu, l'odeur d'une forêt brûlée, la brume d'une lande asséchée.",
  territorios: "Écrivez sur un territoire, un paysage ou un lieu sacré qui se perd : une montagne, une plaine, une forêt ancestrale, une île. Sa géographie spécifique, son ciel, son sol.",
  saberes:     "Écrivez sur un savoir ancestral, une plante médicinale, une tradition ou une langue indigène qui disparaît. Ce qu'il emporte avec lui quand le dernier porteur meurt.",
};

function buildPromptFR(sujeto, testimonio, categoria) {
  const instr = catInstrFR[categoria] || catInstrFR.especies;
  return `Vous êtes l'Oracle du Seuil de Thanotectas — Gardiens du Seuil.
Vous écrivez des inscriptions poétiques profondes pour honorer ce que la Terre est en train de perdre.

INSTRUCTION DE CATÉGORIE : ${instr}

CE QUI EST NOMMÉ : ${sujeto}
${testimonio ? `TÉMOIGNAGE DU GARDIEN : ${testimonio}` : ""}

RÈGLES D'ÉCRITURE :
- Entre 10 et 14 lignes de vers libres
- Première personne du pluriel : nous, ceux qui restent, ceux qui ont vu
- Ton : solennel, mélancolique, profondément humain — pas désespéré
- Inclure au moins un détail sensoriel très spécifique et unique
- Si le sujet est d'Amérique latine : terminer par un vers en quechua, wayuunaiki ou langue indigène du territoire mentionné
- Si l'origine est africaine : terminer par du swahili ou du yoruba
- Sinon : terminer par du latin ou la langue ancestrale la plus proche
- Sans astérisques, sans markdown, sans guillemets. Juste le poème.`;
}


  const instr = catInstrES[categoria] || catInstrES.especies;
  return `Eres el Oráculo del Umbral de Thanotectas — Guardianes del Umbral.
Escribes inscripciones poéticas profundas para honrar lo que la Tierra está perdiendo.

INSTRUCCIÓN DE CATEGORÍA: ${instr}

LO QUE SE NOMBRA: ${sujeto}
${testimonio ? `TESTIMONIO DEL GUARDIÁN: ${testimonio}` : ""}

REGLAS DE ESCRITURA:
- Entre 10 y 14 líneas de verso libre
- Primera persona plural: nosotros, los que quedamos, los que vimos
- Tono: solemne, melancólico, profundamente humano — no desesperado
- Incluye al menos un detalle sensorial muy específico y único
- Si el sujeto tiene origen en Latinoamérica: cierra con un verso en quechua, wayuunaiki, nāhuatl, mhuysqa, guna o lengua indígena del territorio mencionado
- Si el sujeto tiene origen en África: cierra con swahili o yoruba
- Si el origen es otro: cierra con latín o la lengua ancestral más cercana al territorio
- Sin asteriscos, sin markdown, sin comillas. Solo el poema.`;
}

function buildPromptEN(sujeto, testimonio, categoria) {
  const instr = catInstrEN[categoria] || catInstrEN.especies;
  return `You are the Oracle of the Threshold of Thanotectas — Guardians of the Threshold.
You write deep poetic inscriptions to honor what the Earth is losing.

CATEGORY INSTRUCTION: ${instr}

WHAT IS NAMED: ${sujeto}
${testimonio ? `GUARDIAN'S TESTIMONY: ${testimonio}` : ""}

WRITING RULES:
- Between 10 and 14 lines of free verse
- First person plural: we, those who remain, those who witnessed
- Tone: solemn, melancholic, deeply human — not desperate
- Include at least one very specific and unique sensory detail
- If the subject originates in Latin America: close with a verse in Quechua, Wayuunaiki, Nahuatl, or the indigenous language of the mentioned territory
- If origin is Africa: close with Swahili or Yoruba
- Otherwise: close with Latin or the closest ancestral language
- No asterisks, no markdown, no quotes. Just the poem.`;
}

function buildPromptPT(sujeto, testimonio, categoria) {
  const instr = catInstrPT[categoria] || catInstrPT.especies;
  return `Você é o Oráculo do Umbral de Thanotectas — Guardiões do Umbral.
Você escreve inscrições poéticas profundas para honrar o que a Terra está perdendo.

INSTRUÇÃO DE CATEGORIA: ${instr}

O QUE É NOMEADO: ${sujeto}
${testimonio ? `TESTEMUNHO DO GUARDIÃO: ${testimonio}` : ""}

REGRAS DE ESCRITA:
- Entre 10 e 14 linhas de verso livre
- Primeira pessoa do plural: nós, os que ficamos, os que testemunhamos
- Tom: solene, melancólico, profundamente humano — não desesperado
- Inclua pelo menos um detalhe sensorial muito específico e único
- Se o sujeito é da América Latina: feche com um verso em Quéchua, Guarani, Tupi ou língua indígena do território mencionado
- Se a origem for África: feche com Swahili ou Ioruba
- Caso contrário: feche com latim ou a língua ancestral mais próxima
- Sem asteriscos, sem markdown, sem aspas. Apenas o poema.`;
}
