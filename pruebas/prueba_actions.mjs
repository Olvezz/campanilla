// Abre las páginas públicas de login con un Chromium normal y anota qué pasa.
// No usa credenciales ni intenta superar desafíos: solo observa.
import { chromium } from "playwright";
import { appendFileSync, mkdirSync } from "node:fs";

const paginas = [
  ["ITLA", "https://aulavirtual.itla.edu.do/login/index.php"],
  ["UASD portal", "https://app.uasd.edu.do/UASDVirtualGateway/Default.aspx"],
  ["UASD Ciencias", "https://ciencias.uasd.edu.do/login/index.php"],
];

mkdirSync("capturas", { recursive: true });
const resumen = [
  `Corrida: ${new Date().toISOString()}`,
  "",
  "| Sitio | HTTP | Título | Resultado |",
  "|---|---|---|---|",
];

const navegador = await chromium.launch({ headless: false });
const contexto = await navegador.newContext({ locale: "es-DO" });

for (const [nombre, url] of paginas) {
  const pagina = await contexto.newPage();
  let estado = "sin respuesta";
  try {
    const r = await pagina.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    estado = r ? r.status() : estado;
  } catch (e) {
    estado = `error: ${e.message.split("\n")[0]}`;
  }
  // La pantalla de espera de Cloudflare está hecha para resolverse sola: solo esperamos
  // (hasta 60 s) a que el título deje de ser el de la pantalla de espera.
  const espera = /just a moment|un momento|attention required/i;
  const inicio = Date.now();
  while (Date.now() - inicio < 60000) {
    const t = await pagina.title().catch(() => "");
    if (t && !espera.test(t)) break;
    await pagina.waitForTimeout(2000);
  }
  const segundos = Math.round((Date.now() - inicio) / 1000);
  const titulo = await pagina.title().catch(() => "");
  const bloqueada = espera.test(titulo);
  const hayCampos = (await pagina.locator("input[type=password]").count().catch(() => 0)) > 0;
  const resultado = hayCampos
    ? `Llega al formulario de login (esperó ${segundos} s)`
    : bloqueada
      ? "Bloqueada por Cloudflare tras 60 s"
      : `Otro (ver captura, esperó ${segundos} s)`;
  resumen.push(`| ${nombre} | ${estado} | ${titulo || "-"} | ${resultado} |`);
  // La captura es solo de apoyo: si falla, no debe tumbar la prueba.
  await pagina.screenshot({ path: `capturas/${nombre.replace(/\s+/g, "-")}.png` }).catch(() => {});
  await pagina.close().catch(() => {});
}

await navegador.close();
const texto = resumen.join("\n");
console.log(texto);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, texto + "\n");
