// semillas/insertar.mjs — convierte SEMILLAS-*.md en SQL de inserción.
// Uso: node semillas/insertar.mjs semillas/SEMILLAS-2026-11.md > /tmp/semillas.sql
// No ejecuta nada contra la base: solo genera el SQL para revisión/ejecución.

import { readFileSync } from 'node:fs';

const GUARDIAN_ID = '834f3b0a-fdfa-419e-b680-72c76794f1d9'; // Alejandro Zafra
const CATEGORIAS = ['especies', 'ecosistemas', 'rios', 'sonidos', 'territorios', 'saberes'];
const TIPOS = ['poema', 'dato', 'carta', 'obituario', 'alerta', 'ritual'];

const file = process.argv[2];
if (!file) {
  console.error('Uso: node semillas/insertar.mjs <archivo.md>');
  process.exit(1);
}

const md = readFileSync(file, 'utf8');
const bloques = md.split(/^### /m).slice(1); // todo lo anterior al primer ### es cabecera

const capsulas = [];
for (const bloque of bloques) {
  const lineas = bloque.split('\n');
  const sujeto = lineas[0].replace(/^\d+\.\s*/, '').trim();
  const metaLinea = lineas.find((l) => /^`[^`]+·[^`]+`\s*$/.test(l.trim()));
  if (!metaLinea) {
    console.error(`ERROR: cápsula "${sujeto}" sin línea de categoría·tipo`);
    process.exit(1);
  }
  const [categoria, tipo] = metaLinea.trim().replace(/`/g, '').split('·').map((s) => s.trim());
  if (!CATEGORIAS.includes(categoria)) {
    console.error(`ERROR: categoría inválida "${categoria}" en "${sujeto}"`);
    process.exit(1);
  }
  if (!TIPOS.includes(tipo)) {
    console.error(`ERROR: tipo inválido "${tipo}" en "${sujeto}"`);
    process.exit(1);
  }
  const idx = lineas.indexOf(metaLinea);
  const contenido = lineas.slice(idx + 1).join('\n').trim();
  if (contenido.length < 40) {
    console.error(`ERROR: contenido demasiado corto en "${sujeto}"`);
    process.exit(1);
  }
  capsulas.push({ sujeto, categoria, tipo, contenido });
}

console.error(`${capsulas.length} cápsulas parseadas correctamente.`);

// Dollar-quoting con etiqueta improbable para no escapar comillas
const q = (s) => `$semilla$${s}$semilla$`;

let sql = '-- Generado por semillas/insertar.mjs — revisar antes de ejecutar\n';
for (const c of capsulas) {
  sql += `INSERT INTO capsulas (guardian_id, sujeto, categoria, tipo, contenido, idioma, es_publica, es_sellada)
VALUES ('${GUARDIAN_ID}', ${q(c.sujeto)}, '${c.categoria}', '${c.tipo}', ${q(c.contenido)}, 'es', true, false);\n`;
}
console.log(sql);
