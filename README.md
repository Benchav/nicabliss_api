# Nicabliss API

Backend REST del PMS Nicabliss, construido con Node.js, Express, TypeScript estricto y LibSQL/Turso. Centraliza clientes, reservas, pagos, estancias, servicios, facturación interna, caja, reportes, asistencia, RBAC y auditoría.

> Las facturas son comprobantes internos en USD, sin impuestos por defecto. No son facturas fiscales.

## Requisitos

- Node.js 20 o superior.
- npm.
- Una base LibSQL local o credenciales de Turso.

## Inicio local

```bash
npm install
copy .env.example .env
npm run db:migrate
npm run dev
```

API: `http://localhost:4000/api/v1`

Salud: `http://localhost:4000/health`

Readiness de base y esquema: `http://localhost:4000/ready`

Las migraciones y el seed no se ejecutan automáticamente. `AUTO_MIGRATE` y `ALLOW_DEMO_SEED` permanecen desactivados de forma predeterminada.

## Variables de entorno

| Variable | Uso |
| --- | --- |
| `PORT` | Puerto HTTP; predeterminado `4000`. |
| `NODE_ENV` | `development`, `test` o `production`. |
| `JWT_SECRET` | Obligatorio en producción, mínimo 32 caracteres aleatorios. |
| `JWT_EXPIRES_IN` | Vigencia del JWT; predeterminado `8h`. |
| `CORS_ORIGIN` | Orígenes permitidos, separados por coma. |
| `TRUST_PROXY` | Confía en un proxy; se activa automáticamente en producción. |
| `BUSINESS_TIMEZONE` | Zona del negocio; predeterminado `America/Managua`. |
| `TURSO_DATABASE_URL` | URL LibSQL local o remota. |
| `TURSO_AUTH_TOKEN` | Token de Turso para una URL remota. |
| `AUTO_MIGRATE` | Solo `true` cuando se autorice migrar al arrancar. |
| `ALLOW_DEMO_SEED` | Habilita expresamente el seed fuera de pruebas. |
| `TEST_DATABASE_URL` | Las pruebas requieren exactamente `file:test.db`. |
| `ALLOW_LEGACY_MIGRATION` | Primera protección para ejecutar la migración heredada remota. |
| `LEGACY_MIGRATION_CONFIRMATION` | Debe ser `BACKUP_VERIFIED` tras respaldo y ensayo. |

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | API local con recarga. |
| `npm run build` | Compila TypeScript a `dist/`. |
| `npm start` | Ejecuta la compilación. |
| `npm run lint` | Validación TypeScript sin emitir archivos. |
| `npm test` | Recrea `file:test.db`, migra, carga seed y ejecuta la suite serial. |
| `npm run db:migrate` | Aplica migraciones versionadas con checksum. |
| `npm run db:backup` | Copia Turso a un SQLite local y valida integridad/conteos. |
| `npm run db:verify` | Comprueba integridad, FK, checksums y conteos. |
| `npm run db:production:check` | Comprueba esquema, integridad y credencial administrativa no demo. |
| `npm run db:admin:rotate-password` | Rota la contraseña admin con confirmaciones explícitas. |
| `npm run db:seed` | Seed de demostración; está protegido. |
| `npm run db:legacy:preview` | Inventario de migración heredada sin escrituras. |
| `npm run db:legacy:execute` | Ejecuta la migración heredada con protecciones remotas. |
| `npm run e2e:server` | Servidor exclusivo de Playwright; recrea únicamente `file:test.db`. |

## Módulos y endpoints

Todos los endpoints funcionales usan el prefijo `/api/v1` y, salvo login, requieren `Authorization: Bearer <token>`.

| Módulo | Endpoints principales |
| --- | --- |
| Autenticación | `POST /auth/login`, `GET /auth/me`, `POST /auth/register` (ADMIN). |
| Usuarios | CRUD en `/users` (ADMIN). |
| Clientes | `GET/POST /customers`, `GET/PUT /customers/:id`. |
| Habitaciones | `GET /rooms`, `GET /rooms/availability?from=&to=`. |
| Reservas | CRUD operativo en `/reservations`; `POST /reservations/:id/check-in`. |
| Pagos | `GET/POST /reservations/:id/payments`, `GET /payments/:id/receipt`, `POST /payments/:id/void`. |
| Estancias | `GET /stays`, `GET /stays/:id`, `POST /stays/:id/check-out`. |
| Servicios | `/stays/:id/services`, `/service-catalog`, `/service-consumptions/:id/status`. |
| Facturas | `/invoices`, `/:id/issue`, `/:id/payments`, `/:id/pdf`, `/:id/void`. |
| Caja | `/cash-register/current`, `/open`, `/movements`, `/close`, `/history`. |
| Reportes | `/reports/dashboard`, `/reports/export.xlsx`, `/cash/*`, `/services`, `/revenue/monthly`, `/receivables`, `/revenue/categories`. |
| Asistencia | `/attendance/check-in`, `/check-out`, `/today`, `/report`, `/absence`, `/schedules`. |
| Administración heredada | `/legacy-administration/historical-accounts`, `/reviews`, `/reviews/:id/accept-unlinked` (ADMIN). |

`/guests` y `/billing` se mantienen exclusivamente para consulta: cualquier escritura responde `405 LEGACY_READ_ONLY`. `/food-orders` y `/laundry` siguen operativos porque sincronizan explícitamente sus consumos con el modelo nuevo.

`GET /api/v1/reports/export.xlsx` genera y descarga un libro Excel auténtico desde los datos canónicos de la base. Requiere rol `ADMIN` o `RECEPTIONIST` y acepta `period=daily&date=YYYY-MM-DD`, `period=weekly&date=YYYY-MM-DD` (semana lunes–domingo en la zona de negocio) o `period=monthly&month=YYYY-MM`. Los filtros opcionales `category` y `method` aplican a facturación/servicios y cobros/anticipos respectivamente. El libro separa facturas, líneas, pagos/reversiones, servicios, CxC vigente y movimientos operativos de Caja; estos últimos no se vuelven a contar como ingresos.

## Reglas financieras

- Los importes nuevos se almacenan como centavos enteros.
- `Idempotency-Key` es obligatorio al registrar pagos.
- Todo pago o reversión exige una caja abierta.
- Los pagos publicados son inmutables; una anulación crea una reversión.
- Una factura emitida congela líneas y precios.
- Solo los servicios `Entregado` o `Consumido` entran en la factura.
- La caja no cierra si la conciliación automática presenta descuadres.
- El PDF muestra `COMPROBANTE INTERNO · NO ES FACTURA FISCAL`.

## RBAC

| Capacidad | ADMIN | RECEPTIONIST | STAFF |
| --- | :---: | :---: | :---: |
| Clientes, reservas, pagos y facturas | Sí | Sí | No |
| Caja, dashboard y reportes financieros | Sí | Sí | No |
| Estancias y consumos | Sí | Sí | Sí |
| Catálogo: consultar | Sí | Sí | Sí |
| Catálogo: modificar | Sí | No | No |
| Anular pagos o facturas | Sí | No | No |
| Usuarios y roles | Sí | No | No |
| Asistencia propia | Sí | Sí | Sí |
| Horarios, ausencias y reporte de asistencia | Sí | No | No |
| Cuentas históricas y conciliación heredada | Sí | No | No |

El middleware consulta el usuario vigente en la base en cada solicitud. Cambiar contraseña o rol incrementa la versión de seguridad y revoca todos los JWT anteriores. No se permite cambiar el rol de la propia sesión activa.

## Auditoría

`audit_logs` registra como mínimo creación de reservas, pagos y reversiones, emisión/anulación de facturas, cierres de caja, cambios de asistencia y cambios de rol. Las operaciones críticas que lo requieren escriben el cambio y su auditoría de forma atómica.

## Migraciones y datos heredados

Las migraciones `001` a `010` son aditivas, versionadas, transaccionales y verificadas por checksum. No se eliminan tablas heredadas. `008` garantiza en la base la unicidad del documento normalizado de clientes, `009` añade revocación de sesiones, resolución auditada de revisiones y rate limiting compartido para login, y `010` atribuye sesiones de caja a usuarios, conserva las sesiones históricas sin autoría fiable e incorpora idempotencia para movimientos manuales.

La migración progresiva:

- conserva el registro original;
- utiliza `guest_id` o una coincidencia única por nombre, habitación y fecha;
- deja asociaciones ambiguas en `legacy_migration_map` con estado `REVIEW`;
- guarda cuentas anteriores en `historical_accounts`;
- registra abonos sin metadatos como método `Desconocido`, fecha de migración y `payment_date_basis='MIGRATION_DATE'`;
- es idempotente y se previsualiza sin escribir mediante `npm run db:legacy:preview`.
- expone las cuentas históricas y los registros `REVIEW` solo a ADMIN; aceptar un registro sin vínculo exige justificación, no crea datos financieros y deja auditoría atómica.

Los comandos operativos usan `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` del `.env` mediante Node/LibSQL, sin requerir Turso CLI:

```bash
npm run db:backup
npm run db:migrate
npm run db:verify
npm run db:legacy:preview
```

Antes de cualquier operación remota, seguir [docs/turso-backup-rehearsal.md](docs/turso-backup-rehearsal.md). No ejecutar migraciones ni la conversión heredada en producción sin respaldo verificado y ensayo completo sobre una copia.

## Configuración de producción

Usar `.env.production.example` como inventario para la plataforma. En producción la API no inicia si falta Turso, el token, un `JWT_SECRET` fuerte o un `CORS_ORIGIN` HTTPS. Nunca usar `AUTO_MIGRATE` ni `ALLOW_DEMO_SEED` en el despliegue.

Antes de abrir tráfico:

```bash
npm run db:migrate
npm run db:verify
npm run db:production:check
```

`/health` es liveness y `/ready` comprueba Turso y la versión de esquema requerida. La contraseña de demostración del administrador bloquea `db:production:check` y debe rotarse de forma controlada.

## Calidad

```bash
npm test
npm run lint
npm run build
npm audit --omit=dev
```

La suite automatizada siempre recrea `file:test.db`; no debe apuntarse a Turso.
