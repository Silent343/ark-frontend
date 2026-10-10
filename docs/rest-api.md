# Contrato REST v1

La API se ejecuta en `teluria-backend`; el frontend reenvía `/api/v1/*` y `/api/health` mediante `TELURIA_API_URL`. El contrato y el mapa actualizado de vistas están en [`teluria-backend/docs/api.md`](../../teluria-backend/docs/api.md).

## Nombres y recursos

Las rutas de API utilizan sustantivos plurales en inglés y kebab-case. Los campos JSON usan snake_case; el modelo geométrico anterior conserva camelCase detrás de un adaptador. La ruta web de la bitácora sigue siendo `/projects/{id}/change-log`, mientras su colección REST canónica es `/api/v1/projects/{id}/audit-entries`.

`/editor`, `/model`, `/simulation`, `/schedule` y `/client-portal` son vistas, no colecciones CRUD. `/tasks`, `/milestones`, `/documents`, `/issues`, `/budget-items`, `/approvals`, `/comments`, `/members`, `/invitations`, `/calendar-events`, `/task-dependencies`, `/deliverable-packages`, `/blueprints` y `/notifications` son recursos de proyecto bajo `/api/v1/projects/{id}`.

Las colecciones admiten `GET` y, cuando corresponde, `POST`; los elementos admiten `GET`, `PATCH` y `DELETE` según sus reglas de dominio. Crear devuelve `201` y `Location`; eliminar devuelve `204`. Las respuestas JSON usan `{ "data": ... }` o `{ "error": { "code", "message" } }`. `activities` y `audit-entries` son de solo lectura. Cada mutación de un elemento requiere su `ETag` en `If-Match` (`428` si falta; `409` si la revisión cambió).

## Identidad y acceso

`POST /api/v1/users` registra una cuenta y exige `terms_accepted: true` y `privacy_accepted: true`; la API conserva fecha y versión de cada consentimiento. `GET`, `POST` y `DELETE /api/v1/sessions` consultan, inician y cierran la sesión. El login puede enviar `remember_me: true` para mantener la sesión 30 días; sin esa opción usa una cookie de sesión y una vigencia máxima de 12 horas. “Recordarme” no guarda la contraseña en el navegador. `GET` y `POST /api/v1/invitations/{token}` inspeccionan y aceptan una invitación. Un registro inicial solo está permitido para `TELURIA_OWNER_EMAIL` en una base vacía; después se necesita una invitación. La API verifica sesión, rol y pertenencia en cada recurso de proyecto. El autor se obtiene de la sesión, nunca del JSON enviado por el cliente.

La cookie canónica `ark_session` es HttpOnly y SameSite, y Secure en producción. El backend acepta temporalmente la cookie heredada `teluria_session` y elimina ambas al cerrar sesión. CORS permite únicamente los orígenes declarados en `TELURIA_ALLOWED_ORIGINS`; las escrituras autenticadas comprueban también el encabezado `Origin`. El navegador no se conecta directamente a PostgreSQL ni a la Data API de Supabase.

## Integridad y límites

Las referencias cruzadas de proyecto, usuario, tarea y documento se comprueban con claves foráneas y validación de dominio. Las decisiones afectan una versión específica de documento. Los paquetes contienen identificadores explícitos de versiones. Las dependencias de tareas rechazan ciclos y avance con predecesores incompletos. Los eventos de auditoría se escriben en la misma transacción y no pueden modificarse ni borrarse.

Los archivos PDF/PNG/JPEG/WebP siguen incluidos como `file_data` en el agregado por compatibilidad y tienen un límite de 3 MiB. Antes de un uso de alto volumen conviene trasladarlos a almacenamiento de objetos. La API no ofrece coedición en tiempo real, recuperación de contraseña ni envío de correos de invitación.
