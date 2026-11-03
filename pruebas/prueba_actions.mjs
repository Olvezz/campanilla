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
const resumen = ["| Sitio | HTTP | Título | Resultado |", "|---|---|---|---|"];

const navegador = await chromium.launch({ headless: false });
const contexto = await navegador.newContext({ locale: "es-DO" });

for (const [nombre, url] of paginas) {
  const pagina = await contexto.newPage();
  let estado = "sin respuesta";
  try {
    const r = await pagina.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    estado = r ? r.status() : estado;
    // Si Cloudflare muestra su pantalla de espera, damos tiempo a que termine sola.
    await pagina.waitForTimeout(15000);
  } catch (e) {
    estado = `error: ${e.message.split("\n")[0]}`;
  }
  const titulo = await pagina.title().catch(() => "");
  const bloqueada = /just a moment|un momento|attention required/i.test(titulo);
  const hayCampos = (await pagina.locator("input[type=password]").count().catch(() => 0)) > 0;
  const resultado = hayCampos ? "Llega al formulario de login" : bloqueada ? "Bloqueada por Cloudflare" : "Otro (ver captura)";
  resumen.push(`| ${nombre} | ${estado} | ${titulo || "-"} | ${resultado} |`);
  await pagina.screenshot({ path: `capturas/${nombre.replace(/\s+/g, "-")}.png` });
  await pagina.close();
}

await navegador.close();
const texto = resumen.join("\n");
console.log(texto);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, texto + "\n");
