exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const body = JSON.parse(event.body);
    const sujeto    = (body.sujeto    || "").trim();
    const testimonio= (body.testimonio|| "").trim();
    const categoria = body.categoria  || "especies";
    const idioma    = body.idioma     || "es";
    const API_KEY   = process.env.GEMINI_API_KEY;

    if (!sujeto) {
      return { statusCode: 400, body: JSON.stringify({ error: "Campo sujeto requerido" }) };
    }

    // ── Instrucciones por categoría e idioma ─────────────
    const instrucciones = {
      es: {
        especies:    "Escribe sobre una especie animal o vegetal que se extingue. Describe con precisión sensorial su textura, sonido y movimiento. Menciona lo que el ecosistema pierde cuando ya no esté.",
        ecosistemas: "Escribe sobre un ecosistema que desaparece: selva, páramo, sabana, manglar o humedal. Describe sus capas, ritmos y silencio específico. Lo que no puede existir sin él.",
        rios:        "Escribe sobre un río, lago, glaciar o cuerpo de agua que se pierde. Incluye el sonido del agua, la temperatura, los seres que dependían de él y el silencio que deja.",
        sonidos:     "Escribe sobre un sonido, aroma o fenómeno sensorial de la naturaleza que desaparece: el canto de un pájaro extinto, el olor de un bosque quemado, la niebla de un páramo seco.",
        territorios: "Escribe sobre un territorio, paisaje o lugar sagrado que se pierde: una montaña, una llanura, un bosque ancestral. Su geografía específica, su cielo, su suelo, su historia.",
        saberes:     "Escribe sobre un saber ancestral, una planta medicinal, una tradición o lengua indígena que desaparece. Lo que se lleva consigo cuando el último portador muere."
      },
      en: {
        especies:    "Write about an animal or plant species going extinct. Use precise sensory detail: texture, sound, movement. Mention what the ecosystem loses when it is gone.",
        ecosistemas: "Write about a disappearing ecosystem: rainforest, moorland, savanna, mangrove or wetland. Describe its layers, rhythms and specific silence. What cannot exist without it.",
        rios:        "Write about a river, lake, glacier or body of water that is disappearing. Include the sound of water, the temperature, the creatures that depended on it and the silence it leaves.",
        sonidos:     "Write about a disappearing natural sound, aroma or sensory phenomenon: the song of an extinct bird, the smell of a burned forest, the mist of a dry moor.",
        territorios: "Write about a territory, landscape or sacred place being lost: a mountain, a plain, an ancestral forest. Its specific geography, its sky, its soil, its history.",
        saberes:     "Write about ancestral knowledge, a medicinal plant, a tradition or indigenous language disappearing. What it takes with it when the last keeper dies."
      },
      pt: {
        especies:    "Escreva sobre uma especie animal ou vegetal que se extingue. Use detalhes sensoriais precisos: textura, som, movimento. Mencione o que o ecossistema perde quando ela desaparece.",
        ecosistemas: "Escreva sobre um ecossistema que desaparece: floresta, campo, savana, manguezal ou pantano. Descreva suas camadas, ritmos e silencio especifico. O que nao pode existir sem ele.",
        rios:        "Escreva sobre um rio, lago, glaciar ou corpo dagua que esta desaparecendo. Inclua o som da agua, a temperatura, os seres que dependiam dele e o silencio que deixa.",
        sonidos:     "Escreva sobre um som, aroma ou fenomeno sensorial da natureza que desaparece: o canto de um passaro extinto, o cheiro de uma floresta queimada, a nevoa de um campo seco.",
        territorios: "Escreva sobre um territorio, paisagem ou lugar sagrado que se perde: uma montanha, uma planicie, uma floresta ancestral. Sua geografia especifica, seu ceu, seu solo, sua historia.",
        saberes:     "Escreva sobre um saber ancestral, uma planta medicinal, uma tradicao ou lingua indigena que desaparece. O que leva consigo quando o ultimo portador morre."
      },
      fr: {
        especies:    "Ecrivez sur une espece animale ou vegetale en voie d extinction. Utilisez des details sensoriels precis: texture, son, mouvement. Mentionnez ce que l ecosysteme perd quand elle disparait.",
        ecosistemas: "Ecrivez sur un ecosysteme qui disparait: foret tropicale, lande, savane, mangrove ou zone humide. Decrivez ses couches, ses rythmes et son silence specifique. Ce qui ne peut exister sans lui.",
        rios:        "Ecrivez sur une riviere, un lac, un glacier ou un plan d eau qui disparait. Incluez le son de l eau, la temperature, les etres qui en dependaient et le silence qu il laisse.",
        sonidos:     "Ecrivez sur un son, un arome ou un phenomene sensoriel naturel qui disparait: le chant d un oiseau disparu, l odeur d une foret brulee, la brume d une lande asechee.",
        territorios: "Ecrivez sur un territoire, un paysage ou un lieu sacre qui se perd: une montagne, une plaine, une foret ancestrale. Sa geographie specifique, son ciel, son sol, son histoire.",
        saberes:     "Ecrivez sur un savoir ancestral, une plante medicinale, une tradition ou une langue indigene qui disparait. Ce qu il emporte avec lui quand le dernier porteur meurt."
      }
    };

    const langInstr  = instrucciones[idioma] || instrucciones.es;
    const catInstr   = langInstr[categoria]  || langInstr.especies;

    // ── Prompts por idioma ────────────────────────────────
    const prompts = {
      es: "Eres el Oraculo del Umbral de Thanotectas. " + catInstr + " Sobre: " + sujeto + (testimonio ? ". Testimonio: " + testimonio : "") + ". Escribe 10 a 14 lineas de verso libre, primera persona plural (nosotros, los que quedamos), tono solemne y melancolico. Incluye un detalle sensorial muy especifico. Cierra con un verso corto en latin, quechua, wayuunaiki, nahuatl o la lengua indigena mas cercana al territorio mencionado. Sin asteriscos, sin comillas, sin markdown.",
      en: "You are the Oracle of the Threshold of Thanotectas. " + catInstr + " Subject: " + sujeto + (testimonio ? ". Testimony: " + testimonio : "") + ". Write 10 to 14 lines of free verse, first person plural (we, those who remain), solemn and melancholic tone. Include a very specific sensory detail. Close with a short verse in Latin, Quechua, Nahuatl or the indigenous language closest to the mentioned territory. No asterisks, no quotes, no markdown.",
      pt: "Voce e o Oraculo do Umbral de Thanotectas. " + catInstr + " Sobre: " + sujeto + (testimonio ? ". Testemunho: " + testimonio : "") + ". Escreva 10 a 14 linhas de verso livre, primeira pessoa do plural (nos, os que ficamos), tom solemne e melancolico. Inclua um detalhe sensorial muito especifico. Feche com um verso curto em latim, quechua, guarani ou a lingua indigena mais proxima do territorio mencionado. Sem asteriscos, sem aspas, sem markdown.",
      fr: "Vous etes l Oracle du Seuil de Thanotectas. " + catInstr + " Sujet: " + sujeto + (testimonio ? ". Temoignage: " + testimonio : "") + ". Ecrivez 10 a 14 lignes de vers libres, premiere personne du pluriel (nous, ceux qui restent), ton solennel et melancolique. Incluez un detail sensoriel tres specifique. Terminez par un vers court en latin, quechua ou la langue indigene la plus proche du territoire mentionne. Sans asterisques, sans guillemets, sans markdown."
    };

    const prompt = prompts[idioma] || prompts.es;

    // ── Llamada a Gemini ──────────────────────────────────
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + API_KEY,
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
      const errText = await res.text();
      throw new Error("Gemini " + res.status + ": " + errText);
    }

    const data  = await res.json();
    const poema = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) ? data.candidates[0].content.parts[0].text.trim() : "";

    if (!poema) throw new Error("Respuesta vacia de Gemini");

    // ── Imagen Unsplash por categoría ─────────────────────
    const queryMap = {
      especies:    "endangered wildlife animal nature dark",
      ecosistemas: "rainforest ecosystem jungle misty dark",
      rios:        "river glacier water landscape dark moody",
      sonidos:     "misty forest nature silence dark",
      territorios: "mountain landscape wilderness dark moody",
      saberes:     "indigenous ritual fire forest dark"
    };
    const q = encodeURIComponent((queryMap[categoria] || sujeto) + " melancholic");
    const imagen = "https://source.unsplash.com/800x450/?" + q + "&sig=" + Date.now();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ poema: poema, imagen: imagen })
    };

  } catch (error) {
    console.error("[Oraculo]", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
