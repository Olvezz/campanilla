# Campanilla: monitor de tareas universitarias — contexto del proyecto

Nombre del proyecto: **Campanilla** (repo `campanilla`).

Idioma de trabajo: español. Dueño del proyecto: Olvezz.

## Objetivo

Herramienta propia, personal y privada que avisa **en cuanto se publica** una tarea en las aulas virtuales universitarias, con el **desglose completo** (qué piden, fechas, adjuntos). Las apps y notificaciones oficiales avisan tarde (un día antes del cierre o ya vencida) y sin detalle; por eso se construye algo propio.

Plataformas:
- **ITLA** (`https://aulavirtual.itla.edu.do`): Moodle, login directo con usuario y contraseña (sin SSO). Es la primera que se construye.
- **UASD** (`https://app.uasd.edu.do/UASDVirtualGateway/Default.aspx`): portal ASP.NET, plataforma por analizar. Segundo conector, después de ITLA.
- Cualquier otro Moodle se soporta con el mismo conector que ITLA.

Olvezz tiene acceso y credenciales de todas. **Nunca** escribir credenciales en archivos, commits ni logs.

## Restricciones decididas

- **Sin tarjeta**: no usar el plan Blaze de Firebase, así que no hay Cloud Functions. Todo corre en plan Spark, GitHub Actions y el servidor propio.
- **Cloudflare bloquea todo lo que no sea un navegador real** (ver "Hallazgos de la fase 1"). La lectura de las plataformas NO puede hacerse con peticiones HTTP ni desde GitHub Actions. Se hace con un navegador real (Playwright) en un LXC del Proxmox de Olvezz. No se intenta falsear huellas ni resolver desafíos.
- **Repo público** en GitHub. El código no lleva credenciales: las de las plataformas viven cifradas solo dentro del LXC; las del bot y Firebase, en GitHub Secrets.
- GitHub desactiva los workflows programados tras 60 días sin actividad en el repo: el vigilante incluye un paso de "keepalive".
- Cadencia de lectura: cada 10 min con variación aleatoria de ±2 min. Si Cloudflare empieza a pedir verificación, subir a 15–30 min. Se tolera que tarde horas.
- No usar equipos del trabajo ni de terceros para correr el monitor ni para guardar credenciales.
- Varios usuarios: Olvezz configura a cada persona que lo quiera usar.

## Arquitectura

| Pieza | Función |
|---|---|
| LXC en el Proxmox (Debian 12, Playwright + Chromium, systemd timer, `onboot=1`) | Entra a las plataformas con navegador real, detecta cambios, escribe en Firestore y envía avisos. Si hay apagón, al volver arranca solo y recupera lo pendiente |
| GitHub Actions (cron) | Vigilante: si pasan X horas sin lectura avisa por Telegram que el monitor está caído; atiende los comandos de Telegram; keepalive |
| Firestore (Spark) | Perfiles, tareas, avisos, invitaciones |
| Firebase Auth | Cuentas: Google o correo y contraseña (sin SMS) |
| Firebase Hosting | PWA |
| FCM | Notificaciones push desde Actions (service account) |
| Bot de Telegram | Avisos y comandos (por polling con `getUpdates` en cada corrida) |

Detección en Moodle (en orden de preferencia):
1. API de la app móvil (web services): token vía `/login/token.php?service=moodle_mobile_app`; leer tareas con funciones como `mod_assign_get_assignments` y `core_calendar_get_action_events_by_timesort`.
2. Calendario exportado (iCal con token propio): detecta tareas nuevas, pero solo trae título y fecha.
3. Navegador automatizado (Playwright): último recurso, frágil.

El riesgo original (servicio móvil deshabilitado) no existe: está activo en ITLA y en la UASD. El riesgo real es Cloudflare: las opciones 1 y 2 solo funcionan desde un navegador real, por eso el recolector corre en el LXC. Desde el navegador, con sesión iniciada, funcionan el calendario y la lista de cursos por AJAX; las funciones de detalle (`mod_assign_get_assignments`, contenidos, cuestionarios) devuelven `servicenotavailable` por sesión web y exigen token del servicio móvil, o bien leer el HTML de las páginas.

## Entorno CLI y pruebas con el celular por ADB

ITLA tiene una app en Google Play (búsqueda: `https://play.google.com/store/search?q=itla&c=apps&hl=es_419`). Olvezz puede **conectar un celular por ADB al entorno CLI** para que se pruebe lo necesario, por ejemplo:
- Identificar si es la app oficial de Moodle o una app propia de ITLA.
- Ver qué endpoints de la API usa la app (para confirmar que el servicio móvil está habilitado y qué funciones llama).
- Comparar lo que muestra la app con lo que devuelve el conector.

Reglas: es la cuenta de Olvezz y es solo para pruebas del proyecto. No guardar capturas de tráfico ni tokens en el repo.

## Hallazgos de la fase 1 (3 nov 2026)

- **ITLA** (`aulavirtual.itla.edu.do`): Moodle. `/login/token.php` responde `invalidlogin` desde el navegador, o sea que el servicio móvil está activo. Cloudflare muestra desafío (`cf-mitigated: challenge`) a cualquier cliente sin navegador, en todas las rutas.
- **UASD**: el portal `app.uasd.edu.do/UASDVirtualGateway` es un puente ASP.NET (período, materias). Al elegir una materia entra por SSO propio (`/login/wsuasd.php`, parámetros `tk`/`tku` en la URL) a un **Moodle distinto por facultad** (ej. `ciencias.uasd.edu.do`, tema `uasdvirtual`). Hay que resolver qué facultad corresponde a cada materia. También da 403 a clientes sin navegador. Con sesión, calendario y cursos funcionan por AJAX (`/lib/ajax/service.php` con `M.cfg.sesskey`).
- **App de ITLA en Play** (`edu.do.itla.app`, React Native): no maneja tareas. Solo API académica propia (`api.itla.edu.do`: notas, inscripción, plan, carnet). Descartada. No sirve para este proyecto.
- Cuenta de Olvezz en ITLA sin cursos en curso: para probar tareas reales se usa la cuenta de una compañera, con su consentimiento y solo para pruebas.
- `pruebas/probar_moodle.mjs` (Node, pide la clave por teclado) confirma el bloqueo desde la PC: HTTP 403 de Cloudflare en ambas plataformas.
- **Misma prueba desde el LXC en casa (IP residencial): ITLA, portal UASD y `ciencias.uasd.edu.do` cargan el login con 200 y sin espera.** El LXC resuelve el caso que Actions no logra (Ciencias); queda como recolector principal.
- `pruebas/prueba_actions.mjs` + workflow `prueba-cloudflare.yml` (corrida 3 nov 2026, una sola vez): un Chromium real en GitHub Actions **llegó al login de ITLA** (200) y **al portal de la UASD** (200), pero `ciencias.uasd.edu.do/login/index.php` dio **403 "Un momento…"** (Cloudflare). Segunda corrida (con espera de hasta 60 s): mismo resultado, ITLA y portal entran en 0 s y Ciencias sigue bloqueada tras 60 s, así que esperar no ayuda. El workflow ahora corre 6 veces al día (cron `17 1,5,9,13,17,21 * * *` UTC) para medir estabilidad; revisar con `gh run list --repo Olvezz/campanilla` y quitar el bloque `schedule` cuando haya datos. Falta además probar el flujo real (portal → SSO a la facultad), que puede comportarse distinto al login directo. Si ITLA se sostiene, el recolector de ITLA podría vivir en Actions; la UASD probablemente necesite el LXC (IP de casa).

## Apariencia (temas dentro del sitio)

Los temas son una función de la PWA, en Ajustes › Apariencia, no una opción de la maqueta.
- Temas prediseñados: Papel (claro, por defecto), Noche (oscuro), Bosque, Atardecer, Grafito.
- Colores propios: acento, color de lo urgente y fondo; el texto sobre ellos pasa a claro u oscuro según el contraste.
- Dos juegos de tipografía.
- Todo se basa en variables CSS (tokens); cada tema redefine los mismos tokens. Se guarda en el dispositivo y, con sesión, en `usuarios/{uid}` para que viaje entre dispositivos.
- Referencia visual: la maqueta publicada como artifact de Claude (no se versiona en el repo; la copia local `maqueta/` está desactualizada e ignorada).

## Perfiles

| Perfil | Puede |
|---|---|
| Administrador (Olvezz) | Todo lo del usuario, más invitar personas, configurarles la plataforma y ver la salud del sistema |
| Usuario | Ver solo sus tareas, vincular Telegram y push, editar sus preferencias |

El aislamiento por usuario se garantiza con reglas de Firestore. El primer administrador se fija una vez a mano en la consola.

## Inicio de sesión

- **Cuenta** (Google o correo y contraseña): identidad real, una vez por dispositivo.
- **PIN de 4 a 6 dígitos**: desbloqueo rápido en un dispositivo ya autenticado. Se guarda solo en el dispositivo (hash con WebCrypto/PBKDF2). Tras 5 fallos pide la cuenta completa.
- **Huella o rostro** (passkey/WebAuthn): opcional.
- PIN como único acceso: descartado (sin servidor no se pueden limitar intentos y se adivina por fuerza bruta).

## Alta de otra persona

1. El administrador genera una invitación con código.
2. La persona abre la PWA, inicia sesión e ingresa el código.
3. El administrador le configura la plataforma en un asistente (URL, usuario, token) y se vincula su Telegram con otro código.

## Pantallas

Usuario: Inicio (urgente, hoy, semana) · Tareas (Nuevas, Pendientes, Hechas, Vencidas; detalle, adjuntos, enlace a la original) · Calendario mensual · Avisos (historial) · Ajustes (Telegram, push, silencio, recordatorios, PIN, plataformas, cerrar sesión).

Administrador: Personas (invitar, estado, pausar) · Plataformas (asistente y prueba de token) · Salud (última revisión, errores, token por vencer).

## Avisos

| Aviso | Contenido |
|---|---|
| Nueva tarea | Materia, título, apertura y cierre, qué piden, adjuntos |
| Tarea modificada | Qué cambió (por ejemplo, cierre movido) |
| Recordatorio | 24 h y 3 h antes si no está hecha; configurable |
| Resumen diario | 7:00 am con lo pendiente de la semana |
| Problema | Token vencido o plataforma caída |

Telegram: botones "Abrir en la plataforma", "Marcar como hecha", "Recordarme…". Comandos `/hoy`, `/semana`, `/pendientes`, `/silencio`. Las respuestas llegan en la siguiente corrida (hasta ~10 min); si molesta, se puede añadir luego un receptor gratuito sin tarjeta.

## Seguridad del token

El navegador cifra el token de Moodle con una **clave pública** antes de guardarlo en Firestore. Solo el job de GitHub tiene la clave privada (GitHub Secret). Ni Firestore ni el panel leen el token en claro.

## Datos (Firestore)

`usuarios/{uid}` → subcolecciones `plataformas`, `tareas` (con historial de cambios) y `avisos`; más `invitaciones/{codigo}`.

## Fases

1. Prueba en ITLA desde la PC de Olvezz: obtener token, listar tareas y descripciones.
2. Monitor y aviso por Telegram para Olvezz.
3. Panel PWA con login, PIN y push.
4. Perfiles, invitaciones y panel de administrador.
5. Conector para la UASD.

## Pendientes por resolver

- LXC recolector **creado** (3 nov 2026): CT 401 `campanilla-monitor`, Debian 12, 2 núcleos, 2 GB RAM, 1 GB swap, 8 GB en `local-zfs`, sin privilegios con `nesting=1`, IP 10.0.0.91/24 (gw 10.0.0.1, DNS 10.0.0.51 y 1.1.1.1), `onboot=1`, etiqueta `campanilla`, entra en el respaldo mensual existente. Node 22 + Playwright + Chromium en `/opt/campanilla`. Acceso de Claude: SSH con la llave `~/.ssh/claude_dev` (usuario root del host Proxmox 10.0.0.50 y del CT), autorizada por Olvezz; conviene quitarla del host cuando termine el trabajo. Ya existe un LXC de desarrollo (303 `claude-dev`, 10.0.0.57) que no se toca.
- Siguiente en el LXC: servicio systemd + timer cada ~10 min, cifrado de credenciales, y el recolector real (login, lectura, escritura en Firestore).
- Correr la prueba de Cloudflare en GitHub Actions (necesita el repo público creado).
- Definir cómo obtener el detalle de tareas: token del servicio móvil (¿lo permite la UASD con su SSO?) o lectura del HTML con la sesión.
- Resolver la facultad (Moodle) de cada materia de la UASD.
- Definir el cifrado de credenciales dentro del LXC (llave propia, permisos 600, nada en Firestore ni en el repo).
- Cómo lee Chele sus temas: no se encontró la implementación en `Chele-respaldo-codigo`; Olvezz indicará dónde está si quiere replicarla.
