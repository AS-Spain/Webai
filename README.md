# Northstar Work

Workspace de operaciones con panel, tareas, proyectos, reuniones, eventos, incidencias, reglas de automatización y reportes.

## Ejecutar en local

Requisitos: Node.js 20.19+ o 22.12+ y npm.

```sh
npm install
export DEMO_MODE=false
export BOOTSTRAP_TOKEN="$(openssl rand -hex 32)"
export APP_BASE_URL="http://localhost:5173"
npm run dev
```

Abre `http://localhost:5173`. El primer acceso pedirá nombre de empresa, nombre y correo del administrador, una contraseña nueva y el token de configuración. Entrega ese token al admin por un canal seguro; no lo pongas en una URL, repositorio o log. Vite reenvía `/api` al servidor Express local en `http://localhost:3001`.

Para activar los datos demo en una base vacía, usa `DEMO_MODE=true npm run dev`. Las cuentas compartidas solo existen en ese modo de desarrollo:

- Admin: `ava@northstar.io`
- Manager: `olivia@northstar.io`
- Member: `marcus@northstar.io` o `priya@northstar.io`
- Viewer: `jonah@northstar.io`
- Contraseña para todas las cuentas demo: `Northstar2026!`

La base persistente se crea en `data/webai.sqlite` al iniciar el servidor. Para producción, ejecuta `npm run build` y luego `npm start`; configura `PORT`, `DB_PATH` y `NODE_ENV=production` según el entorno.

`DEMO_MODE` está desactivado por defecto y no borra datos preexistentes. Para probar un alta limpia sin tocar una base local existente, configura `DB_PATH` con una ruta SQLite nueva. El token de bootstrap debe tener al menos 32 caracteres; el primer alta lo invalida en el proceso y solo se admite si no hay usuarios.

## Configurar correo de invitaciones

La aplicación envía el correo mediante SMTP usando Nodemailer. No usa la API de Gmail ni OAuth2. Configura estos valores en el entorno del servidor antes de arrancar; no guardes contraseñas en el código, README o repositorio.

1. Obtén los datos SMTP del proveedor de correo. Para STARTTLS suele usarse el puerto `587` con `SMTP_SECURE=false`; para TLS implícito, el `465` con `SMTP_SECURE=true`. El remitente debe estar autorizado por el proveedor.
2. Define la URL pública de la aplicación y las credenciales SMTP en el entorno:

```sh
export APP_BASE_URL="https://ops.example.com"
export SMTP_HOST="smtp.example.com"
export SMTP_PORT="587"
export SMTP_SECURE="false"
export SMTP_USER="mailer@example.com"
export SMTP_PASSWORD="<secreto-del-proveedor>"
export SMTP_FROM="Northstar Work <mailer@example.com>"
```

3. Reinicia el servidor para que cargue esas variables. En este proyecto no se carga un archivo `.env` automáticamente; usa el gestor de secretos o la configuración de variables de tu entorno de despliegue.
4. Inicia sesión como admin, abre **People**, pulsa **Invite person**, introduce el correo y el rol, y crea la invitación. La respuesta indicará si el proveedor aceptó el envío.
5. Si el envío falla o no se configuró SMTP, copia el enlace que aparece en **People** y compártelo por un canal seguro. El enlace caduca en 48 horas y solo se puede usar una vez.

### Gmail y Google Workspace

Para una cuenta Gmail, el ejemplo habitual es `SMTP_HOST=smtp.gmail.com`, puerto `465` y `SMTP_SECURE=true`. La cuenta normalmente requiere verificación en dos pasos y una **contraseña de aplicación**; no uses la contraseña normal de Google. En Google Workspace, la organización puede bloquear contraseñas de aplicación o SMTP autenticado: consulta al administrador para configurar un relay SMTP permitido. Este MVP no implementa OAuth2 para Gmail.

Para probar sin enviar correo real, deja `SMTP_HOST` sin configurar: se generará la invitación y podrás copiar su enlace desde **People**. Si se configura un proveedor de pruebas, verifica ahí el mensaje antes de usar un servidor SMTP real.

## API y servicios externos

No se utiliza ninguna API externa de IA. Express es la API REST propia de esta aplicación y SQLite se ejecuta localmente. El asistente consulta los datos del workspace con reglas explícitas; no es un modelo generativo. SMTP es opcional para entregar invitaciones. Las pruebas de automatización inspeccionan datos locales y registran actividad, pero no envían notificaciones externas.

Google Calendar, Outlook, Slack y Teams aparecen como integraciones desconectadas. OAuth, importadores de archivos, correo, calendario sincronizado, invitaciones, webhooks y proveedores de IA requieren implementación y credenciales propias antes de poder activarse.

## Alcance funcional del MVP

- Bootstrap del primer admin mediante token de operador de un solo uso; el admin establece su propia contraseña. Invitaciones por correo con roles, token hasheado, caducidad, aceptación única y revocación.
- Inicio de sesión con contraseña derivada mediante scrypt y cookie `HttpOnly`, `SameSite=Strict`, con vencimiento de ocho horas.
- Consultas y escrituras de proyectos, tareas, reuniones, eventos e incidencias; las incidencias se resuelven, no se borran.
- Roles aplicados en el servidor y reflejados en la interfaz: admin tiene acceso completo y administra automatizaciones; manager gestiona proyectos/eventos y puede borrar registros; member crea y actualiza tareas, reuniones e incidencias, pero no borra; viewer solo consulta.
- Borrar un proyecto requiere admin o manager. Las tareas vinculadas se conservan sin proyecto y cada desvinculación y borrado queda en el registro de actividad.
- Aislamiento de filas por tenant. El demo incluye un solo tenant. Las cuentas demo se precargan únicamente si `DEMO_MODE=true`; el aprovisionamiento de otras empresas sigue siendo una operación de despliegue/administración.
- Registro de actividad con actor, fecha, motivo y valores anterior/posterior en cada modificación. No hay endpoint de edición o borrado del registro de auditoría.
- Datos de ejemplo para demostrar panel, calendario, vistas de equipo, incidencias y reportes CSV.
- Las recomendaciones de incidencias son sugerencias de reglas; requieren revisión humana. No se aprueban pagos ni se ejecutan acciones financieras.

El MVP no sustituye controles de producción: antes de desplegarlo con datos reales hay que incorporar gestión de identidad y recuperación, sesiones compartidas/almacenadas de forma segura, controles de privacidad y retención, copias de seguridad, cifrado del volumen, provisión de tenants y pruebas de seguridad.
# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
