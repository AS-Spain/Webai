# Integraciones externas de Northstar v2

## Qué está implementado

| Proveedor | Operaciones manuales desde Configuración |
| --- | --- |
| Google Calendar | Listar calendarios, consultar eventos de un intervalo y crear un evento externo sin asistentes. |
| Microsoft Outlook | Listar calendarios, consultar y crear eventos; enviar un correo de texto a un destinatario. |
| Slack | Listar canales públicos y enviar un mensaje de texto a un canal al que tenga acceso el bot. |
| Microsoft Teams | Listar equipos y canales; enviar un mensaje a un canal; crear un enlace de reunión online. |

**No son botones de muestra**: utilizan las APIs del proveedor una vez completado OAuth. No se conectan solas ni incluyen aplicaciones registradas o credenciales ajenas. Las cuentas son **compartidas por el espacio**: todos sus administradores pueden ejecutar operaciones desde la cuenta conectada. Miembros y gestores solo consultan el estado de conexión.

La demo pública **no acepta secretos, consentimiento OAuth ni operaciones externas**, aunque se seleccione el perfil de administrador de ejemplo. La aplicación original fuera de `v2/` no se modifica. La configuración del proveedor IA sigue siendo independiente y exclusiva de administradores.

## Preparar el servidor

1. Utiliza la aplicación **normal**, una base privada y un dominio público estable con HTTPS.
2. Define `APP_BASE_URL` como el origen exacto donde quieres recibir los callbacks, sin rutas ni parámetros. El valor se usa para generar URLs, no para autenticar usuarios. HTTP solo se admite para localhost/loopback durante desarrollo.

   ```bash
   cd v2
   export APP_BASE_URL=https://northstar.tu-dominio.example
   npm run build
   npm start
   ```

   En desarrollo puedes usar `APP_BASE_URL=http://localhost:5174 npm run dev`. El proxy de Vite reenvía los callbacks. La aplicación **no carga archivos .env automáticamente**: configura las variables en el shell o en tu gestor de procesos.
3. Permite acceso HTTPS saliente del servidor a:
   - `oauth2.googleapis.com` y `www.googleapis.com`.
   - `login.microsoftonline.com` y `graph.microsoft.com`.
   - `slack.com`.
4. Permite al navegador abrir las páginas de consentimiento de Google, Microsoft y Slack y regresar a tu callback. Los entornos con restricciones de salida, incluida esta sesión de desarrollo, pueden impedir el intercambio real de tokens aunque la interfaz esté instalada. Despliega en un servidor con esa conectividad o solicita al operador que la habilite. No hay un mecanismo para saltarse las restricciones de red.
5. Los nombres de vista previa de un sandbox pueden cambiar. Para una integración duradera registra un dominio estable; si cambia la URL, actualiza `APP_BASE_URL` y los redirects registrados en cada proveedor y vuelve a autorizar.

El callback puede estar en un origen diferente del frontend (por ejemplo, backend 3002 y web 5174). La interfaz consulta el estado autenticado, sin recibir tokens por postMessage ni depender de que el proveedor devuelva la cookie de la vista incrustada. La sesión temporal del modo normal también sirve para iniciar el flujo. OAuth sigue requiriendo un administrador activo al comenzar y al finalizar.

## Registrar las aplicaciones

En **Configuración → Servicios conectados → Configurar**, copia la URL de retorno exacta que muestra la aplicación. No uses una URL inventada ni una URL con un token. Para el origen del ejemplo:

| ID | Callback |
| --- | --- |
| `google` | `https://northstar.tu-dominio.example/api/integrations/google/callback` |
| `outlook` | `https://northstar.tu-dominio.example/api/integrations/outlook/callback` |
| `slack` | `https://northstar.tu-dominio.example/api/integrations/slack/callback` |
| `teams` | `https://northstar.tu-dominio.example/api/integrations/teams/callback` |

### Google Calendar

- Crea un proyecto en Google Cloud, activa **Google Calendar API** y configura la pantalla de consentimiento.
- Registra un cliente OAuth de tipo **aplicación web** con el callback exacto.
- Permisos solicitados: `https://www.googleapis.com/auth/calendar.events` y `https://www.googleapis.com/auth/calendar.calendarlist.readonly`.
- Añade usuarios de prueba si la aplicación está en modo de pruebas. Según audiencia y permisos puede ser necesaria verificación del proveedor. Las autorizaciones de aplicaciones en pruebas pueden tener una duración limitada: no se garantiza un refresh token indefinido.
- Guarda Client ID y Client secret, pulsa **Conectar con OAuth**, selecciona la cuenta adecuada y acepta. Se solicita acceso offline y consentimiento para permitir renovación.

### Outlook

- Registra una aplicación **confidencial web**, no una SPA, en Microsoft Entra ID.
- Añade el callback de `outlook` como redirect de tipo Web; crea un secreto de cliente y copia **su valor**, no su ID.
- Configura permisos **delegados** Microsoft Graph: `Calendars.ReadWrite`, `Mail.Send` y acceso `offline_access`.
- Introduce el UUID del tenant o `organizations`. `common` puede utilizarse si el registro admite ese tipo de cuenta. La política del directorio puede exigir consentimiento del administrador.
- El correo sale desde la cuenta Microsoft autorizada. No se leen mensajes ni adjuntos.

### Slack

- Crea una aplicación Slack y añade el redirect OAuth de `slack`.
- Permisos de bot: `chat:write` y `channels:read`.
- Copia Client ID y Client secret, autoriza la instalación en el workspace correcto e **invita el bot al canal** antes de enviar mensajes.
- La aplicación no solicita acceso general a canales privados ni `chat:write.public`. La lista solo consulta canales públicos. Un ID de canal privado solo funciona si el bot ya tiene acceso y los permisos concedidos lo permiten.
- Slack utiliza su OAuth v2 con `state`; no se envía un challenge PKCE que ese flujo no soporte. Si la instalación utiliza tokens rotatorios y devuelve `refresh_token`/`expires_in`, se renuevan automáticamente.

### Teams

- Registra una aplicación web confidencial en Microsoft Entra ID con el callback de `teams`.
- Permisos delegados: `Team.ReadBasic.All`, `Channel.ReadBasic.All`, `ChannelMessage.Send`, `OnlineMeetings.ReadWrite`, además de `offline_access`.
- El tenant, la cuenta, su licencia y las políticas de Teams deben permitir las operaciones. No es un flujo de credenciales de aplicación ni permite suplantar otros usuarios.
- Listar equipos no concede pertenencia a canales; se envía como el usuario autorizado. Crear una reunión genera un enlace Teams, **no añade una entrada al calendario**. Para esto último utiliza Outlook.
- El consentimiento y la disponibilidad real dependen del tenant y del proveedor; si se rechazan, la interfaz muestra un error y no finge éxito.

## Configuración, uso y desconexión

1. Un administrador guarda las credenciales de cada proveedor en el formulario privado. El secreto se borra del campo al guardar y no se devuelve en lecturas posteriores. Un campo vacío conserva el secreto solo si no cambia el Client ID.
2. Guardar cambios desconecta la autorización anterior y exige una nueva. Si necesitas revocar el consentimiento anterior, **desconecta antes de cambiar credenciales**.
3. **Conectar con OAuth** abre una ventana de consentimiento tras el clic del usuario. Permite ventanas emergentes. La interfaz consulta automáticamente el estado y también ofrece **Actualizar estado**.
4. Algunos proveedores aíslan su ventana con COOP; por eso no se interpreta `window.closed` como un fallo ni se usan mensajes del popup para aceptar tokens. **Dejar de esperar** detiene la espera de la interfaz y trata de cerrar la ventana; no revoca un consentimiento que ya se haya completado. Actualiza el estado y usa **Desconectar cuenta** si quieres retirarlo.
5. Una vez conectado, elige una operación. Los calendarios/canales/equipos listados tienen un botón **Usar** para rellenar el destino. Las escrituras requieren confirmación expresa y se registran en la auditoría sin incluir cuerpo de mensajes, destinatarios ni credenciales.
6. Desconectar elimina inmediatamente tokens y estados locales. Se intenta revocar Google y Slack. Microsoft no tiene aquí una revocación individual equivalente; retira el consentimiento desde las aplicaciones autorizadas de la cuenta/organización. Si la revocación remota falla, la interfaz lo indica: la desconexión local no prueba que el proveedor haya revocado sus credenciales.
7. Puedes eliminar la configuración después de desconectar. Borrar datos locales no sustituye la revocación del proveedor.

## Seguridad y persistencia

- Client secrets, access tokens, refresh tokens y verificadores PKCE se cifran con **AES-256-GCM**, ligados a empresa, proveedor y tipo de secreto. La base SQLite no contiene sus valores en claro.
- Se crea `v2/data/integrations-master.key` con permisos **0600** al guardar la primera credencial. Alternativamente configura `V2_INTEGRATIONS_ENCRYPTION_KEY` con 64 caracteres hexadecimales (32 bytes). No se envía esta clave al navegador ni se guarda en Git. No comparte la clave maestra de IA.
- **Haz copia privada de la base y de su clave maestra**. Perder o cambiar la clave impide descifrar credenciales existentes. Restaura la clave original o desconecta, revoca el consentimiento en el proveedor, reemplaza credenciales y vuelve a autorizar. No rotes la clave sin migrar los datos.
- El estado OAuth es aleatorio de 256 bits; solo se guarda su hash, está ligado a administrador/empresa/proveedor/configuración, caduca en diez minutos y es de un solo uso. Google y Microsoft usan PKCE S256. No hay tokens de acceso en URLs ni almacenamiento del navegador.
- La renovación tiene exclusión de solicitudes concurrentes y comprobación de versión/ciphertext para no resucitar conexiones tras desconectar o cambiar configuración. Un refresh revocado elimina la conexión local. Un 401 de un proveedor no cierra la sesión de Northstar.
- Destinos y endpoints están limitados a los proveedores implementados: no se aceptan URLs OAuth/API arbitrarias, redirecciones HTTP de upstream ni enlaces de paginación que puedan reenviar secretos a otro dominio.
- Hay tiempo máximo de 20 segundos por llamada y límite de 30 operaciones por administrador y minuto. Los errores externos se sustituyen por mensajes controlados, no por respuestas crudas con posibles secretos.

## Alcance y límites

- Es una implementación de **conexión y operaciones manuales**, no un motor de sincronización bidireccional. Los eventos externos consultados no se importan automáticamente a `events`/`meetings` locales, ni se exportan todos los eventos del workspace.
- Las automatizaciones existentes no comienzan a enviar notificaciones al conectar un proveedor. No hay trabajos periódicos, webhooks, recepción de mensajes ni suscripciones automáticas.
- Las listas están acotadas: hasta 100 calendarios/canales/equipos y 50 eventos; se indica si hay más. No se siguen páginas automáticamente. Introduce un ID autorizado cuando el destino no esté en la primera página.
- Consultas de eventos e intervalos de creación limitados a 31 días. Las fechas de formulario se convierten desde la zona del navegador a ISO UTC. Los eventos creados no envían invitaciones a asistentes.
- Los envíos no se reintentan automáticamente tras errores de red. Si no llega una confirmación, comprueba primero el proveedor antes de repetir una escritura: no se garantiza entrega exactamente una vez. El correo aceptado por Graph no equivale a entrega confirmada al destinatario.
- Las pruebas automáticas usan proveedores simulados, sin cuentas ni cargos reales. Se comprueban protocolos, permisos, cifrado, callbacks, renovación y desconexión. La validación real requiere tus registros de aplicaciones, consentimiento, licencias y conectividad externa.
