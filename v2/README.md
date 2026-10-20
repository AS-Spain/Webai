# Northstar Work · v2

Versión independiente de la aplicación. **La versión original de la raíz no se ha modificado.** No es necesario sustituir sus archivos ni migrar su base de datos para probar esta versión.

## Separación entre versiones

| Recurso | Original | v2 |
| --- | --- | --- |
| Código | Raíz del repositorio | `v2/` |
| Interfaz en desarrollo | `5173` | `5174` |
| API por defecto | `3001` | `3002` |
| Base de datos por defecto | `data/webai.sqlite` | `v2/data/webai-live.sqlite` |
| Cookie | `webai_session` | `webai_v2_private_session` |
| Tema guardado | — | `northstar-v2-theme` |

La v2 **no lee `DB_PATH`**: usa `V2_DB_PATH` para evitar reutilizar por accidente una variable de la versión original. No apuntes `V2_DB_PATH` a la base de datos original. Ambas versiones pueden ejecutarse al mismo tiempo con sus puertos predeterminados.

## Demo y aplicación normal: dos entornos independientes

Requisitos: Node.js **22.12 o posterior** y npm. `better-sqlite3` puede necesitar herramientas C/C++ y cabeceras de Node si no hay un binario para tu plataforma.

Desde la raíz del repositorio:

```sh
cd v2
npm ci
npm run build
```

### Probar sin registro

```sh
npm run demo
```

Abre **http://localhost:3003** (en Arena, la vista previa **Northstar v2 · Demo**, puerto **3003**). Elige un perfil y entra con un clic, sin correo ni contraseña. No se inicia ni se vuelve a intentar una sesión automáticamente al cargar la página. La franja **DEMO · Datos de ejemplo** permite cambiar entre administrador, gestor, miembro y solo lectura. Si sales, podrás volver a entrar con un clic.

La demo tiene su propio SQLite (`v2/data/webai-demo.sqlite` por defecto), su cookie `webai_v2_demo_session` y su variable `V2_DEMO_DB_PATH`. **Ignora `V2_DB_PATH`** para no abrir accidentalmente una base privada. Se rechaza configurar ambos modos con la misma ruta de SQLite. La base guarda además su modo: no se permite abrir una base privada como demo ni una base con usuarios de ejemplo como aplicación normal, aunque se cambie su ruta o se utilice un alias.

Es una demo compartida: no introduzcas datos reales ni secretos. El envío SMTP está desactivado. La configuración de IA de la demo solo admite servidores locales sin claves; las conexiones privadas y las claves de pago pertenecen a la aplicación normal. No se permite reutilizar claves antiguas guardadas en una base demo.

Para funcionar también cuando el navegador bloquea cookies de terceros en la vista previa, la demo usa una sesión de prueba **solo en memoria del navegador**, que se renueva automáticamente ante una caducidad. No se guarda en localStorage/sessionStorage ni se transmite en URLs. Este mecanismo **no está habilitado en la aplicación normal**. Al recargar o cerrar sesión, se vuelve a la pantalla de perfiles. Ante un fallo permanente de autenticación se detiene tras una renovación y un reintento; puedes volver a entrar manualmente. Una renovación antigua no puede cerrar una sesión nueva.

### Aplicación normal

En otra terminal, desde `v2/`:

```sh
npm start
```

Abre **http://localhost:3002** (vista previa **Northstar v2 · Aplicación normal**, puerto **3002**). Mantiene el inicio de sesión privado, utiliza la nueva cookie `webai_v2_private_session` e ignora las cookies de demos antiguas. Tras actualizar, los usuarios privados deben iniciar sesión de nuevo una vez. No admite el acceso automático de demo. En una base nueva requiere configurar el administrador inicial como se explica abajo. No importa usuarios ni datos de la demo. Las bases antiguas de pruebas (`webai-v2.sqlite`, `preview-*.sqlite`) se conservan, pero no se abren automáticamente. Si ya tenías una base privada real, indícala explícitamente con `V2_DB_PATH`, nunca con la variable de demo.

`npm start` fuerza modo normal y `npm run demo` fuerza modo demo, incluso si se heredó otro valor de `DEMO_MODE`. Cada uno admite `PORT` como override explícito; usa puertos diferentes si los ejecutas a la vez.

### Desarrollo con Vite

- `npm run dev`: web normal **5174**, API **3002**.
- `npm run dev:demo`: demo **5175**, API **3003**. Los archivos de datos, SQLite y secretos no se vigilan. Para una vista estable sin el cliente de desarrollo ni sus reconexiones HMR, usa `npm run build` y `npm run demo` en **3003**.

Vite reenvía `/api` al backend correspondiente; el navegador nunca llama a un `localhost` remoto. No se cargan archivos `.env` automáticamente.

## Crear un espacio limpio

En una terminal POSIX, desde `v2/`:

```sh
export DEMO_MODE=false
export V2_DB_PATH="./data/mi-espacio-v2.sqlite"
export APP_BASE_URL="http://localhost:5174"
npm run dev
```

En el **primer inicio de la aplicación normal**, si la base aún no tiene usuarios, abre directamente **http://localhost:3002** (o la vista previa normal de Arena). El token aparece **ya cargado, con sus letras y números visibles**. No necesitas enlaces privados, terminal ni archivos. Puedes **Copiar token** para pegarlo en tu gestor de contraseñas y **Ocultar/mostrar**. El portapapeles no es un almacén seguro ni el botón guarda una copia automáticamente.

**Completa el alta antes de publicar o compartir la web: el primer visitante podrá crear el administrador.** Para reducir exposiciones posteriores, el primer navegador reserva el acceso al token durante 15 minutos mediante una cookie HttpOnly y un identificador hash persistido en SQLite. Ese mismo navegador puede recargar; otro navegador no recibe el token mientras la reserva siga vigente. Al caducar puede volver a reservarse. Si el navegador bloquea todas las cookies, el primer acceso funciona pero debes completar el formulario sin recargar. Esta reserva limita el acceso: no verifica la identidad de quien llega primero ni reemplaza un control de acceso del despliegue.

El servidor genera un `BOOTSTRAP_TOKEN` criptográfico de 256 bits y lo entrega al navegador reservado mediante `POST /api/setup/claim`, sin caché. No aparece en `/api/setup/status`, URLs, logs ni paquetes JavaScript. La interfaz lo mantiene solo en memoria, sin localStorage/sessionStorage, y borra su estado al terminar. Crea empresa, administrador, correo y contraseña; después se invalida el token, se borra la reserva y el acceso automático deja de estar disponible. La demo nunca dispone de esta función y las bases con usuarios existentes muestran el acceso normal.

### Instalación pública con control del operador (opcional)

Si todavía no puedes completar el alta antes de exponer el servidor, configura **`V2_SETUP_AUTO_TOKEN=false`**. Esto desactiva la entrega automática por HTTP. En ese modo el operador puede proporcionar el token o el enlace privado desde `<ruta-de-la-base>.bootstrap-token.local` / `.bootstrap-link.local`. Los archivos tienen permisos `0600`, están excluidos de Git, sobreviven reinicios previos al alta y se eliminan al crear el administrador. El enlace alternativo lleva el token únicamente en el fragmento `#setup=...`, que la interfaz retira con `replaceState`. No compartas ese enlace ni el token en espacios públicos.

Puedes proporcionar `BOOTSTRAP_TOKEN` desde tu gestor de secretos (al menos 32 caracteres), con prioridad sobre la generación automática. Para que solo lo conozca el operador, combínalo con `V2_SETUP_AUTO_TOKEN=false`. Un valor explícito demasiado corto detiene el arranque. La carpeta de la base debe ser escribible por el usuario del servidor. Los usuarios de la versión original **no se importan automáticamente**.

No se cargan archivos `.env` automáticamente. Configura las variables en la terminal o en tu plataforma de despliegue.

## Conectar IA local o de nube · fast setup

**Solo el admin configura una conexión compartida y todos los usuarios del workspace usan ese mismo proveedor y modelo.** Si todavía no tienes modelos, sigue la [guía de instalación local con Ollama o LM Studio](LOCAL_AI.md).

1. Entra como **administrador**. En la aplicación normal usa tu administrador. La demo entra automáticamente con un administrador de prueba y no admite claves privadas.
2. Abre **Configuración → Fast setup · IA real**.
3. Elige **Ollama · local**, **LM Studio · local** u **Otro servidor compatible con OpenAI**. En local normalmente no necesitas clave: indica la URL `/v1` de un servidor de modelos ya instalado y en marcha. También se conservan OpenAI, Groq y OpenRouter como opciones de nube con clave API. No compartas secretos en chats, capturas ni en el repositorio.
4. Pulsa **Consultar modelos** para elegir uno instalado/disponible o escribe su identificador. Ollama propone `qwen2.5:3b`; LM Studio necesita el identificador del modelo que hayas cargado. Los catálogos pueden contener modelos que no sean de chat: la prueba verificará la compatibilidad del elegido. La disponibilidad depende de tu cuenta y puede cambiar.
5. Decide si autorizas que los usuarios compartan contexto operativo. Por defecto está desactivado.
6. Pulsa **Probar y activar**. El servidor envía una consulta mínima real al proveedor, sin datos de trabajo, y **solo guarda la configuración si responde correctamente**. En local necesitas tener el motor y un modelo cargados; no necesitas una cuenta de OpenAI. En nube necesitas una cuenta con saldo/cuota y la prueba puede tener coste.
7. Abre el **Asistente del workspace** y selecciona **IA local** o **IA real**, según la conexión compartida. El modo de reglas sigue disponible sin proveedor. La pregunta siempre se enviará al proveedor al usar IA; el contexto solo se adjunta si está autorizado y marcas expresamente su casilla.

### Seguridad y privacidad de IA

- Las peticiones salen del servidor Express a la API local `/v1` o a los destinos fijos de nube. El navegador llama únicamente a `/api/ai/...`. Se bloquean redirecciones y destinos arbitrarios: otros puertos, redes privadas y contenedores requieren `V2_AI_ALLOWED_ORIGINS`, autorizado por el operador. Consulta [LOCAL_AI.md](LOCAL_AI.md).
- La clave API se introduce en un campo de contraseña y viaja al servidor. No se guarda en localStorage ni vuelve en las respuestas de la API. Se cifra con **AES-256-GCM**, asociado al tenant, antes de persistirla en SQLite.
- Si guardas un token o clave se crea por defecto `v2/data/ai-master.key`, de 32 bytes, con permisos `0600`. Persiste y respalda ese archivo **separadamente de SQLite**: perderlo impide descifrar las claves. `v2/data/` está excluido de Git.
- En producción puedes proporcionar `V2_AI_ENCRYPTION_KEY`, con 64 caracteres hexadecimales, desde tu gestor de secretos. Mantén el mismo valor al reiniciar. No cambies de clave/archivo sin un plan de recifrado o de reconfiguración; no hay rotación automática.
- Con contexto se envía una muestra de **hasta 25 proyectos, 25 tareas y 25 incidencias**, con textos recortados a 200 caracteres. Se excluyen responsables, correos, descripciones, reuniones, notas, invitaciones y sesiones. Los títulos pueden contener información sensible: revisa el uso permitido y las políticas del proveedor antes de autorizarlo.
- Los prompts y las respuestas no se persisten en el historial de la aplicación ni en la auditoría. El proveedor puede procesarlos o retenerlos según sus condiciones. La auditoría solo registra proveedor/modelo, autorización y desconexión.
- Tanto la IA como las reglas son de **solo lectura**. No hay herramientas ni ejecución de acciones. Las respuestas generativas pueden equivocarse y requieren revisión humana.
- Hay un límite persistido de **20 llamadas por usuario/empresa por minuto**, un timeout de 120 segundos en local o 25 segundos en nube y un máximo de 800 tokens de salida solicitados al proveedor. Los límites de gasto globales deben configurarse también en el proveedor.
- **Desconectar** elimina la clave cifrada de la configuración activa de este espacio, no las claves de otras empresas. Las copias de seguridad existentes no se borran automáticamente.

### Estado de las pruebas de conectividad

La integración hace llamadas HTTP reales a las APIs compatibles; no es una simulación en producción. Las pruebas automáticas usan respuestas controladas y un servidor HTTP local de prueba; no gastan créditos ni ejecutan un LLM real. **No se ha instalado un motor de modelos en Arena, y las conexiones salientes a los proveedores de nube están bloqueadas en esta sesión.** Para usar IA local, ejecuta Ollama o LM Studio junto a la aplicación, o autoriza un servidor de modelos accesible. Para nube necesitas salida HTTPS al proveedor y tu propia clave. Si la red o la clave fallan, la interfaz muestra el error y no simula una respuesta de IA ni cambia de modo silenciosamente.

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
- Separación de base/cookie/puerto de la demo, entrada y renovación sin cookies, rechazo del acceso demo en la web privada y restricciones de claves.
- Retorno al login cuando caduca una sesión privada y protección frente a renovaciones tardías tras salir.
- Aislamiento entre empresas, incluida la asignación de proyectos a tareas al crear y actualizar.
- Invitaciones de un solo uso, revocadas y caducadas.
- Persistencia, caducidad, almacenamiento hasheado y revocación de sesiones.
- Paginación, filtros y búsqueda aislada por empresa.
- Fechas locales, cambio de año y cambio de hora.
- Respuestas del asistente en español y ausencia de modificaciones de datos.
- Conectividad de los proveedores locales y de nube con respuestas controladas, servidor HTTP local de prueba y migración de configuraciones anteriores: cifrado, permisos, aislamiento, consentimiento, límites y errores sin filtrado de secretos.

### 2. Sesiones persistentes

Las sesiones privadas se guardan en SQLite, no en un `Map`. Sobreviven a reinicios, caducan a las ocho horas y se revocan al cerrar sesión o desactivar la cuenta. Solo se guarda el hash SHA-256 del token de la cookie. La cookie privada mantiene `HttpOnly`, `SameSite=Strict` y `Secure` con `NODE_ENV=production`. En hosts de vista previa `*.e2b.app` usa `Secure; SameSite=None; Partitioned` para permitir el iframe sin compartir la cookie entre sitios. La caducidad durante el uso devuelve al formulario de acceso, no deja el panel bloqueado con un aviso. La sesión de prueba en memoria está restringida al servidor demo.

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
  ai.js                # Conexión compartida, cifrado y contexto con consentimiento
  ai-providers.js      # Perfiles OpenAI-compatible y destinos autorizados
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

Express sirve la interfaz compilada y `/api` desde el mismo origen. Configura HTTPS, `APP_BASE_URL`, un volumen persistente para `v2/data/` o `V2_DB_PATH` (la demo utiliza `V2_DEMO_DB_PATH`), y las variables SMTP si corresponde. Las llamadas del navegador usan rutas relativas, nunca un `localhost` de otro servicio.

La v2 sigue siendo un MVP: antes de almacenar datos reales faltan, entre otros, recuperación de contraseña, copias y restauraciones verificadas, políticas de retención, revisión de seguridad y un limitador de intentos compartido para varias instancias. Las integraciones de calendario, Slack y Teams siguen sin implementarse. Hay conectividad de IA opcional con configuración por empresa; no hay una migración automática desde v1.
