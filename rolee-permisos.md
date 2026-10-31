# Roles y permisos — Nicabliss API

Este documento describe los permisos aplicados por las rutas de la API. La matriz refleja los middlewares de `src/routes/`; los permisos de negocio adicionales (por ejemplo, estados válidos, caja abierta o validación de datos) también pueden limitar una operación aunque el rol esté autorizado.

## Roles

| Rol | Descripción general |
| --- | --- |
| `ADMIN` | Administración del sistema y acceso a las operaciones críticas. |
| `RECEPTIONIST` | Operación de recepción, reservas, clientes, caja y facturación. |
| `STAFF` | Funciones operativas de estancias, servicios, alimentos, lavandería y asistencia. |

## Cómo se aplica el acceso

- Salvo `POST /api/v1/auth/login`, las rutas documentadas requieren autenticación con `Authorization: Bearer <token>`.
- `authMiddleware` valida el JWT y consulta el usuario vigente en la base de datos. También comprueba la versión del token, por lo que una sesión puede invalidarse al cambiar datos de seguridad.
- `requireRole(...)` limita una ruta a los roles indicados. Una solicitud sin autenticación obtiene `401`; un rol no permitido obtiene `403`.
- Algunas rutas solo requieren autenticación y no tienen una restricción de rol adicional. En esos casos pueden acceder los tres roles.
- Los permisos de esta matriz son permisos de ruta. No implican que la operación siempre pueda completarse: también pueden aplicar validaciones, reglas de negocio y transiciones de estado.

## Matriz detallada

En las tablas, ✅ indica que la ruta admite ese rol; ❌ indica que el middleware de rol lo rechaza.

### Autenticación — `/api/v1/auth`

| Método y ruta | ADMIN | RECEPTIONIST | STAFF | Operación |
| --- | :---: | :---: | :---: | --- |
| `POST /login` | ✅ | ✅ | ✅ | Iniciar sesión; sujeto a validación y rate limit. |
| `GET /me` | ✅ | ✅ | ✅ | Consultar el perfil de la sesión. |
| `POST /register` | ✅ | ❌ | ❌ | Registrar usuario. |

### Usuarios — `/api/v1/users`

Todas estas rutas requieren `ADMIN`.

| Método y ruta | Operación |
| --- | --- |
| `GET /` | Listar usuarios. |
| `GET /:id` | Consultar usuario. |
| `POST /` | Crear usuario. |
| `PUT /:id` | Actualizar usuario. |
| `DELETE /:id` | Eliminar usuario. |

### Clientes — `/api/v1/customers`

Todas estas rutas requieren `ADMIN` o `RECEPTIONIST`; `STAFF` no tiene acceso.

| Método y ruta | Operación |
| --- | --- |
| `GET /` | Listar clientes. |
| `POST /` | Crear cliente. |
| `GET /:id` | Consultar cliente. |
| `PUT /:id` | Actualizar cliente. |
| `GET /:id/history` | Consultar historial del cliente. |

### Habitaciones — `/api/v1/rooms`

| Método y ruta | ADMIN | RECEPTIONIST | STAFF | Operación |
| --- | :---: | :---: | :---: | --- |
| `GET /availability` | ✅ | ✅ | ✅ | Consultar disponibilidad. |
| `GET /` | ✅ | ✅ | ✅ | Listar habitaciones. |
| `GET /:id` | ✅ | ✅ | ✅ | Consultar habitación. |
| `POST /` | ✅ | ❌ | ❌ | Crear habitación. |
| `PUT /:id` | ✅ | ❌ | ❌ | Actualizar habitación. |
| `DELETE /:id` | ✅ | ❌ | ❌ | Desactivar habitación. |

### Reservas — `/api/v1/reservations`

Todas estas rutas requieren `ADMIN` o `RECEPTIONIST`; `STAFF` no tiene acceso a este router.

| Método y ruta | Operación |
| --- | --- |
| `GET /` | Listar reservas. |
| `POST /` | Crear reserva. |
| `GET /:id` | Consultar reserva. |
| `PUT /:id` | Actualizar reserva. |
| `PATCH /:id/status` | Actualizar estado de reserva. |
| `POST /:id/check-in` | Registrar check-in. |
| `POST /:id/checkout` | Registrar check-out desde la reserva. |
| `GET /:id/payments` | Consultar pagos de la reserva. |
| `POST /:id/payments` | Registrar pago para la reserva. |
| `GET /:id/account` | Consultar cuenta de la reserva. |
| `GET /:id/consumptions` | Consultar consumos. |
| `POST /:id/consumptions` | Agregar consumo. |

### Pagos — `/api/v1/payments`

| Método y ruta | ADMIN | RECEPTIONIST | STAFF | Operación |
| --- | :---: | :---: | :---: | --- |
| `GET /:id/receipt` | ✅ | ✅ | ❌ | Consultar comprobante. |
| `POST /:id/void` | ✅ | ❌ | ❌ | Anular pago; solo ADMIN. |

El router permite inicialmente `ADMIN` y `RECEPTIONIST`; la ruta de anulación agrega un control exclusivo de `ADMIN`.

### Estancias — `/api/v1/stays`

| Método y ruta | ADMIN | RECEPTIONIST | STAFF | Operación |
| --- | :---: | :---: | :---: | --- |
| `GET /` | ✅ | ✅ | ✅ | Listar estancias. |
| `GET /:id` | ✅ | ✅ | ✅ | Consultar estancia. |
| `GET /:id/services` | ✅ | ✅ | ✅ | Consultar servicios de la estancia. |
| `GET /:id/account` | ✅ | ✅ | ✅ | Consultar cuenta de la estancia. |
| `POST /:id/services` | ✅ | ✅ | ✅ | Registrar consumo/servicio. |
| `POST /:id/check-out` | ✅ | ✅ | ❌ | Registrar check-out; excluye STAFF. |

**Importante:** STAFF sí puede consultar la cuenta de una estancia mediante `GET /stays/:id/account`; no tiene acceso al router de reservas, facturas, caja o reportes.

### Catálogo y consumos de servicios

#### Catálogo — `/api/v1/service-catalog`

| Método y ruta | ADMIN | RECEPTIONIST | STAFF | Operación |
| --- | :---: | :---: | :---: | --- |
| `GET /` | ✅ | ✅ | ✅ | Consultar catálogo. |
| `POST /` | ✅ | ❌ | ❌ | Crear elemento del catálogo. |
| `PUT /:id` | ✅ | ❌ | ❌ | Actualizar elemento del catálogo. |

#### Consumos — `/api/v1/service-consumptions`

| Método y ruta | ADMIN | RECEPTIONIST | STAFF | Operación |
| --- | :---: | :---: | :---: | --- |
| `PATCH /:id/status` | ✅ | ✅ | ✅ | Actualizar estado del consumo. |
| `PUT /:id` | ✅ | ✅ | ❌ | Actualizar consumo; excluye STAFF. |

### Facturas — `/api/v1/invoices`

El router requiere `ADMIN` o `RECEPTIONIST`; la anulación agrega un control exclusivo de `ADMIN`.

| Método y ruta | ADMIN | RECEPTIONIST | STAFF | Operación |
| --- | :---: | :---: | :---: | --- |
| `GET /` | ✅ | ✅ | ❌ | Listar facturas. |
| `POST /` | ✅ | ✅ | ❌ | Crear factura. |
| `GET /:id` | ✅ | ✅ | ❌ | Consultar factura. |
| `GET /:id/pdf` | ✅ | ✅ | ❌ | Obtener PDF. |
| `POST /:id/issue` | ✅ | ✅ | ❌ | Emitir factura. |
| `POST /:id/payments` | ✅ | ✅ | ❌ | Registrar pago de factura. |
| `POST /:id/void` | ✅ | ❌ | ❌ | Anular factura; solo ADMIN. |

### Caja — `/api/v1/cash-register`

Todas las rutas requieren `ADMIN` o `RECEPTIONIST`; `STAFF` no tiene acceso.

| Método y ruta | Operación |
| --- | --- |
| `GET /current` | Consultar caja actual. |
| `POST /open` | Abrir caja. |
| `POST /movements` | Registrar movimiento. |
| `POST /close` | Cerrar caja. |
| `GET /history` | Consultar historial. |

### Dashboard y reportes

Todas las rutas siguientes requieren `ADMIN` o `RECEPTIONIST`; `STAFF` no tiene acceso.

#### Dashboard — `/api/v1/dashboard`

| Método y ruta | Operación |
| --- | --- |
| `GET /metrics` | Consultar métricas. |

#### Reportes — `/api/v1/reports`

| Método y ruta | Operación |
| --- | --- |
| `GET /dashboard` | Consultar reporte de dashboard. |
| `GET /export.xlsx` | Exportar reporte Excel. |
| `GET /cash/reconciliation` | Consultar conciliación de caja. |
| `GET /cash/by-method` | Consultar caja por método. |
| `GET /cash/by-user` | Consultar caja por usuario. |
| `GET /services` | Consultar reporte de servicios. |
| `GET /revenue/monthly` | Consultar ingresos mensuales. |
| `GET /receivables` | Consultar cuentas por cobrar. |
| `GET /revenue/categories` | Consultar ingresos por categoría. |

### Asistencia — `/api/v1/attendance`

| Método y ruta | ADMIN | RECEPTIONIST | STAFF | Alcance |
| --- | :---: | :---: | :---: | --- |
| `POST /check-in` | ✅ | ✅ | ✅ | Registra la entrada del usuario autenticado. |
| `POST /check-out` | ✅ | ✅ | ✅ | Registra la salida del usuario autenticado. |
| `GET /today` | ✅ | ✅ | ✅ | Consulta de hoy; el controlador recibe el usuario y su rol. |
| `GET /` | ✅ | ✅ | ❌ | Consultar todas las asistencias. |
| `POST /absence` | ✅ | ❌ | ❌ | Registrar ausencia. |
| `GET /report` | ✅ | ❌ | ❌ | Consultar reporte. |
| `PUT /schedules` | ✅ | ❌ | ❌ | Guardar horarios. |
| `GET /schedules` | ✅ | ❌ | ❌ | Consultar horarios. |
| `PUT /:id` | ✅ | ❌ | ❌ | Actualizar registro de asistencia. |

### Pedidos de comida — `/api/v1/food-orders`

Todas las rutas requieren autenticación y admiten los tres roles.

| Método y ruta | Operación |
| --- | --- |
| `GET /` | Listar pedidos. |
| `GET /:id` | Consultar pedido. |
| `POST /` | Crear pedido. |
| `PUT /:id` | Actualizar pedido. |
| `PATCH /:id/status` | Actualizar estado. |
| `DELETE /:id` | Eliminar pedido. |

### Lavandería — `/api/v1/laundry`

Todas las rutas requieren autenticación y admiten los tres roles.

| Método y ruta | Operación |
| --- | --- |
| `GET /` | Listar registros. |
| `GET /:id` | Consultar registro. |
| `POST /` | Crear registro. |
| `PUT /:id` | Actualizar registro. |
| `PATCH /:id/status` | Actualizar estado. |
| `DELETE /:id` | Eliminar registro. |

### Módulos heredados: huéspedes y facturación

Estos módulos son de solo lectura para `ADMIN` y `RECEPTIONIST`. `STAFF` no puede acceder. Las rutas de escritura responden `405 LEGACY_READ_ONLY`; tener acceso al router no habilita la escritura.

#### Huéspedes — `/api/v1/guests`

| Método y ruta | ADMIN | RECEPTIONIST | STAFF | Resultado |
| --- | :---: | :---: | :---: | --- |
| `GET /` | ✅ | ✅ | ❌ | Consultar huéspedes. |
| `GET /:id` | ✅ | ✅ | ❌ | Consultar huésped. |
| `POST /` | 405 | 405 | ❌ | Bloqueado por solo lectura. |
| `PUT /:id` | 405 | 405 | ❌ | Bloqueado por solo lectura. |
| `PATCH /:id/status` | 405 | 405 | ❌ | Bloqueado por solo lectura. |
| `DELETE /:id` | 405 | 405 | ❌ | Bloqueado por solo lectura. |

#### Billing — `/api/v1/billing`

| Método y ruta | ADMIN | RECEPTIONIST | STAFF | Resultado |
| --- | :---: | :---: | :---: | --- |
| `GET /` | ✅ | ✅ | ❌ | Consultar facturaciones heredadas. |
| `GET /:id` | ✅ | ✅ | ❌ | Consultar facturación heredada. |
| `POST /` | 405 | 405 | ❌ | Bloqueado por solo lectura. |
| `PUT /:id` | 405 | 405 | ❌ | Bloqueado por solo lectura. |
| `POST /:id/payments` | 405 | 405 | ❌ | Bloqueado por solo lectura. |
| `DELETE /:id` | 405 | 405 | ❌ | Bloqueado por solo lectura. |

### Administración heredada — `/api/v1/legacy-administration`

Todas las rutas requieren `ADMIN`.

| Método y ruta | Operación |
| --- | --- |
| `GET /historical-accounts` | Consultar cuentas históricas. |
| `GET /reviews` | Consultar registros en revisión. |
| `PATCH /reviews/:id/accept-unlinked` | Aceptar registro sin vínculo, con justificación. |

## Resumen por rol

### `ADMIN`

- Acceso a todos los módulos y rutas operativas enumeradas.
- Puede administrar usuarios, roles, habitaciones y catálogo de servicios.
- Es el único rol autorizado para anular pagos o facturas.
- Es el único rol autorizado para administrar horarios/ausencias, editar asistencia y consultar reportes de asistencia.
- Es el único rol autorizado para administración heredada.
- **Excepción:** tampoco puede escribir en `/guests` ni `/billing`; son rutas legacy de solo lectura para todos.

### `RECEPTIONIST`

- Acceso a reservas, clientes, estancias, facturas, pagos, caja, dashboard y reportes.
- Puede consultar y registrar operaciones financieras permitidas por las rutas, pero no anular pagos ni facturas.
- Puede consultar habitaciones; no puede crear, editar ni desactivar habitaciones.
- Puede consultar catálogo de servicios, pero no modificarlo.
- Puede consultar y operar huéspedes/billing únicamente en lectura; no tiene acceso a administración heredada.
- Puede registrar su asistencia y consultar la asistencia del día; además puede consultar el listado general de asistencia. No puede administrar horarios, ausencias ni reportes de asistencia.
- No puede gestionar usuarios.

### `STAFF`

- Puede consultar habitaciones y disponibilidad.
- Puede acceder a estancias y cuentas de estancia, registrar servicios y actualizar estados de consumos.
- Puede consultar el catálogo de servicios.
- Puede gestionar pedidos de comida y lavandería según las rutas expuestas.
- Puede registrar su propia entrada/salida y consultar la asistencia del día.
- No tiene acceso a reservas, clientes, facturas, pagos, caja, dashboard, reportes, huéspedes, billing ni administración heredada.
- No puede gestionar usuarios, habitaciones ni catálogo, ni hacer check-out de estancias o editar consumos mediante `PUT /service-consumptions/:id`.

## Consideraciones de seguridad y negocio

- El middleware de autenticación toma rol y datos del usuario vigente en la base, no solo del contenido inicial del JWT. `tokenVersion` se usa para invalidar sesiones anteriores.
- Los endpoints de asistencia `check-in` y `check-out` usan el ID del usuario autenticado; no registran la asistencia de otro usuario desde esas rutas.
- Las rutas de pagos y facturas tienen controles de rol y además están sujetas a reglas financieras, como idempotencia, caja abierta, inmutabilidad de pagos publicados y restricciones de facturas emitidas.
- Los permisos de la matriz no sustituyen validaciones de propiedad, estado o reglas del dominio que apliquen en los servicios.
- Los módulos `/guests` y `/billing` son legacy de solo lectura. Para operaciones actuales deben usarse los módulos operativos correspondientes.

## Fuentes del código

- Rutas: `src/routes/*.routes.ts`
- Autenticación: `src/middlewares/auth.middleware.ts`
- Control de roles: `src/middlewares/role.middleware.ts`
- Solo lectura legacy: `src/middlewares/legacy-read-only.middleware.ts`
- Roles permitidos: `src/validators/user.validator.ts`
