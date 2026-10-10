# Ark

Plataforma web para organizar, coordinar y dar seguimiento a proyectos de arquitectura desde un único espacio de trabajo.

> **Nombre del proyecto:** la aplicación y sus identificadores internos utilizan la marca **Ark**.

## Presentación

En pequeños y medianos estudios de arquitectura, la información de un proyecto suele quedar distribuida entre hojas de cálculo, correos, mensajes, carpetas y distintas versiones de un mismo documento. Esta dispersión dificulta conocer el avance real, identificar responsabilidades y conservar la trazabilidad de las decisiones.

Ark reúne en un mismo entorno la planificación, los documentos, los entregables, los costos, la comunicación del equipo y la participación del cliente. La plataforma también incorpora herramientas de diseño para importar y calibrar planos, trabajar con geometría 2D y visualizar una representación tridimensional del proyecto.

El objetivo no es reemplazar el criterio profesional del arquitecto, sino ofrecer una base ordenada para coordinar el trabajo y mantener accesible la información relevante de cada proyecto.

## ¿A quién está dirigida?

| Usuario | Necesidad principal | Participación en Ark |
| --- | --- | --- |
| Propietario o arquitecto responsable | Supervisar el proyecto y controlar el acceso | Administra el equipo, las tareas, los documentos, los costos, los entregables y las revisiones |
| Colaborador | Ejecutar y comunicar el trabajo asignado | Actualiza tareas, planos, documentos, incidencias y comentarios según sus permisos |
| Cliente | Conocer el avance compartido y tomar decisiones | Consulta entregables autorizados, revisa documentos y aprueba o solicita cambios |
| Personal administrativo | Dar seguimiento a fechas, costos y documentación | Consulta información operativa, partidas presupuestarias y reportes |

## Flujo general de uso

```mermaid
flowchart LR
    A[Crear cuenta o iniciar sesión] --> B[Crear proyecto o aceptar invitación]
    B --> C[Configurar equipo y roles]
    C --> D[Planificar tareas, hitos y calendario]
    D --> E[Trabajar con planos y documentos]
    E --> F[Registrar incidencias, comentarios y costos]
    F --> G[Preparar paquete de entrega]
    G --> H[Compartir con el cliente]
    H --> I[Aprobar o solicitar cambios]
    I --> J[Consultar historial y generar reporte]
    I -->|Requiere ajustes| D
```

### 1. Acceso y creación del espacio de trabajo

En la primera ejecución se registra la cuenta propietaria del estudio. Desde el portafolio se puede crear un proyecto, consultar los proyectos existentes o ingresar a uno mediante una invitación vigente.

Cada proyecto funciona como un espacio independiente. Los usuarios solo pueden consultar la información de los proyectos que crearon o a los que fueron incorporados.

### 2. Organización del equipo

El propietario invita arquitectos, colaboradores o clientes mediante enlaces con vencimiento. Los permisos se aplican tanto en la interfaz como en la API para evitar que un usuario acceda directamente a recursos no autorizados.

Los integrantes aceptados pueden ser asignados a tareas y revisiones. La carga de trabajo del equipo se presenta como información de apoyo para la coordinación.

### 3. Planificación

El equipo organiza el proyecto mediante:

- Tareas con responsable, disciplina, prioridad, estado y fecha límite.
- Hitos que representan revisiones o entregas importantes.
- Eventos del calendario del proyecto y agenda general del estudio.
- Dependencias fin-a-inicio entre tareas.
- Diagrama de Gantt y cálculo básico de la ruta crítica.

El sistema rechaza ciclos entre dependencias y puede impedir que una tarea avance cuando todavía tiene predecesoras incompletas.

### 4. Documentos y versiones

Los archivos se registran dentro de su proyecto y cada actualización genera una versión vinculada con la anterior. Esto permite conservar el origen de un entregable y evitar que un archivo nuevo sustituya silenciosamente el historial existente.

Las versiones gráficas compatibles pueden compararse mediante una superposición visual. Esta herramienta ayuda a observar diferencias, pero no realiza una interpretación semántica ni identifica automáticamente cambios arquitectónicos.

### 5. Coordinación y control

Durante el desarrollo se pueden registrar:

- Incidencias generales o relacionadas con un elemento del plano.
- Comentarios asociados al proyecto, una tarea, un documento o un elemento semántico.
- Partidas de presupuesto con cantidad, precio unitario y gasto real.
- Información referencial de proveedores y etapas.
- Notificaciones personales y cambios atribuidos a su autor.

El historial permite revisar quién realizó una modificación y cuándo ocurrió. No reemplaza una firma profesional ni una certificación documental.

### 6. Entregables y participación del cliente

El arquitecto agrupa versiones concretas de documentos en paquetes de entrega. Al compartir un paquete, el cliente puede acceder únicamente a la información autorizada y a las revisiones que le fueron asignadas.

El cliente puede aprobar un documento o solicitar cambios con observaciones. La decisión queda registrada con el usuario y la fecha reales de la sesión. El portal no muestra tareas internas, costos, integrantes ni el historial privado del estudio.

### 7. Seguimiento y cierre

El panel del proyecto resume el avance, los próximos hitos, las decisiones pendientes, los costos y la actividad reciente. Los responsables también pueden revisar retrasos, carga de trabajo, historial de cambios y descargar un reporte de estado en PDF.

## Funciones principales

| Área | Funciones disponibles |
| --- | --- |
| Portafolio | Creación de proyectos, búsqueda, filtros por fase y visualización en tarjetas o tabla |
| Identidad y acceso | Registro local, inicio y cierre de sesión, cookies HttpOnly y roles por proyecto |
| Equipo | Integrantes, invitaciones con vencimiento y revocación, roles y carga de trabajo |
| Tareas | Creación, edición, asignación, prioridades, disciplinas, estados y tablero Kanban |
| Planificación | Hitos, calendario, dependencias, Gantt y ruta crítica básica |
| Documentos | Carga de archivos, versiones inmutables, previsualización, descarga y comparación visual |
| Incidencias | Registro, seguimiento y relación opcional con elementos del plano |
| Presupuesto | Cantidades, precios unitarios, gasto real, etapas y proveedores de referencia |
| Colaboración | Comentarios contextualizados, visibilidad por rol y notificaciones personales |
| Entregables | Paquetes por etapa compuestos por versiones específicas de documentos |
| Aprobaciones | Solicitudes de revisión, aprobación o pedido de cambios y retroalimentación |
| Cliente | Portal restringido con documentos, modelos y entregables expresamente compartidos |
| Auditoría | Historial de cambios atribuido al usuario y registros no editables |
| Reportes | Reporte de estado del proyecto en PDF |
| Editor 2D | Geometría semántica de muros, habitaciones, aberturas y columnas |
| Importación de planos | PDF o imagen, corrección visual, calibración manual, OCR local y propuestas heurísticas |
| Visor 3D | Conversión de la geometría calibrada a una escena navegable con ajustes de calidad |
| Simulación | Representación educativa de una respuesta sísmica; no constituye análisis estructural |
| Idiomas y apariencia | Interfaz en español, inglés y portugués, modo claro y oscuro y diseño adaptable |

## Flujo de digitalización de planos

Ark utiliza un proceso asistido: el sistema propone y el usuario confirma. No presenta la detección automática como una verdad técnica.

1. El usuario importa un PDF, PNG, JPEG o WebP desde su equipo o selecciona un documento del proyecto.
2. PDF.js convierte la página elegida en una imagen de trabajo.
3. El usuario puede ajustar giro, perspectiva, contraste y reducción de ruido sin modificar el archivo original.
4. Dos puntos y una distancia conocida permiten establecer la escala métrica.
5. Un detector heurístico propone muros rectos y recintos rectangulares cerrados.
6. Tesseract.js puede reconocer textos en español, inglés o portugués de manera local.
7. El resultado se importa como borrador y cada elemento debe ser revisado por el usuario.
8. La geometría calibrada alimenta el visor 3D.

El reconocimiento actual no es un modelo de inteligencia artificial entrenado. No detecta de forma fiable muros diagonales o curvos, escaleras, múltiples niveles ni todos los símbolos arquitectónicos. Las medidas, alturas y clasificaciones requieren confirmación humana.

## Arquitectura implementada actualmente

El frontend Next.js presenta los módulos de trabajo y envía `/api/v1/*` al servicio `teluria-backend` mediante un rewrite de mismo origen. El backend es un monolito modular Node.js con PostgreSQL; este repositorio ya no contiene rutas REST ni una base SQLite de ejecución.

```mermaid
flowchart TB
    U[Usuario] --> UI[Next.js + React]
    UI --> C[Composición y presentación]
    C --> BC[Contextos de negocio]
    BC --> APP[Casos de uso y puertos]
    APP --> API[Teluria backend REST /api/v1]
    API --> DB[(PostgreSQL)]
    BC --> PLAN[Editor 2D y procesamiento local]
    PLAN --> VIEW[Three.js / visor 3D]
    OCR[Tesseract.js y PDF.js locales] --> PLAN
```

### Domain-Driven Design y Clean Architecture

La solución está organizada mediante contextos delimitados. Cada contexto mantiene sus reglas, casos de uso, adaptadores y pantallas, evitando concentrar toda la lógica en componentes de interfaz o rutas HTTP.

La estructura general de un contexto es:

```text
bounded-contexts/<contexto>/
├── domain/          # Entidades, agregados, reglas y objetos de valor
├── application/     # Casos de uso y puertos
├── infrastructure/  # Repositorios y adaptadores técnicos
├── presentation/    # Pantallas, componentes y hooks
├── public.ts        # API de aplicación expuesta
└── index.ts         # Contrato público del módulo
```

Principios aplicados:

- El dominio no depende de la infraestructura ni de la interfaz.
- Los casos de uso trabajan con puertos definidos por su propio contexto.
- La infraestructura implementa esos puertos.
- Un contexto no accede a las rutas internas de otro; utiliza contratos públicos.
- La composición entre varios dominios se realiza en `src/composition`.
- Las páginas de Next.js seleccionan pantallas; el backend ejecuta autorización, reglas y persistencia.

### Contextos funcionales

| Grupo | Contextos y responsabilidades |
| --- | --- |
| Gestión | Proyectos, tareas, hitos, cronograma, costos e incidencias |
| Documentación | Documentos, versiones, entregables, aprobaciones y reportes |
| Colaboración | Identidad, equipos, invitaciones, comentarios, notificaciones e historial de cambios |
| Diseño | Digitalización de planos, editor 2D, visualización espacial y simulación educativa |
| Administración | Perfil profesional, preferencias, soporte y configuración del espacio de trabajo |

### API REST

Los recursos compartidos se exponen bajo `/api/v1`. Las colecciones emplean sustantivos plurales en inglés y kebab-case; los campos persistidos utilizan snake_case. Algunos ejemplos son:

```text
/api/v1/users
/api/v1/sessions
/api/v1/projects
/api/v1/projects/{projectId}/tasks
/api/v1/projects/{projectId}/documents
/api/v1/projects/{projectId}/deliverable-packages
/api/v1/projects/{projectId}/comments
/api/v1/projects/{projectId}/blueprints
/api/v1/projects/{projectId}/reports
```

Las operaciones siguen las convenciones HTTP habituales: `GET`, `POST`, `PATCH` y `DELETE`. Las respuestas usan los sobres `{ "data": ... }` y `{ "error": ... }`.

### Persistencia y concurrencia

- La base de datos de ejecución es PostgreSQL, configurada con `DATABASE_URL` en el backend.
- Los vínculos entre proyectos, usuarios y recursos tienen claves foráneas; las operaciones entre contextos usan transacciones.
- Los cambios utilizan revisiones optimistas mediante `ETag` e `If-Match`.
- Una actualización desactualizada se rechaza en lugar de sobrescribir el trabajo más reciente.
- Las preferencias personales, el terreno y algunos ajustes visuales todavía se conservan en el navegador.

No existe coedición simultánea en tiempo real. Si otro usuario guardó primero una versión del plano, el usuario debe actualizar la información antes de volver a guardar.

### Seguridad y permisos

- Contraseñas procesadas con `scrypt` y salt individual.
- Tokens de sesión almacenados como hash.
- Cookies de sesión HttpOnly y SameSite.
- Autorización independiente para cada proyecto y recurso.
- Invitaciones con token protegido, vencimiento y posibilidad de revocación.
- Registro del autor real desde la sesión; la API no confía en identidades enviadas por el cliente.
- Separación entre información interna y contenido compartido con clientes.

La API añade CORS explícito, control de origen en escrituras autenticadas, limitación de intentos de inicio de sesión y una bitácora inmutable. Aún faltan las medidas indicadas en la sección de límites para operar como SaaS público.

## Backend actual

El servicio hermano `teluria-backend` organiza dominio, aplicación, infraestructura y composición por bounded context. Ejecuta migraciones PostgreSQL versionadas, valida referencias entre tablas e incluye un importador de los datos SQLite anteriores. Consulta su [guía de despliegue](../teluria-backend/docs/deployment.md) antes de conectar Supabase y Render.

## Tecnologías actuales

| Área | Tecnología |
| --- | --- |
| Aplicación web | Next.js 16, React 19 y TypeScript |
| Estilos | Tailwind CSS y estilos propios con temas claro/oscuro |
| API | Servicio Node.js independiente con rutas REST versionadas |
| Persistencia | PostgreSQL, preparado para Supabase |
| Visualización 3D | Three.js, React Three Fiber y Drei |
| PDF | PDF.js y PDF-Lib |
| OCR | Tesseract.js con español, inglés y portugués |
| Calidad | ESLint y Prettier |
| Pruebas | Suites de integración en Node.js y flujo de navegador con Playwright Core |

## Requisitos para ejecutar el proyecto

- Node.js 24 o posterior.
- npm.
- Navegador web moderno.
- PostgreSQL accesible desde el backend.

Para el visor 3D se recomienda utilizar un navegador con WebGL habilitado. Una tarjeta gráfica dedicada no es obligatoria para los modelos demostrativos.

## Instalación y ejecución local

Primero, desde `teluria-backend`, configura `.env` según `.env.example`, ejecuta `npm ci`, `npm run db:migrate` y `npm run dev`. Luego, desde la carpeta del frontend:

```powershell
$env:TELURIA_API_URL='http://127.0.0.1:8000'
npm ci
npm run dev
```

Después, abrir:

```text
http://localhost:3000/projects
```

En una base vacía, el primer registro debe usar el correo `TELURIA_OWNER_EMAIL` configurado en el backend. Las cuentas posteriores necesitan una invitación. Si se importaron datos, los usuarios existentes inician sesión de nuevo.

No se debe exponer la pantalla de configuración inicial en una red pública.

## Comandos disponibles

| Comando | Finalidad |
| --- | --- |
| `npm run dev` | Preparar recursos de planos e iniciar el entorno de desarrollo |
| `npm run build` | Preparar recursos y generar la compilación de producción |
| `npm run start` | Ejecutar una compilación existente |
| `npm run lint` | Revisar la calidad estática del código |
| `npm run test:workspace` | Probar gestión contra una URL QA configurada con `ARK_TEST_URL` |
| `npm run test:collaboration` | Probar colaboración contra una URL QA configurada con `ARK_TEST_URL` |
| `npm run test:plans` | Probar calibración y reglas geométricas |
| `npm run test:plans:browser` | Probar en navegador el flujo de importación de planos |
| `npm run prepare:plans` | Preparar localmente PDF.js, Tesseract y sus modelos |

## Ejecución de pruebas aisladas

El backend usa PostgreSQL embebido en memoria para las pruebas; no toca Supabase ni los datos normales:

```powershell
cd ../teluria-backend
npm test
npm run test:contract
```

Las pruebas de geometría del frontend siguen disponibles en esta carpeta:

```bash
npm run test:plans
npm run test:plans:browser
```

Las suites de workspace y colaboración se ejecutan mediante `test:contract` contra el backend embebido.

## Datos y copias de seguridad

`teluria-backend` puede revisar e importar el antiguo `.data/ark.sqlite` con `npm run db:import` y `npm run db:import -- --apply`. El importador no modifica el origen y solo escribe en una base PostgreSQL vacía. Antes de usar datos reales, configura respaldos y verifica una restauración en Supabase. Los documentos aún no usan almacenamiento de objetos.

## Estructura principal del repositorio

```text
frontend/
├── data/                       # Datos semilla versionados
├── docs/                       # Arquitectura, API y notas de aceptación
├── public/                     # Traducciones y recursos estáticos
├── scripts/                    # Preparación y pruebas de integración
├── src/
│   ├── app/                    # Páginas de Next.js
│   ├── bounded-contexts/       # Módulos del dominio
│   ├── composition/            # Orquestación entre contextos
│   ├── kernel/                 # Identidad y revisiones compartidas
│   └── shared/                 # Componentes y utilidades técnicas comunes
├── package.json
└── README.md
```

## Alcance y límites conocidos

Ark tiene un backend desplegable, pero aún no es un SaaS público listo para producción.

- Las invitaciones se comparten manualmente; no se envían correos.
- Las notificaciones son internas y se actualizan periódicamente o al recuperar el foco de la ventana; no usan WebSockets.
- No existe recuperación de contraseña ni verificación de correo electrónico.
- El almacenamiento de documentos no utiliza todavía un servicio de objetos escalable ni análisis antivirus.
- Los archivos de documentos siguen guardándose en PostgreSQL como datos codificados; conviene moverlos a almacenamiento de objetos para escalar.
- El Gantt utiliza dependencias fin-a-inicio y días calendario, sin nivelación de recursos.
- La comparación de versiones es visual; no interpreta automáticamente cambios del plano.
- La detección de planos y el OCR pueden equivocarse y requieren revisión humana.
- Los presupuestos son referenciales y no constituyen estimaciones certificadas.
- La simulación sísmica es educativa y no reemplaza un análisis estructural profesional.
- El visor 3D no constituye una validación normativa, BIM ni constructiva.

Antes de una publicación externa se deben incorporar, como mínimo, recuperación de identidad, verificación de cuentas, HTTPS, límites de solicitudes centralizados, almacenamiento seguro de archivos, copias de seguridad automatizadas, observabilidad y pruebas de seguridad.

## Documentación complementaria

- [Arquitectura del frontend](docs/architecture.md)
- [Contratos de la API REST](docs/rest-api.md)
- [Coordinación y entrega](docs/stage-two.md)
- [Digitalización y visualización de planos](docs/plan-digitization-and-rendering.md)

## Estado del proyecto

Ark demuestra un flujo completo de gestión y coordinación para proyectos arquitectónicos. El backend modular y la migración a PostgreSQL ya están implementados; la conexión a un proyecto Supabase real y el despliegue en Render dependen de las credenciales y servicios del entorno final.
