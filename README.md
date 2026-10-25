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

Las migraciones y el seed no se ejecutan automáticamente. `AUTO_MIGRATE` y `ALLOW_DEMO_SEED` permanecen desactivados de forma predeterminada.

## Variables de entorno

| Variable | Uso |
| --- | --- |
| `PORT` | Puerto HTTP; predeterminado `4000`. |
| `NODE_ENV` | `development`, `test` o `production`. |
| `JWT_SECRET` | Obligatorio en producción. |
| `JWT_EXPIRES_IN` | Vigencia del JWT; predeterminado `8h`. |
| `CORS_ORIGIN` | Orígenes permitidos, separados por coma. |
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
| Reportes | `/reports/dashboard`, `/cash/*`, `/services`, `/revenue/monthly`, `/receivables`, `/revenue/categories`. |
| Asistencia | `/attendance/check-in`, `/check-out`, `/today`, `/report`, `/absence`, `/schedules`. |

Se mantienen temporalmente los módulos heredados `/guests`, `/billing`, `/food-orders`, `/laundry` y `/dashboard` para compatibilidad durante la migración.

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

El middleware consulta el rol vigente en la base en cada solicitud; cambiar un rol tiene efecto inmediato aunque el JWT siga vigente. No se permite cambiar el rol de la propia sesión activa.

## Auditoría

`audit_logs` registra como mínimo creación de reservas, pagos y reversiones, emisión/anulación de facturas, cierres de caja, cambios de asistencia y cambios de rol. Las operaciones críticas que lo requieren escriben el cambio y su auditoría de forma atómica.

## Migraciones y datos heredados

Las migraciones `001` a `007` son aditivas, versionadas, transaccionales y verificadas por checksum. No se eliminan tablas heredadas.

La migración progresiva:

- conserva el registro original;
- utiliza `guest_id` o una coincidencia única por nombre, habitación y fecha;
- deja asociaciones ambiguas en `legacy_migration_map` con estado `REVIEW`;
- guarda cuentas anteriores en `historical_accounts`;
- registra abonos sin metadatos como método `Desconocido`, fecha de migración y `payment_date_basis='MIGRATION_DATE'`;
- es idempotente y se previsualiza sin escribir mediante `npm run db:legacy:preview`.

Los comandos operativos usan `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` del `.env` mediante Node/LibSQL, sin requerir Turso CLI:

```bash
npm run db:backup
npm run db:migrate
npm run db:verify
npm run db:legacy:preview
```

Antes de cualquier operación remota, seguir [docs/turso-backup-rehearsal.md](docs/turso-backup-rehearsal.md). No ejecutar migraciones `003`–`007` ni la conversión heredada en producción sin respaldo verificado y ensayo completo sobre una copia.

## Calidad

```bash
npm test
npm run lint
npm run build
npm audit --omit=dev
```

La suite automatizada siempre recrea `file:test.db`; no debe apuntarse a Turso.
