// Prueba el servicio móvil de un Moodle: pide el token y lista tareas.
//
// Uso:  node probar_moodle.mjs https://aulavirtual.itla.edu.do
// Pide usuario y contraseña por teclado. No guarda nada en disco ni imprime el token.
// Sin dependencias (Node 18 o superior).
import readline from "node:readline";
import { Writable } from "node:stream";

const UA = { "User-Agent": "MoodleMobile/4.4.0 (Linux; Android 15)" };

function preguntar(texto, oculto = false) {
  return new Promise((resolve) => {
    let mudo = false;
    const salida = new Writable({
      write(chunk, enc, cb) {
        if (!mudo) process.stdout.write(chunk, enc);
        cb();
      },
    });
    const rl = readline.createInterface({ input: process.stdin, output: salida, terminal: true });
    rl.question(texto, (r) => {
      rl.close();
      if (oculto) process.stdout.write("\n");
      resolve(r.trim());
    });
    mudo = oculto;
  });
}

async function post(url, datos) {
  const r = await fetch(url, {
    method: "POST",
    headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(datos),
  });
  return { estado: r.status, cuerpo: await r.text() };
}

async function ws(base, token, funcion, args = {}) {
  const { cuerpo } = await post(`${base}/webservice/rest/server.php`, {
    wstoken: token,
    wsfunction: funcion,
    moodlewsrestformat: "json",
    ...args,
  });
  return JSON.parse(cuerpo);
}

const base = (process.argv[2] || "").replace(/\/$/, "");
if (!base) {
  console.error("Falta la URL. Ejemplo: node probar_moodle.mjs https://aulavirtual.itla.edu.do");
  process.exit(1);
}

const usuario = await preguntar("Usuario: ");
const clave = await preguntar("Contraseña (no se muestra): ", true);

const { estado, cuerpo } = await post(`${base}/login/token.php`, {
  username: usuario,
  password: clave,
  service: "moodle_mobile_app",
});
if (cuerpo.includes("Just a moment")) {
  console.error(`HTTP ${estado}: Cloudflare bloquea esta conexión.`);
  process.exit(1);
}
const datos = JSON.parse(cuerpo);
if (!datos.token) {
  console.error(`Sin token: ${datos.errorcode} - ${datos.error}`);
  process.exit(1);
}
const token = datos.token;
console.log("Token obtenido (oculto).");

const info = await ws(base, token, "core_webservice_get_site_info");
console.log("Sitio:", info.sitename, "| Moodle", info.release);
const funciones = new Set((info.functions || []).map((f) => f.name));
for (const f of [
  "mod_assign_get_assignments",
  "core_calendar_get_action_events_by_timesort",
  "core_course_get_contents",
  "mod_quiz_get_quizzes_by_courses",
]) {
  console.log(`  ${f}:`, funciones.has(f) ? "disponible" : "NO disponible");
}

const cursos = await ws(base, token, "core_course_get_enrolled_courses_by_timeline_classification", {
  classification: "inprogress",
});
const lista = cursos.courses || [];
console.log("Cursos en curso:", lista.map((c) => c.shortname));

if (lista.length) {
  const ids = Object.fromEntries(lista.map((c, i) => [`courseids[${i}]`, c.id]));
  const tareas = await ws(base, token, "mod_assign_get_assignments", ids);
  for (const c of tareas.courses || []) {
    for (const a of c.assignments) {
      const cierre = a.duedate ? new Date(a.duedate * 1000).toLocaleString("es-DO") : "sin fecha";
      console.log(
        `  ${c.shortname} | ${a.name} | cierra ${cierre} | ` +
          `${(a.introattachments || []).length} adjuntos | descripción ${(a.intro || "").length} car.`
      );
    }
  }
}
