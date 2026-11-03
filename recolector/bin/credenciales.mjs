// Uso (dentro del contenedor):
//   campanilla-credenciales guardar <etiqueta> <itla|uasd>
//   campanilla-credenciales listar
//   campanilla-credenciales borrar <etiqueta>
// Pide usuario y contraseña por teclado. La contraseña no se muestra ni se registra.
import readline from "node:readline";
import { Writable } from "node:stream";
import { borrar, guardar, listar } from "../lib/credenciales.mjs";

const PLATAFORMAS = ["itla", "uasd"];

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

function ayuda() {
  console.log(
    "Uso:\n  campanilla-credenciales guardar <etiqueta> <itla|uasd>\n  campanilla-credenciales listar\n  campanilla-credenciales borrar <etiqueta>"
  );
  process.exit(1);
}

const [orden, etiqueta, plataforma] = process.argv.slice(2);

if (orden === "listar") {
  const filas = listar();
  if (!filas.length) console.log("No hay credenciales guardadas.");
  for (const f of filas) console.log(`${f.etiqueta}  (${f.plataforma})  guardada ${f.actualizado}`);
} else if (orden === "borrar" && etiqueta) {
  console.log(borrar(etiqueta) ? `Borrada: ${etiqueta}` : `No existía: ${etiqueta}`);
} else if (orden === "guardar" && etiqueta && PLATAFORMAS.includes(plataforma)) {
  const usuario = await preguntar(`Usuario de ${plataforma.toUpperCase()}: `);
  const clave = await preguntar("Contraseña (no se muestra): ", true);
  if (!usuario || !clave) {
    console.error("Usuario y contraseña no pueden estar vacíos. No se guardó nada.");
    process.exit(1);
  }
  guardar(etiqueta, plataforma, usuario, clave);
  console.log(`Guardada y cifrada: ${etiqueta} (${plataforma}).`);
} else {
  ayuda();
}
