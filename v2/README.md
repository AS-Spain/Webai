# Northstar Work · v2

Versión independiente de la aplicación. **La versión original de la raíz no se ha modificado.** No es necesario sustituir sus archivos ni migrar su base de datos para probar esta versión.

## Separación entre versiones

| Recurso | Original | v2 |
| --- | --- | --- |
| Código | Raíz del repositorio | `v2/` |
| Interfaz en desarrollo | `5173` | `5174` |
| API por defecto | `3001` | `3002` |
| Base de datos por defecto | `data/webai.sqlite` | `v2/data/webai-v2.sqlite` |
| Cookie | `webai_session` | `webai_v2_session` |
| Tema guardado | — | `northstar-v2-theme` |

La v2 **no lee `DB_PATH`**: usa `V2_DB_PATH` para evitar reutilizar por accidente una variable de la versión original. No apuntes `V2_DB_PATH` a la base de datos original. Ambas versiones pueden ejecutarse al mismo tiempo con sus puertos predeterminados.

## Probar la demo

Requisitos: Node.js **22.12 o posterior** y npm. `better-sqlite3` puede necesitar herramientas de compilación C/C++ y las cabeceras de Node si no hay un binario disponible para tu plataforma.

Desde la raíz del repositorio:

```sh
cd v2
npm ci
DEMO_MODE=true npm run dev
```

Abre **http://localhost:5174**. En Arena, abre la vista previa de la interfaz en el puerto **5174**. El puerto 3002 es la API, no la interfaz de desarrollo.

Las credenciales precargadas de la demo son las mismas de la versión original y solo se habilitan con `DEMO_MODE=true`:

- Gestor: `olivia@northstar.io` (precargado en el formulario).
- Administrador: `ava@northstar.io`.
- Miembros: `marcus@northstar.io`, `priya@northstar.io`.
- Lector: `jonah@northstar.io`.
- Contraseña demo: `Northstar2026!`.

Los datos de ejemplo de esta versión están en español. No uses cuentas compartidas de demostración con datos reales. El modo demo no sustituye datos ya existentes.

## Crear un espacio limpio

En una terminal POSIX, desde `v2/`:

```sh
export DEMO_MODE=false
export V2_DB_PATH="./data/mi-espacio-v2.sqlite"
export BOOTSTRAP_TOKEN="$(openssl rand -hex 32)"
export APP_BASE_URL="http://localhost:5174"
npm run dev
```

El primer acceso solicita empresa, administrador, correo, contraseña y token de configuración. Comparte el token por un canal seguro: no lo añadas a URLs, logs ni al repositorio. Los usuarios de la versión original **no se importan automáticamente**; crea el administrador y nuevas invitaciones en esta base independiente.

No se cargan archivos `.env` automáticamente. Configura las variables en la terminal o en tu plataforma de despliegue.

## Conectar IA real · fast setup

1. Entra como **administrador**. En la demo utiliza `ava@northstar.io` y la contraseña demo indicada arriba; la cuenta precargada Olivia es gestora y no puede cambiar claves.
2. Abre **Configuración → Fast setup · IA real**.
3. Elige **OpenAI**, **Groq** u **OpenRouter** e introduce una clave API de ese proveedor. No la compartas en chats, capturas ni en el repositorio.
4. Conserva el modelo propuesto, escribe otro identificador o pulsa **Consultar modelos**. Los catálogos pueden contener modelos que no sean de chat: la prueba verificará la compatibilidad del elegido. La disponibilidad depende de tu cuenta y puede cambiar.
5. Decide si autorizas que los usuarios compartan contexto operativo. Por defecto está desactivado.
6. Pulsa **Probar y activar**. El servidor envía una consulta mínima real al proveedor, sin datos de trabajo, y **solo guarda la configuración si responde correctamente**. Necesitas una cuenta con saldo/cuota; esta prueba puede tener coste.
7. Abre el **Asistente del workspace** y selecciona **IA real**. El modo de reglas sigue disponible sin proveedor. La pregunta siempre se enviará al proveedor al usar IA; el contexto solo se adjunta si está autorizado y marcas expresamente su casilla.

### Seguridad y privacidad de IA

- Las peticiones salen del servidor a destinos fijos: `api.openai.com`, `api.groq.com` o `openrouter.ai`, por HTTPS. El navegador llama únicamente a `/api/ai/...`. No se aceptan URLs arbitrarias, redirecciones ni proveedores personalizados.
- La clave API se introduce en un campo de contraseña y viaja al servidor. No se guarda en localStorage ni vuelve en las respuestas de la API. Se cifra con **AES-256-GCM**, asociado al tenant, antes de persistirla en SQLite.
- Por defecto se crea `v2/data/ai-master.key`, de 32 bytes, con permisos `0600`. Persiste y respalda ese archivo **separadamente de SQLite**: perderlo impide descifrar las claves. `v2/data/` está excluido de Git.
- En producción puedes proporcionar `V2_AI_ENCRYPTION_KEY`, con 64 caracteres hexadecimales, desde tu gestor de secretos. Mantén el mismo valor al reiniciar. No cambies de clave/archivo sin un plan de recifrado o de reconfiguración; no hay rotación automática.
- Con contexto se envía una muestra de **hasta 25 proyectos, 25 tareas y 25 incidencias**, con textos recortados a 200 caracteres. Se excluyen responsables, correos, descripciones, reuniones, notas, invitaciones y sesiones. Los títulos pueden contener información sensible: revisa el uso permitido y las políticas del proveedor antes de autorizarlo.
- Los prompts y las respuestas no se persisten en el historial de la aplicación ni en la auditoría. El proveedor puede procesarlos o retenerlos según sus condiciones. La auditoría solo registra proveedor/modelo, autorización y desconexión.
- Tanto la IA como las reglas son de **solo lectura**. No hay herramientas ni ejecución de acciones. Las respuestas generativas pueden equivocarse y requieren revisión humana.
- Hay un límite persistido de **20 llamadas por usuario/empresa por minuto**, un timeout de 25 segundos y un máximo de 800 tokens de salida solicitados al proveedor. Los límites de gasto globales deben configurarse también en el proveedor.
- **Desconectar** elimina la clave cifrada de la configuración activa de este espacio, no las claves de otras empresas. Las copias de seguridad existentes no se borran automáticamente.

### Estado de las pruebas de conectividad

La integración hace llamadas HTTP reales a las APIs de los proveedores; no es una simulación en producción. Las pruebas automáticas usan respuestas controladas y no gastan créditos. **En el sandbox de Arena de esta sesión las conexiones salientes a estos proveedores no están permitidas**; para completar «Probar y activar», ejecuta la v2 en un entorno con acceso HTTPS al proveedor y usa tu propia clave. Si la red o la clave fallan, la interfaz muestra el error y no simula una respuesta de IA ni cambia de modo silenciosamente.

## Cambios implementados

### 1. Pruebas automáticas

```sh
npm test
npm run lint
npm run build
```

Las pruebas usan bases temporales y no tocan ni la demo ni los datos de la versión original. Cubren:

- Bootstrap de un solo uso, acceso y cierre de sesión.
- Permisos de administrador, gestor, miembro y lector.
- Aislamiento entre empresas, incluida la asignación de proyectos a tareas al crear y actualizar.
- Invitaciones de un solo uso, revocadas y caducadas.
- Persistencia, caducidad, almacenamiento hasheado y revocación de sesiones.
- Paginación, filtros y búsqueda aislada por empresa.
- Fechas locales, cambio de año y cambio de hora.
- Respuestas del asistente en español y ausencia de modificaciones de datos.
- Conectividad de los tres proveedores con respuestas controladas: cifrado, permisos, aislamiento, consentimiento, límites y errores sin filtrado de secretos.

### 2. Sesiones persistentes

Las sesiones se guardan en SQLite, no en un `Map`. Sobreviven a reinicios, caducan a las ocho horas y se revocan al cerrar sesión o desactivar la cuenta. Solo se guarda el hash SHA-256 del token de la cookie. La cookie mantiene `HttpOnly` y `SameSite=Strict`, y utiliza `Secure` con `NODE_ENV=production`.

Varias instancias que abran **el mismo archivo SQLite local** ven las mismas sesiones. Esto no equivale a un almacén distribuido: para despliegues en varias máquinas, incorpora Redis u otro almacén compartido adecuado.

### 3. Código dividido por responsabilidad

```text
src/
  App.jsx              # Composición, navegación y acciones
  pages/               # Una pantalla por archivo
  components/          # Formularios, acceso y componentes reutilizables
  hooks/               # Reloj, carga por pantalla y búsqueda
  lib/                 # API, fechas, traducciones y asistente de reglas
server/
  index.js             # Arranque del servidor
  app.js               # API operativa y composición de rutas
  auth.js              # Bootstrap, autenticación y aceptación de invitaciones
  database.js          # Esquema, compatibilidad y datos de demostración
  sessions.js          # Almacén persistente de sesiones
  resources.js         # Configuración, roles y conversión de recursos
  pagination.js        # Validación de paginación
  ai.js                # Proveedores reales, cifrado y contexto con consentimiento
```

### 4. Español y fechas actualizadas

La interfaz utiliza el catálogo central `src/lib/i18n.js`. Las traducciones de estados y roles son de presentación: los valores estables de la API no cambian. Los nombres y textos introducidos por el usuario no se traducen automáticamente.

El navegador calcula fechas por día local y actualiza el reloj cada 30 segundos y al recuperar visibilidad. El calendario convierte las horas de reuniones y eventos al día local, sin confundirlas con fechas UTC. Las fechas sin hora de las tareas conservan su día original.

El servidor usa `V2_TIME_ZONE`, o `TZ` si ya existe; si no se configura ninguna, utiliza `Europe/Madrid`. Ajusta `V2_TIME_ZONE` al calendario operativo de tu empresa.

### 5. Asistente con IA real o reglas locales

El usuario elige explícitamente entre reglas deterministas y un proveedor de IA real. Cada respuesta identifica su origen; una respuesta de reglas nunca se presenta como generativa. Los errores del proveedor se comunican sin sustituir silenciosamente la respuesta. Consulta el fast setup anterior para conectar el proveedor.

### 6. Carga por pantalla, paginación y búsqueda

El inicio solicita un resumen acotado, no todas las colecciones. Los listados principales usan páginas de 20 registros, con filtros de estado aplicados en el servidor y orden estable. La API admite `page` y `pageSize`, con un máximo de 100 registros por respuesta:

```text
GET /api/tasks?page=2&pageSize=20&status=Done
→ { items, page, pageSize, total, totalPages }
```

La búsqueda usa `/api/search?q=...`, con un máximo de seis resultados y aislamiento por empresa, sin depender de las páginas cargadas. Las solicitudes obsoletas se cancelan al cambiar de pantalla o consulta.

Los informes, el calendario, el asistente y algunas relaciones necesitan el conjunto completo de sus recursos: lo recorren mediante peticiones paginadas solo al abrir esas pantallas. **Todavía agregan datos en el navegador**; para grandes volúmenes, el siguiente paso son agregaciones y exportaciones en el servidor. Los informes indican «Todos los registros», no un periodo de 30 días que no se estaba aplicando. El CSV protege los prefijos de fórmulas en las celdas.

## Invitaciones por correo

Se conserva el envío SMTP opcional de la versión original. Define:

```sh
export APP_BASE_URL="https://tu-v2.example.com"
export SMTP_HOST="smtp.example.com"
export SMTP_PORT="587"
export SMTP_SECURE="false"
export SMTP_USER="mailer@example.com"
export SMTP_PASSWORD="<secreto-del-proveedor>"
export SMTP_FROM="Northstar Work <mailer@example.com>"
```

`APP_BASE_URL` debe ser la URL **pública de esta v2**, también al usar la vista previa de Arena. El valor de desarrollo por defecto es `http://localhost:5174`; no sirve como enlace para personas que acceden a una vista previa remota. Reinicia el servidor después de cambiar variables. Si no se envía el correo, un administrador puede copiar el enlace y compartirlo por un canal seguro.

## Producción

```sh
cd v2
npm ci
npm run build
NODE_ENV=production DEMO_MODE=false PORT=3002 npm start
```

Express sirve la interfaz compilada y `/api` desde el mismo origen. Configura HTTPS, `APP_BASE_URL`, un volumen persistente para `v2/data/` o `V2_DB_PATH`, y las variables SMTP si corresponde. Las llamadas del navegador usan rutas relativas, nunca un `localhost` de otro servicio.

La v2 sigue siendo un MVP: antes de almacenar datos reales faltan, entre otros, recuperación de contraseña, copias y restauraciones verificadas, políticas de retención, revisión de seguridad y un limitador de intentos compartido para varias instancias. Las integraciones de calendario, Slack y Teams siguen sin implementarse. Hay conectividad de IA opcional con configuración por empresa; no hay una migración automática desde v1.
