// Almacén de credenciales cifradas (AES-256-GCM).
// La llave se genera en el propio servidor y vive aparte del archivo de datos.
// Protege contra copias del repo, de respaldos de datos o de lecturas casuales;
// no protege contra alguien con acceso root dentro del contenedor.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DIR_LLAVE = process.env.CAMPANILLA_LLAVE_DIR || "/etc/campanilla";
const DIR_DATOS = process.env.CAMPANILLA_DATOS_DIR || "/var/lib/campanilla";
const ARCHIVO_LLAVE = path.join(DIR_LLAVE, "llave.bin");
const ARCHIVO_DATOS = path.join(DIR_DATOS, "credenciales.json");

function asegurarDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function obtenerLlave() {
  asegurarDir(DIR_LLAVE);
  if (!fs.existsSync(ARCHIVO_LLAVE)) {
    fs.writeFileSync(ARCHIVO_LLAVE, crypto.randomBytes(32), { mode: 0o600 });
  }
  return fs.readFileSync(ARCHIVO_LLAVE);
}

function leerTodo() {
  if (!fs.existsSync(ARCHIVO_DATOS)) return {};
  return JSON.parse(fs.readFileSync(ARCHIVO_DATOS, "utf8"));
}

function escribirTodo(datos) {
  asegurarDir(DIR_DATOS);
  fs.writeFileSync(ARCHIVO_DATOS, JSON.stringify(datos, null, 2), { mode: 0o600 });
}

export function guardar(etiqueta, plataforma, usuario, clave) {
  const iv = crypto.randomBytes(12);
  const cifrador = crypto.createCipheriv("aes-256-gcm", obtenerLlave(), iv);
  const cuerpo = Buffer.concat([cifrador.update(JSON.stringify({ usuario, clave }), "utf8"), cifrador.final()]);
  const datos = leerTodo();
  datos[etiqueta] = {
    plataforma,
    iv: iv.toString("base64"),
    tag: cifrador.getAuthTag().toString("base64"),
    cuerpo: cuerpo.toString("base64"),
    actualizado: new Date().toISOString(),
  };
  escribirTodo(datos);
}

export function leer(etiqueta) {
  const entrada = leerTodo()[etiqueta];
  if (!entrada) throw new Error(`No hay credenciales guardadas para "${etiqueta}"`);
  const descifrador = crypto.createDecipheriv("aes-256-gcm", obtenerLlave(), Buffer.from(entrada.iv, "base64"));
  descifrador.setAuthTag(Buffer.from(entrada.tag, "base64"));
  const claro = Buffer.concat([descifrador.update(Buffer.from(entrada.cuerpo, "base64")), descifrador.final()]);
  return { plataforma: entrada.plataforma, ...JSON.parse(claro.toString("utf8")) };
}

// Solo etiqueta, plataforma y fecha: nunca usuario ni clave.
export function listar() {
  return Object.entries(leerTodo()).map(([etiqueta, e]) => ({
    etiqueta,
    plataforma: e.plataforma,
    actualizado: e.actualizado,
  }));
}

export function borrar(etiqueta) {
  const datos = leerTodo();
  const existia = etiqueta in datos;
  delete datos[etiqueta];
  escribirTodo(datos);
  return existia;
}
