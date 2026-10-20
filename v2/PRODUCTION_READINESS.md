# Auditoría de preparación para producción · Webai v2

## 1. Diagnóstico previo a cambios y hallazgos (20-10-2026)

Ámbito: exclusivamente `v2/`, rama de trabajo de la PR existente; original intacto. Sin despliegue, cambios en cuentas externas ni datos reales. Revisión de arquitectura Express/SQLite/React, sesiones, bootstrap, demo, permisos por recurso/tenant, OAuth, IA compatible OpenAI, configuración, frontend, pruebas y dependencias. No es un pentest externo ni una certificación.

### Línea base ejecutada
- `npm test`: 110/110 pruebas correctas (87 de primer nivel).
- `npm run lint`: sin errores ni avisos; 69 archivos.
- `npm run build`: correcto.
- `npm audit --json`: 0 vulnerabilidades conocidas, 156 dependencias. Esto no acredita la seguridad de la aplicación.

### Hallazgos priorizados antes de modificar código

Diagnóstico inicial: no se había confirmado un salto de autenticación privado. **Ampliación durante la auditoría: C01 crítica confirmada en Vite, antes de corregir su configuración.** Un archivo sintético privado de tipo `*.sqlite.bootstrap-token.local`, creado temporalmente en `v2/data/`, fue descargable por `/data/...` y `/@fs/...` con HTTP 200. No se leyó ningún secreto/DB real. Este acceso podía exponer tokens iniciales, bases de datos y claves maestras a visitantes de la vista de desarrollo. No hay evidencia que permita afirmar si se explotó anteriormente. Deben rotarse los secretos que hubieran estado almacenados en una instancia Vite pública, sin invalidar datos ni credenciales automáticamente durante esta tarea.

| ID | Gravedad | Evidencia y efecto | Corrección prevista |
| --- | --- | --- | --- |
| C01 | Crítica | Vite expone por defecto archivos privados del proyecto, comprobado con un token sintético (200 en ruta directa y `/@fs/`). | Denylist de archivos privados, middleware previo a estáticos y pruebas sobre un Vite real; no publicar Vite en producción; rotación operativa pendiente. |
| H01 | Alta | `cookies.js` permite cookies SameSite=None en la vista embebida; `app.js` no valida Origin/Fetch Metadata ni exige JSON antes de mutaciones. El parser JSON no es protección CSRF: hay comandos POST sin cuerpo. | Rechazar orígenes cruzados y contenido simple en mutaciones; conservar clientes no navegador y proxy de mismo origen. |
| H02 | Alta | `auth.js` llama `scryptSync` en rutas públicas. Límite antiguo de login solo por IP/mapa local; aceptar invitación/setup no comparten presupuesto de cómputo ni tamaño máximo de contraseña. | Scrypt asíncrono compatible, concurrencia limitada, límites persistentes por IP/cuenta, contraseñas acotadas y revalidación transaccional. |
| H03 | Alta | `ai.js` consume `response.json()` completo y no limita inferencias simultáneas compartidas; abortar el navegador no cancela el fetch servidor. Un proveedor lento/grande o varios usuarios pueden agotar memoria/conexiones. | Lectura acotada, propagación de cancelación, presupuesto por empresa y concurrencia limitada. |
| H04 | Alta | En demo, cualquier visitante tiene un perfil admin sintético: puede configurar/consultar modelos locales del host. También puede alterar disponibilidad de perfiles e iniciar invitaciones para datos reales. El rol público no es autorización del operador. | Red local/IA de demo solo con consentimiento explícito del operador y límites; impedir alta de identidades reales/desactivación de perfiles en demo. Mantener datos sintéticos y selector de roles sin login. |
| M01 | Media | CRUD duplica validación permisiva: coerción de objetos, cadenas largas, fechas arbitrarias, progreso >100, duraciones/fracciones y campos obligatorios vacíos en PATCH. | Validador compartido, tipos/límites/fechas y pruebas por recurso. |
| M02 | Media | Solo hay cabeceras nosniff/referrer; errores del parser/DB llegan al manejador por defecto de Express. Configuración de arranque poco validada y diagnósticos no estructurados. | Configuración central validada, errores JSON saneados, request ID, logs sin datos ni URLs sensibles, cabeceras CSP de producción y salud mínima. |
| M03 | Media | IA acepta texto sin comunicar finish_reason, uso o respuesta truncada; el recorte puede cortar un secreto antes de ocultarlo. El contexto tiene límite de filas pero no de caracteres totales. | Metadatos acotados, aviso de respuesta parcial, ocultar antes de recortar y presupuesto de contexto. No reintentar automáticamente POST de pago. |
| M04 | Media | Los responsables se guardan por nombre, no por ID; las vistas de informes/calendario cargan listas completas. SQLite, sesiones y límites no constituyen una arquitectura multiinstancia distribuida. | Mantener compatibilidad; documentar deuda/migración necesaria y límites operativos. No reescribir durante endurecimiento. |
| L01 | Baja | README mantiene un párrafo que dice que Slack/Teams/calendario no están implementados, contradiciendo OAuth manual implementado. La fecha de verificación IA es histórica, no disponibilidad actual. | Documentación coherente y etiquetas precisas. |

### Controles ya existentes comprobados en código/pruebas
Consultas parametrizadas y scope tenant; RBAC servidor; tokens de sesión/invitación/bootstrap con hash; expiración/revocación; cookie HttpOnly y fallback en memoria explícito; admin único por espacio para configuración compartida de IA; cifrado AES-GCM con AAD; destinos IA de allowlist exacta y sin redirecciones; OAuth con state de un solo uso, PKCE donde aplica, control de versión y admin activo; demo y DB privada separadas; errores de proveedor saneados; React representa respuestas como texto (sin HTML arbitrario). Se conservarán las regresiones existentes.


## 2. Cambios realizados y motivos

Arquitectura conservada: React usa rutas relativas `/api`; en desarrollo/preview Vite las reenvía al backend; en producción Express sirve solo `dist/`. Express aplica autenticación/RBAC y scope por tenant sobre SQLite WAL. Cada empresa mantiene un único proveedor IA compartido, configurado solo por admin. Demo y aplicación normal conservan DB/cookies separadas. No se ha reescrito v1 ni modificado su código.

| Archivos | Motivo |
| --- | --- |
| `server/private-files.js`, `vite.config.js` | C01: barrera previa a estáticos, fs.deny, bloqueo de rutas directas/@fs/alias/symlinks/archivos privados en public; build falla si public contiene datos/claves/enlaces. También protege estáticos Express. `vite preview` ahora reenvía `/api`, igual que dev. |
| `server/security.js` | Origin/Fetch Metadata y JSON para mutaciones; límites SQLite; cabeceras, request ID, logs de ruta **plantilla** sin URL/query/body/errores crudos; manejador JSON saneado. |
| `server/passwords.js`, `server/auth.js` | Scrypt asíncrono compatible con hashes previos, máximo 4 cálculos activos, contraseñas acotadas, presupuestos por IP/cuenta; rotación/revocación de sesión previa; revalidación de invitación/setup en transacción tras esperar al hash. Demo no acepta login con contraseña ni cuentas reales. |
| `server/runtime.js` | Fallo temprano sin valores secretos ante puerto/booleanos/claves/zona/proxies/orígenes inválidos; APP_BASE_URL obligatorio en producción. |
| `server/app.js` | Integra controles y salud; elimina operaciones de identidad de demo; validación común; transacciones para datos+auditoría; administración/desactivación/revocación atómica con bloqueo inmediato; SMTP con timeout y log saneado; disparadores no implementados devuelven 409 sin incrementar ejecuciones. |
| `server/validation.js` | Límites/tipos/fechas/enums/color, campos obligatorios también en PATCH, rechazo de campos desconocidos y referencias a personas/proyectos ajenos o inactivos. Conserva el esquema histórico por nombres. |
| `server/ai.js`, `server/ai-providers.js` | Lectura/concurrencia/contexto acotados, cancelación, presupuesto compartido, uso/finalización/parciales, ocultar claves antes de recortar y filtrar catálogo, CAS de configuración y comprobación final de admin/sesión; opt-in de red de demo; allowlist exacta validada. |
| `server/upstream.js`, `server/integrations.js` | Lector JSON por bytes reales del stream (también chunked/decodificado); límites de cuerpos de OAuth/API y cuotas persistentes de integraciones. Mantiene 202 vacío legítimo de envío Outlook. |
| `server/master-key.js`, `server/integration-vault.js` | Política común de archivos de clave sin seguir symlinks: 0600, propietario, archivo regular de 32 bytes; conserva claves/cifrados separados y formatos AES-GCM existentes. No rota ni recifra datos existentes. |
| `server/database.js`, `server/index.js` | DB/WAL/SHM nuevos privados, DB 0600, directorio alternativo creado con permisos privados; cierre HTTP/SQLite en SIGTERM/SIGINT y tiempos de recepción. |
| `src/components/AIQuickSetup.jsx`, `src/pages/AssistantPage.jsx` | Catálogo vs prueba vs configuración histórica; demo sin formulario de red no autorizado; cancelación explícita y advertencias de parcial/uso/finalización desconocida, sin renderizar HTML de usuario/modelo. |
| `src/App.jsx`, `src/pages/TeamPage.jsx`, `src/pages/AutomationsPage.jsx` | No ofrecer invitaciones/desactivar perfiles en demo; aclarar ejecución manual/no notificaciones/no scheduler. |
| `scripts/backup.mjs` | Copia SQLite online verificada y no sobrescritura, sin abrir una DB inexistente como nueva. |
| `tests/security.test.js`, `tests/hardening-api.test.js`, `tests/recovery.test.js`, `tests/vite-privacy.test.js`; ampliaciones en `ai.test.js`, `demo.test.js`, `proxy.test.js`, `startup.test.js` | Regresiones de seguridad/función, API y Vite reales con datos sintéticos, matriz CRUD por rol/empresa, carreras, fallos y recuperación. Ninguna prueba original eliminada ni control desactivado para hacerlas pasar. |
| `.github/workflows/v2-checks.yml`, `package.json`, `package-lock.json` | CI v2 Node 22/24 con acciones fijadas a SHA, test/lint sin avisos/build/audit; versión mínima Node y comando backup. Sin dependencias nuevas. |
| `.env.example`, `.gitignore`, `README.md`, `LOCAL_AI.md`, este informe | Plantilla sin credenciales, instrucciones/estado veraz y riesgos operativos; corrección del texto obsoleto sobre OAuth. |

Cambios de contrato deliberados: mutaciones API exigen JSON y origen permitido; campos CRUD desconocidos/tipos/coerciones inválidas antes tolerados ahora devuelven 400; referencias nuevas deben pertenecer al equipo activo. No se borra ni migra destructivamente el contenido histórico. Los registros de una empresa son colaborativos según RBAC, no buzones privados por persona.

## 3. Vulnerabilidades corregidas y pendientes

**Corregidas en código:** C01, H01–H04, M01–M03 y L01. La comprobación C01 pasó de **200** a **403**, tanto con Vite real de prueba como en las dos vistas locales activas, usando únicamente archivos sintéticos. Además se corrigieron la falta de atomicidad entre CRUD y su auditoría, las carreras de prueba/desconexión/revocación de IA y el falso éxito del disparador de notas no implementado.

**Pendiente obligatorio por la exposición anterior (C01):** investigar accesos y, si se almacenaron usuarios/secretos reales en una vista Vite pública, revocar sesiones/consentimientos y rotar contraseñas, tokens iniciales/invitación, claves API/OAuth y material de cifrado con un plan de recifrado/reconfiguración. Bloquear descargas ahora no recupera una clave que ya pudiera haberse descargado. **No se han leído secretos reales, rotado credenciales ni invalidado datos/sesiones reales automáticamente.** No se ha confirmado explotación anterior ni puede descartarse.

**Pendiente/deuda y controles del operador:**
- M04: responsables por nombre, no ID; informes/calendario/selectores agregan páginas completas. No hay ETag/control de versión de edición de registros de negocio, ni benchmark de gran volumen. Para equipos pequeños y un proceso; escalar exige agregados backend, migración de referencias y control distribuido.
- Concurrencia IA/crypto/singleflight de refresh son por proceso; límites/sesiones SQLite se comparten solo si usan el mismo archivo, no entre DB independientes. No se garantiza despliegue horizontal. No usar SQLite compartido por NFS como sustituto de una DB distribuida.
- No hay recuperación autoservicio de contraseña, MFA, política de retención/borrado/exportación RGPD, alertas/SIEM ni operación 24/7 certificada. No se han verificado permisos/infraestructura del despliegue final.
- Deben configurarse TLS, firewall de entrada/salida, proxy que **sustituya** headers reenviados, permisos/volúmenes privados y almacenamiento de backup cifrado. CSP admite estilos inline por compatibilidad del UI; scripts inline no están permitidos en producción.
- SSRF: destinos cloud fijos y sin redirect; motores locales/default o allowlist del operador. No hay pinning DNS; autorizar un hostname significa confiar en su DNS. Usar destinos estáticos/controlados y egress restrictivo. La app no debe tener acceso de red innecesario a metadatos/servicios sensibles.
- Una respuesta que contenga datos sensibles en su propio contenido no puede sanearse universalmente; se oculta la clave de conexión exacta, no es una herramienta DLP. Prompts/títulos pueden contener información confidencial. Contexto externo requiere consentimiento admin + usuario.
- Ninguna prueba de este trabajo acredita cuentas reales OAuth, envío SMTP real, ejecución de pesos LLM, balance/cuotas, proveedor de nube real, pentest externo, rendimiento bajo carga, todos los navegadores o el gateway remoto real.

## 4. Verificaciones ejecutadas

Línea base: 110 pruebas correctas; tras primeras correcciones se reejecutaron las 110 originales; suite ampliada final: **142/142 PASS (106 de primer nivel), cero omitidas/canceladas**. Pruebas añadidas no reemplazan las originales.

| Comprobación | Resultado real |
| --- | --- |
| `npm test` | PASS: sesiones/cookies/memoria, bootstrap/invitación concurrentes/uso único, expiración/revocación/rotación, matriz de roles CRUD y tenants para 5 recursos, referencias y datos inválidos, CSRF con cookie válida, límites de cuenta/IP/empresa, salud/fallo DB, rollback de auditoría, IA parcial/errores/límites/cancelación/timeout HTTP real acelerado/carreras de configuración, OAuth existente, demo sin login. |
| Vite real y build | PASS: datos/claves/token sintéticos, rutas directas/@fs, escapes, public, aliases/symlinks, nombre de DB sin extensión, preview; build rechaza public sensible. No se descargó DB/token real. |
| `npm run lint -- --deny-warnings` | PASS, 0 avisos/errores. |
| `npm run build` | PASS, bundle JS ~360,22 kB (gzip ~108,42 kB), CSS ~67,72 kB (gzip ~15,04 kB). No se declara optimización de carga masiva. |
| `npm audit --json` / `npm audit --audit-level=low` | 0 vulnerabilidades conocidas en v2; el resultado es temporal y no equivale a seguridad total. |
| Instalación limpia aislada | `npm ci` estándar falló por red bloqueada a nodejs.org para las cabeceras nativas. Con `npm_config_nodedir=/usr/local` y cabeceras locales **de la misma versión Node 22.22.3**, instalación correcta, sin omitir scripts nativos. Test/lint/build/audit volvieron a pasar en esa copia: 142 pruebas, lint sin avisos, build correcto y 0 vulnerabilidades conocidas, sin reinstalar dependencias de las vistas activas. |
| Navegador Chromium HTTPS | PASS con fixtures aisladas: login cookie e iframe/HMR; fallback explícito sin cookies ni storage; demo sin login ni storage; OAuth popup/callback/operaciones **simulados**, no cuentas reales. |
| Frontend compilado HTTPS/CSP | PASS: login, IA simulada con parcial/uso/cancelación/error; texto XSS no se ejecuta; demo sin controles de identidad/red no autorizados; 1440 px y 390 px sin overflow; sin errores JS ni violaciones CSP en esas pantallas. No es auditoría WCAG exhaustiva. |
| Backup/restauración y apagado | PASS: copia desde WAL, integridad/lectura en DB aislada, no sobrescritura/no crear origen inexistente; SIGTERM conserva alta/sesión privada e integridad de SQLite. No se restauró la DB real. |
| `git diff --check` | PASS. No se han modificado archivos originales de v1 ni hecho merge/deploy de producción. Las dos vistas de desarrollo se reiniciaron conservando sus DB: páginas/salud 200, normal anónima 401, demo anónima 200 sin red IA, archivos sintéticos privados 403 en API y Vite; origen exacto de preview aceptado y origen ajeno rechazado. |

CI **verificada** para el commit de código `0698252`: GitHub Actions terminó en **success en Node 22 y Node 24**, tanto en push como en pull_request, ejecutando instalación, pruebas, lint sin avisos, build y audit. Ejecuciones: [pull_request 39431231831](https://github.com/AS-Spain/Webai/actions/runs/39431231831) y [push 39431229382](https://github.com/AS-Spain/Webai/actions/runs/39431229382). La verificación local usa Node **22.22.3**. Este resultado no valida proveedores reales ni condiciones operativas de producción. Las trazas completas locales están fuera del repositorio (`/home/user/audit-*.log`); no se versionan logs, datos, claves, dependencias ni bundles.

## 5. Instalación, arranque y recuperación

Requisitos: Node >=22.12 (22 LTS probado aquí; CI también contempla 24), npm, Python 3, make/compilador C/C++ y cabeceras de Node compatibles para el módulo nativo better-sqlite3. En un host Linux con conexión normal:

```sh
cd v2
npm ci
cp .env.example .env
# Editar .env EN PRIVADO; no guardar claves reales en Git ni prefijarlas VITE_.
set -a
. ./.env
set +a
npm test
npm run lint -- --deny-warnings
npm run dev
```

Normal: API 3002 + Vite 5174. Demo en otra terminal: `PORT=3003 APP_BASE_URL=http://localhost:5175 npm run dev:demo` (API 3003 + Vite 5175). El token inicial normal aparece solo en consola como `[Token] ---> …`; pegar manualmente en el mismo formulario. La demo sigue entrando directamente y permite seleccionar roles sintéticos, sin crear una sesión privada.

Producción: no usar Vite ni servir el checkout completo. Compilar sin secretos de usuario final y ejecutar Express con valores privados inyectados:

```sh
NODE_ENV=production npm run build
NODE_ENV=production APP_BASE_URL="https://tu-dominio.example" V2_REQUEST_LOGS=true PORT=3002 npm start
```

Inyectar las restantes variables con el gestor de procesos/secretos. Ejecutar con usuario no root, volumen persistente privado y una sola instancia. El servidor escucha `0.0.0.0` para el entorno de preview: en producción aislar ese puerto detrás de un proxy TLS, no publicarlo sin protección. El proxy debe conservar Host, reenviar el protocolo real y sustituir X-Forwarded-For, no confiar en el aportado por el cliente. Autorizar solo su IP/CIDR exacto. Redirigir HTTP público a HTTPS. CSP producción bloquea iframes de otros sitios; desarrollo Arena sigue embebible.

```sh
npm run backup -- /almacenamiento-privado/copia-nueva.sqlite
```

La herramienta no incluye claves ni cifra la copia: usar volumen cifrado, permisos privados, retención y copia externa supervisada. Guardar separadamente `ai-master.key`/`integrations-master.key` o sus valores del gestor de secretos. Para un simulacro: detener una **instancia de prueba**, apuntar `V2_DB_PATH` a una copia nueva y aportar las mismas claves; comprobar integridad, datos y descifrado, y revocar sesiones de prueba cuando corresponda. No sobrescribir la DB en servicio, no copiar solo el `.sqlite` ignorando WAL, ni generar una clave nueva esperando descifrar datos antiguos. Probar restauración y RPO/RTO con el operador antes de producción.

Para IA local real: [LOCAL_AI.md](LOCAL_AI.md); para aplicaciones registradas/consentimientos OAuth: [OAUTH.md](OAUTH.md). No hay motor LLM, credenciales de nube ni cuentas externas instaladas/configuradas automáticamente.

## 6. Variables de entorno (nombres, nunca valores reales)

| Variables | Uso |
| --- | --- |
| `NODE_ENV`, `PORT`, `V2_TIME_ZONE` | Producción/cabeceras, puerto y zona IANA (Europe/Madrid por defecto). |
| `APP_BASE_URL` | Origen público raíz; obligatorio en producción. OAuth exige HTTPS salvo localhost. |
| `DEMO_MODE` | Modo separado; los comandos normal/demo lo fijan explícitamente. |
| `V2_DB_PATH`, `V2_DEMO_DB_PATH` | SQLite privados y distintos; `data/` por defecto. |
| `BOOTSTRAP_TOKEN` | Token inicial >=32 caracteres o generación automática; consola, nunca API/URL. |
| `V2_AI_ENCRYPTION_KEY`, `V2_INTEGRATIONS_ENCRYPTION_KEY` | Opcional: 64 hex desde gestor privado; sin ello, archivos separados privados de 32 bytes. Persistir y respaldar. |
| `V2_AI_ALLOWED_ORIGINS` | Orígenes exactos adicionales de motores; no URLs con /v1, comodines o credenciales. |
| `V2_DEMO_AI_ENABLED` | false por defecto. Opt-in del operador para red/inferencia de demo pública, sin claves ni nube. |
| `V2_TRUSTED_PROXIES` | IP/CIDR de proxies que sustituyen headers. false por defecto; no admite true ni cantidad de saltos. |
| `V2_ALLOWED_WEB_ORIGINS` | Orígenes web exactos adicionales para CSRF cuando un gateway sustituye Host; no CORS abierto. APP_BASE_URL también se admite. |
| `V2_REQUEST_LOGS` | Logs JSON de solicitudes (true por defecto en producción). No URLs/queries/cuerpos/secretos. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Invitaciones por SMTP opcional en privado; desactivado en demo. |
| `E2B_SANDBOX_ID` | Metadato del entorno Arena, no secreto ni permiso de admin. Ajusta cookies y los orígenes exactos de los puertos conocidos del propio sandbox para gateways que sustituyen Host; no confía en un X-Forwarded-Host arbitrario. |

Ninguna clave real en `.env.example`. Node no importa `.env` por sí solo; el operador debe exportarlo. Un `.env` privado nunca debe subirse a Git ni alojarse en public.

## 7. Límites técnicos y funcionales explícitos

- API: cuerpos JSON 128 KiB; 300 solicitudes/minuto/IP; 120 mutaciones/minuto/empresa; login 50/15 min/IP y 20/15 min/cuenta; bootstrap y activación 10/min/IP; invitaciones 20/min/admin; operaciones OAuth 30/min/admin. Sin proxy confiable el presupuesto por IP se agrega en el gateway. Son límites fijos, no WAF ni protección DDoS volumétrica.
- IA: 20 llamadas/min/usuario, 60/min/empresa; 2 simultáneas/empresa, 8/proceso; local 120 s, nube 25 s; chat leído <=256 KiB, catálogo <=1 MiB; texto <=16.000 caracteres con aviso de parcial; contexto <=25 filas/tipo y <=12.000 caracteres JSON. No es tokenización exacta ni comprobación automática de ventana de contexto del modelo.
- Reglas locales: muestra de hasta 1.000 filas por tipo y texto acotado; no son IA ni resumen exhaustivo de grandes empresas. Las respuestas no pueden ejecutar herramientas ni alterar registros. Reintento IA manual para evitar duplicar coste.
- OAuth es manual, no sincronización de fondo ni envío automático de notificaciones por reglas. Dos disparadores de diagnóstico funcionan sin notificar; notas/reuniones no implementadas devuelven 409, no un éxito ficticio.
- Accesibilidad comprobada aquí se limita a etiquetas/estados/cancelación y los recorridos/anchos citados. No se presenta como certificación WCAG, pentest ni prueba de carga.
- La copia/restore de pruebas y los proveedores simulados prueban código/protocolo, no tu infraestructura, cuentas, modelo, consentimientos, deliverability, facturación o plan de continuidad real.

## 8. Veredicto

**NO APTO todavía para declarar producción con datos reales en la instancia previamente expuesta.** Se han corregido en código los hallazgos críticos/altos identificados y se ha ampliado la verificación real; no es un cambio meramente visual ni una lista de recomendaciones. La demo sintética puede usarse sin datos/secretos reales con red de IA desautorizada por defecto.

Para reevaluar como **apto con condiciones** para un despliegue privado pequeño/controlado: resolver la posible exposición previa mediante revisión/rotación autorizada, desplegar solo build+Express con TLS/proxy/egress/volúmenes seguros, realizar y documentar restauración operativa y monitorización, validar el motor/proveedores reales que se vayan a activar y aceptar/planificar las deudas de recuperación, MFA, retención y escala. No se ha desplegado ni autorizado producción. No se afirma seguridad al 100 % ni ausencia de vulnerabilidades desconocidas.
