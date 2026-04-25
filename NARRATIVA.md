# Thanotectas — Narrativa Unificada

> Este documento es la brújula del proyecto.
> Cualquier decisión narrativa, de copy, de marketing o de funcionalidad
> debe respetar lo que está aquí escrito.
> Última revisión: 25 de abril 2026.

---

## La frase ancla

> **¿Qué pequeño fragmento de vida salvarías para siempre?**

Esta es la pregunta que define todo el proyecto.
Es lo que aparece en el hero del sitio, en los videos de redes,
en el chatbot, en el primer mensaje del Oráculo, y en cualquier
material de marketing.

---

## Qué es Thanotectas

**Thanotectas es un Archivo del Umbral.**

Un lugar donde nombras lo que el mundo está perdiendo
(especies, ríos, saberes, lugares, sonidos, personas)
y lo conviertes en una **cápsula sellada** con un **certificado permanente**.

- Cifrada
- Inalterable
- Real

Cada cápsula tiene un número correlativo único: `TH-2026-XXXXX`.

---

## Los dos modos de inscribir

Una cápsula puede ser de dos formas — pero **ambas son la misma cosa esencial**:
un acto de memoria contra la pérdida.

### 🌿 Cápsula Viva (presente)

Una memoria que se inscribe HOY y queda visible en el Archivo Colectivo.
Como un grito. Una constancia. Un "yo estuve aquí cuando esto se iba".

**Para qué:**
- Especies que se están extinguiendo
- Ríos que mueren
- Saberes ancestrales en riesgo
- Lugares que desaparecen
- Sonidos del bosque que se apagan

**Tipos disponibles:** Dato científico · Poema · Carta · Obituario · Alerta · Ritual

**Donde se crea:** El Oráculo del Umbral (`/oraculo.html`)

---

### ⏳ Cápsula Sellada (futuro)

Una memoria que se cifra y se mantiene oculta hasta una fecha futura: 2030, 2050, 2100.
Solo se abre cuando llega ese año. Una carta a los que vendrán.

**Para qué:**
- Carta a los que vendrán
- Idea que esperas se haga realidad
- Promesa personal
- Despedida
- Mensaje a alguien que aún no nace

**Donde se crea:** Página de depósito (`/depositar.html`) — *pendiente de construir*

**Estado actual de implementación:**
- ✅ Campos en BD: `es_sellada`, `año_apertura` (agregados 25 abril 2026)
- ⏳ Página `/depositar.html` aún no construida
- ⏳ Cifrado real AES-256 — fase 2

---

## El SVG del logo (oficial)

El logo es un árbol con tres elementos visuales:

1. **Raíces** (parte inferior) en gradiente verde musgo — representan el suelo del Archivo
2. **Tronco/copa** (parte superior) en gradiente dorado — representa la luz que sube
3. **Estrella** en la cima — representa la chispa de memoria

El logo SVG está embebido como código en cada página.
**No usar versiones rasterizadas** salvo en favicons y meta tags og:image.

---

## Voz y tono

- **Reflexiva, no histriónica.** No vendemos urgencia falsa.
- **Literaria, no académica.** Cita de poetas (William Ospina), no de papers.
- **Esperanza activa, no nihilismo.** "Salvarías" es la palabra clave.
- **Honestidad cruda cuando hace falta.** No ocultamos que el mundo se está yendo.
- **No usar "duelo" como única narrativa.** Es uno de los modos, no el único.

### Palabras que SÍ usamos

- Cápsula · Archivo · Umbral · Inscribir · Sellar · Memoria · Permanente · Certificado · Guardián · Honrar · Nombrar · Fragmento

### Palabras que NO usamos

- Eco-anxiety · Eco-grief (en español usamos "duelo ecológico" pero con cuidado)
- Urgent · Action now · Save the planet (cliché de ONG)
- Subscription · Sign up · Get started (suena a SaaS)

---

## Modelo de monetización (acordado)

### Plan Visitante — Gratis
- 3 cápsulas iniciales
- Acceso al Archivo Colectivo (lectura)
- Sin tarjeta, sin registro complicado

### Plan Guardián — $45.000 COP/año
- 20 cápsulas anuales
- Cápsulas públicas en perfil personal
- Certificados PDF descargables
- Bold link: `LNK_CIP1O28TBB`

### Plan Guardián Eterno — $250.000 COP único
- Cápsulas ilimitadas
- Membresía vitalicia
- Perfil destacado
- Cápsulas selladas hasta 2100
- Bold link: `LNK_GGLU1OJQU3`

### Apoyo libre
- Vaki (Latinoamérica): donaciones puntuales
- Ko-fi (Internacional): cafés/donaciones

---

## Lo que NO somos

- ❌ NO somos una red social
- ❌ NO somos una app de notas/journaling
- ❌ NO somos una plataforma de NFTs (aunque los certificados parezcan algo similar)
- ❌ NO somos un servicio de mensajería al futuro estilo "FutureMe"
- ❌ NO somos una ONG ambientalista (aunque colaboraremos con ellas)

---

## El árbol de decisiones cuando dudes

Cuando no sepas si una funcionalidad/copy/feature encaja en Thanotectas,
hazte estas tres preguntas en orden:

1. **¿Esto ayuda a alguien a nombrar lo que el mundo está perdiendo?**
   - Si NO → no encaja
   - Si SÍ → continúa

2. **¿Esto produce una cápsula con certificado permanente?**
   - Si NO → puede ser un servicio adicional pero NO debe estar en el flujo central
   - Si SÍ → continúa

3. **¿Esto respeta los dos modos (Viva o Sellada)?**
   - Si introduce un tercer modo → reconsidera, puede romper la simplicidad
   - Si SÍ → adelante

---

## Roadmap honesto

### Fase 1 — Lanzamiento (en curso)
- ✅ Sitio funcional con auth, oráculo, panel, perfil público
- ✅ Cápsulas Vivas funcionando end-to-end
- ✅ 10 cápsulas públicas seed (creadas por Alejandro)
- ✅ Index.html con narrativa unificada
- ⏳ Hilo X de lanzamiento (martes/miércoles 8-10 PM Bogotá)
- ⏳ Bold webhook activación

### Fase 2 — Cápsulas Selladas
- Página `/depositar.html` con flujo de sellado
- Cifrado real (AES-256 client-side)
- Notificación email cuando se desbloquean
- Página `/archivo.html` pública

### Fase 3 — Viralidad y monetización
- Generador GIF/PNG compartibles
- Outreach a 30 Padrinos colombianos
- Páginas individuales de cápsula `/c/TH-2026-XXXXX` optimizadas

### Fase 4 — Crecimiento
- Constitución legal como ESAL
- Alianzas institucionales
- Versión en inglés/portugués
- Ceremonias en vivo

---

## Decisiones tomadas que no se vuelven a discutir

Estas son decisiones cerradas. Si después de implementar piensas
"deberíamos cambiar X", primero releé esta sección.

1. **El logo es el árbol con estrella dorada.** No cambiar.
2. **La paleta es:** verde bosque + dorado + crema. No agregar morados, azules, etc.
3. **Cormorant Garamond + Manrope + IBM Plex Mono.** No usar Inter ni Roboto.
4. **Números romanos para enumeración** en panel (XIV memorias, IV categorías).
5. **Cápsula tiene certificado con número correlativo permanente.** No quitar.
6. **El Oráculo es la entrada principal.** No mover el botón.
7. **Bold maneja los pagos.** No agregar Stripe/PayPal sin razón fuerte.
