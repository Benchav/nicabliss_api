# Plan integral de integración — Nicabliss PMS

## 1. Alcance

Este plan contempla la evolución coordinada de:

- **Backend:** `C:\Users\joshu\Downloads\nicabliss_api`
- **Frontend:** `C:\Users\joshu\Downloads\NicablissFrontend`

Flujo objetivo:

```text
Cliente → Reserva → Anticipo → Check-in → Servicios → Factura → Pagos → Caja → Reportes
```

## 2. Diagnóstico actual

### Backend

El backend ya posee Node.js, Express, TypeScript, Turso/LibSQL, JWT, roles, huéspedes, cuentas, alimentos, lavandería, caja, dashboard y pruebas.

Problemas que deben resolverse:

- Los abonos solo actualizan `pagado` y `saldo`; no existe historial individual completo.
- Los pagos no están relacionados consistentemente con cliente o reserva.
- Alimentos y lavandería utilizan principalmente nombre y habitación.
- El dashboard mezcla facturación con cobros reales.
- No existe factura consolidada con detalle de servicios.
- No existe asistencia del personal.
- Las migraciones no están versionadas.
- Las fechas utilizan formatos inconsistentes.

### Frontend

El frontend es una SPA React con navegación basada en estado dentro de `App.tsx`. Ya contiene dashboard, huéspedes, cobros, alimentos, lavandería, caja y usuarios.

Problemas que deben resolverse:

- No existen rutas URL reales para los módulos.
- Los tipos reflejan el modelo antiguo.
- No existe una vista completa de reserva.
- No existe una vista consolidada de servicios.
- No existe factura digital, reportes ni asistencia.
- No existe un sistema centralizado de permisos visuales.

## 3. Arquitectura objetivo

```text
Cliente
   ↓
Reserva
   ↓ 
   
Estancia
   ↓
Consumos de servicios
   ↓
Factura
   ↓
Pagos
   ↓
Caja y reportes
```

Entidades principales:

- `customers`: personas que reservan o pagan.
- `reservations`: reservas antes de la llegada.
- `stays`: estancias reales durante el check-in.
- `service_catalog`: catálogo de servicios.
- `service_consumptions`: servicios usados por una estancia.
- `invoices` e `invoice_items`: facturas y sus líneas.
- `payments` y `payment_allocations`: pagos y su aplicación.
- `cash_movements`: movimientos de caja relacionados con pagos.
- `attendance_records`: asistencia del personal.
- `audit_logs`: trazabilidad de acciones críticas.

---

# FASE 0 — Preparación técnica y contrato de datos

## Objetivo

Crear una base estable antes de desarrollar nuevos módulos y conservar la compatibilidad actual.

## Backend

Crear migraciones versionadas:

```text
src/db/migrations/
  001_create_migrations_table.sql
  002_create_customers.sql
  003_create_reservations.sql
  004_create_stays.sql
  005_create_payments.sql
  006_create_services.sql
  007_create_invoices.sql
  008_create_attendance.sql
  009_create_audit_logs.sql
```

Modificar el ejecutor de migraciones para registrar migraciones ejecutadas, aplicar solo pendientes, ser idempotente y funcionar de forma segura en Turso.

Crear modelos y contratos:

```text
src/models/customer.model.ts
src/models/reservation.model.ts
src/models/stay.model.ts
src/models/payment.model.ts
src/models/service.model.ts
src/models/invoice.model.ts
src/models/attendance.model.ts
src/models/audit.model.ts
```

Crear también DTOs, repositorios, servicios, controladores y rutas correspondientes.

Respuesta exitosa estándar:

```json
{
  "success": true,
  "data": {},
  "message": "Operación completada"
}
```

Respuesta de error estándar:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "El monto no puede superar el saldo"
  }
}
```

Todas las fechas nuevas deberán almacenarse en ISO 8601.

## Frontend

Reorganizar progresivamente:

```text
src/
  components/
  features/
    customers/
    reservations/
    payments/
    stays/
    services/
    invoices/
    reports/
    attendance/
  services/
  types/
  hooks/
  contexts/
```

Agregar router con `react-router-dom`, `AuthContext`, `RoleGuard`, estados de carga/error/vacío, notificaciones y confirmaciones para acciones críticas.

Actualizar principalmente:

```text
src/App.tsx
src/types.ts
src/services/types.ts
src/components/AppLayout.tsx
src/services/apiClient.ts
```

El `apiClient` debe soportar JSON y respuestas binarias para PDF o CSV.

## Criterios de aceptación

- Las migraciones no se duplican.
- Login y cierre de sesión continúan funcionando.
- Los permisos se validan en backend y frontend.
- Los módulos actuales siguen operativos.

---

# FASE 1 — Clientes, reservas y anticipos

## Objetivo

Registrar reservas vinculadas a un cliente y almacenar cada anticipo como transacción independiente.

## Backend

### Tabla `customers`

```text
id
nombre
apellido
documento
telefono
correo
direccion
created_at
updated_at
```

### Tabla `reservations`

```text
id
codigo_reserva
customer_id
habitacion
fecha_entrada
fecha_salida
total_reserva
deposito_requerido
estado
observaciones
created_by
created_at
updated_at
```

Estados: `Pendiente`, `Confirmada`, `Cancelada`, `CheckIn`, `Finalizada`, `NoShow`.

### Tabla `payments`

```text
id
customer_id
reservation_id
invoice_id
amount
payment_method
reference
status
payment_date
received_by
cash_session_id
created_at
```

Métodos iniciales: `Efectivo`, `Tarjeta`, `Transferencia`.

### Reglas de negocio

- El cliente es obligatorio.
- El anticipo puede ser porcentaje o monto configurable.
- No permitir pagos superiores al saldo.
- Cada abono debe ser un registro independiente.
- Los pagos no se eliminan físicamente.
- Las anulaciones generan una reversión contable.
- El pago identifica quién lo recibió.
- La reserva muestra total, abonado y saldo.

### Endpoints

```text
GET    /api/v1/customers
POST   /api/v1/customers
GET    /api/v1/customers/:id
PUT    /api/v1/customers/:id

GET    /api/v1/reservations
POST   /api/v1/reservations
GET    /api/v1/reservations/:id
PUT    /api/v1/reservations/:id
PATCH  /api/v1/reservations/:id/status

POST   /api/v1/reservations/:id/payments
GET    /api/v1/reservations/:id/payments
POST   /api/v1/payments/:id/void
```

## Frontend

Crear:

```text
src/features/customers/CustomersPage.tsx
src/features/customers/CustomerDetailPage.tsx
src/features/reservations/ReservationsPage.tsx
src/features/reservations/ReservationForm.tsx
src/features/reservations/ReservationDetailPage.tsx
src/features/payments/PaymentModal.tsx
src/features/payments/PaymentHistory.tsx
```

Actualizar:

```text
src/Huespedes.tsx
src/CuentasCobros.tsx
src/App.tsx
src/components/AppLayout.tsx
src/services/types.ts
```

### Flujo de recepción

1. Crear o seleccionar cliente.
2. Crear reserva.
3. Mostrar total y anticipo requerido.
4. Registrar anticipo.
5. Generar comprobante.
6. Buscar posteriormente por nombre, documento o código.
7. Mostrar saldo pendiente al hacer check-in.

### Criterios de aceptación

- Recepción busca por código o documento.
- Puede ver cuánto pagó el cliente.
- Puede registrar abonos sucesivos.
- El saldo se actualiza automáticamente.
- El pago aparece relacionado con caja.
- El sistema rechaza pagos superiores al saldo.

---

# FASE 2 — Estancias y servicios consumidos

## Objetivo

Centralizar todos los servicios utilizados durante una estancia activa.

## Backend

### Tabla `stays`

```text
id
reservation_id
customer_id
habitacion
check_in_at
check_out_at
estado
created_by
```

### Tabla `service_catalog`

```text
id
nombre
categoria
descripcion
precio
impuesto
activo
```

Categorías: `Alimentos`, `Lavandería`, `Hospedaje`, `Minibar`, `Transporte`, `Otro`.

### Tabla `service_consumptions`

```text
id
stay_id
customer_id
service_id
cantidad
precio_unitario
subtotal
estado
observaciones
consumed_at
created_by
```

Estados: `Registrado`, `EnProceso`, `Entregado`, `Consumido`, `Cancelado`.

### Integración existente

Actualizar:

```text
src/models/food-order.model.ts
src/models/laundry.model.ts
src/repositories/food-order.repository.ts
src/repositories/laundry.repository.ts
```

Los módulos deberán utilizar `customer_id` y `stay_id` como relaciones principales. Los campos de texto actuales se conservarán temporalmente para compatibilidad.

### Endpoints

```text
GET    /api/v1/stays/:id
GET    /api/v1/stays/:id/services
POST   /api/v1/stays/:id/services
PATCH  /api/v1/service-consumptions/:id/status
GET    /api/v1/service-catalog
POST   /api/v1/service-catalog
PUT    /api/v1/service-catalog/:id
```

## Frontend

Crear:

```text
src/features/stays/StayDetailPage.tsx
src/features/services/ServiceCatalogPage.tsx
src/features/services/StayServicesPage.tsx
src/features/services/ServiceForm.tsx
```

Actualizar `PedidosAlimentos.tsx` y `Lavanderia.tsx` para seleccionar una estancia activa en lugar de solicitar únicamente el nombre del huésped.

La vista de estancia deberá incluir:

```text
Resumen | Servicios | Pagos | Cuenta | Historial
```

### Criterios de aceptación

- Una estancia puede tener múltiples servicios.
- Alimentos y lavandería quedan asociados a IDs reales.
- Los servicios se agrupan por cliente y estancia.
- Un servicio cancelado no entra en facturación.
- Un servicio entregado o consumido puede facturarse.

---

# FASE 3 — Factura digital y estado de cuenta

## Objetivo

Generar una factura consolidada con hospedaje, servicios, pagos y saldo pendiente.

## Backend

### Tabla `invoices`

```text
id
invoice_number
customer_id
reservation_id
stay_id
subtotal
tax
discount
total
paid_amount
balance
status
issued_at
issued_by
voided_at
void_reason
```

Estados: `Borrador`, `Emitida`, `Parcial`, `Pagada`, `Anulada`.

### Tabla `invoice_items`

```text
id
invoice_id
service_type
source_id
description
quantity
unit_price
subtotal
tax
total
```

### Reglas

- Una factura emitida no se modifica.
- Para corregir una factura se anula y se genera otra.
- Los precios quedan congelados en sus líneas.
- Los pagos se aplican a la factura correspondiente.
- El total debe coincidir con sus líneas.
- Los servicios consumidos pueden agregarse automáticamente.

### Endpoints

```text
POST /api/v1/invoices
GET  /api/v1/invoices
GET  /api/v1/invoices/:id
POST /api/v1/invoices/:id/issue
GET  /api/v1/invoices/:id/pdf
POST /api/v1/invoices/:id/void
POST /api/v1/invoices/:id/payments
```

## Frontend

Crear:

```text
src/features/invoices/InvoicesPage.tsx
src/features/invoices/InvoiceDetailPage.tsx
src/features/invoices/InvoicePreview.tsx
src/features/invoices/InvoiceItems.tsx
```

Actualizar:

```text
src/CuentasCobros.tsx
src/services/billing.service.ts
src/services/types.ts
src/services/apiClient.ts
```

Funciones:

- Crear factura desde una estancia.
- Agregar hospedaje y servicios.
- Ver historial de abonos.
- Ver saldo.
- Emitir factura.
- Descargar PDF.
- Imprimir.
- Anular con autorización administrativa.

Antes de desarrollar factura fiscal se debe confirmar si se requiere únicamente un comprobante interno o una factura legal con numeración, impuestos, firma digital e integración tributaria.

---

# FASE 4 — Caja y conciliación financiera

## Objetivo

Relacionar cada cobro automáticamente con la caja y el turno correctos.

## Backend

Agregar a `cash_movements`:

```text
payment_id
invoice_id
customer_id
reservation_id
created_by
```

Reglas:

- Un pago en efectivo aumenta el efectivo esperado.
- Un pago digital se registra como ingreso digital.
- No se duplica manualmente un pago automático.
- Una anulación genera un movimiento inverso.
- El cierre de caja compara pagos contra movimientos.
- Cada movimiento identifica al usuario que lo registró.

### Endpoints

```text
GET /api/v1/reports/cash/reconciliation
GET /api/v1/reports/cash/by-method
GET /api/v1/reports/cash/by-user
```

## Frontend

Actualizar:

```text
src/CajaCierres.tsx
src/services/cash.service.ts
```

Agregar:

- Detalle de pagos automáticos.
- Filtros por método y usuario.
- Comparación entre cobros y movimientos.
- Alertas de descuadre.
- Confirmación antes de cerrar caja.
- Separación entre efectivo y dinero digital.

---

# FASE 5 — Dashboard administrativo y reportes

## Objetivo

Proporcionar información confiable para administración.

## Backend

Crear:

```text
src/services/report.service.ts
src/controllers/report.controller.ts
src/routes/report.routes.ts
src/repositories/report.repository.ts
```

### Dashboard diario

```text
GET /api/v1/reports/dashboard?date=YYYY-MM-DD
```

Debe incluir:

- Ingresos cobrados.
- Ingresos facturados.
- Efectivo, tarjetas y transferencias.
- Anticipos.
- Hospedaje, alimentos, lavandería y otros servicios.
- Clientes activos.
- Reservas del día.
- Saldo pendiente.
- Estado de caja.

### Otros reportes

```text
GET /api/v1/reports/services?from=...&to=...
GET /api/v1/reports/revenue/monthly?year=2026
GET /api/v1/reports/receivables
GET /api/v1/reports/revenue/categories
```

Siempre se deben diferenciar:

- **Facturado:** lo vendido.
- **Cobrado:** dinero recibido.
- **Pendiente:** dinero aún no recibido.

## Frontend

Crear:

```text
src/features/reports/ReportsPage.tsx
src/features/reports/DailyRevenueReport.tsx
src/features/reports/MonthlyRevenueReport.tsx
src/features/reports/ServicesReport.tsx
src/features/reports/ReceivablesReport.tsx
src/features/reports/ReportFilters.tsx
```

Actualizar:

```text
src/Dashboard.tsx
src/services/dashboard.service.ts
```

Agregar selector de fecha, tarjetas de ingresos, gráficos por categoría, gráficos por método de pago, tabla de servicios, cuentas pendientes, exportación CSV, impresión y última actualización.

Se puede utilizar `recharts` para gráficos o comenzar con tablas y gráficos CSS para mantener el proyecto liviano.

### Criterios de aceptación

- Administración consulta ingresos diarios y mensuales.
- Puede filtrar por categoría y método de pago.
- Los reportes coinciden con facturas y caja.
- Los resultados se pueden imprimir o exportar.

---

# FASE 6 — Asistencia del personal

## Objetivo

Controlar entradas, salidas, ausencias y tardanzas.

## Backend

### Tabla `staff_schedules`

```text
id
user_id
day_of_week
start_time
end_time
active
```

### Tabla `attendance_records`

```text
id
user_id
attendance_date
check_in
check_out
status
justification
registered_by
created_at
updated_at
```

Estados: `Presente`, `Tarde`, `Ausente`, `Permiso`, `Incapacidad`.

### Endpoints

```text
POST /api/v1/attendance/check-in
POST /api/v1/attendance/check-out
POST /api/v1/attendance/absence
GET  /api/v1/attendance/today
GET  /api/v1/attendance
GET  /api/v1/attendance/report
PUT  /api/v1/attendance/:id
```

### Permisos

- El empleado registra entrada y salida.
- Recepción consulta su estado.
- Administración edita, justifica y genera reportes.
- STAFF no modifica registros históricos.

## Frontend

Crear:

```text
src/features/attendance/AttendancePage.tsx
src/features/attendance/MyAttendance.tsx
src/features/attendance/AttendanceReport.tsx
src/features/attendance/SchedulePage.tsx
```

Funciones: entrada, salida, estado actual, personal presente, ausencias, justificaciones, filtros por fecha, reporte mensual y tardanzas.

---

# FASE 7 — Seguridad, auditoría y calidad

## Backend

Crear tabla `audit_logs`:

```text
id
user_id
action
entity
entity_id
old_values
new_values
ip_address
created_at
```

Registrar como mínimo:

- Crear reserva.
- Registrar o anular pagos.
- Emitir o anular facturas.
- Cerrar caja.
- Modificar asistencia.
- Cambiar roles.

Aplicar `requireRole()` en reportes financieros, anulaciones, facturación, catálogo de servicios, asistencia y usuarios.

## Frontend

Agregar ocultamiento de opciones no autorizadas, pantalla 403, confirmaciones, prevención de doble clic, estados de carga, manejo de sesión expirada y mensajes claros de error.

---

# FASE 8 — Migración de datos existentes

## Huéspedes

Los registros actuales de `guests` deben convertirse progresivamente en:

```text
customers
reservations
stays
```

## Cuentas

Los registros actuales de `billing_accounts` deben migrarse a facturas o cuentas históricas.

Los datos actuales no siempre permiten conocer fecha, método o usuario real del abono. Deben registrarse como:

```text
Pago histórico migrado
Método: Desconocido
Fecha: Fecha de migración
```

No se debe inventar información contable.

## Alimentos y lavandería

- Utilizar `guest_id` cuando exista.
- Relacionar con la estancia correspondiente.
- Marcar para revisión los registros ambiguos.
- No asociar únicamente por nombre si existen duplicados.

---

# FASE 9 — Pruebas y validación

## Backend

Probar clientes, reservas, anticipos del 50%, pagos parciales, pagos duplicados, anulaciones, servicios por estancia, facturas consolidadas, cierres de caja, reportes, permisos y asistencia.

## Frontend

Agregar pruebas unitarias de componentes, formularios, permisos, carga, errores, integración con API y pruebas end-to-end con Playwright.

Flujos E2E prioritarios:

```text
Login → Crear reserva → Registrar anticipo → Check-in
Check-in → Agregar servicio → Emitir factura → Registrar saldo
Abrir caja → Recibir pago → Cerrar caja
Consultar dashboard → Filtrar ingresos mensuales
Registrar entrada → Registrar salida
```

---

# 10. Orden recomendado de desarrollo

```text
Fase 0  Preparación técnica
Fase 1  Clientes, reservas y anticipos
Fase 2  Estancias y servicios
Fase 3  Factura digital
Fase 4  Integración de caja
Fase 5  Dashboard y reportes
Fase 6  Asistencia
Fase 7  Seguridad y auditoría
Fase 8  Migración final
Fase 9  Pruebas y estabilización
```

## Dependencias críticas

- No construir reportes definitivos antes de tener historial de pagos.
- No generar facturas completas antes de centralizar servicios.
- No migrar definitivamente `guests` hasta definir clientes, reservas y estancias.
- No implementar factura fiscal sin confirmar requisitos legales.
- No eliminar endpoints actuales hasta validar la migración del frontend.

---

# 11. Resultado final esperado

El sistema deberá permitir:

1. Crear una reserva asociada a un cliente.
2. Registrar el 50% o cualquier anticipo configurable.
3. Buscar al cliente en recepción y visualizar su saldo.
4. Registrar todos los servicios de la estancia.
5. Consolidar hospedaje y servicios en una factura.
6. Registrar pagos con historial y método.
7. Actualizar automáticamente la caja.
8. Consultar ingresos diarios y mensuales.
9. Ver servicios vendidos por categoría.
10. Controlar la asistencia del personal.
11. Auditar operaciones financieras.
12. Mantener permisos correctos para administración, recepción y staff.

La prioridad técnica es construir esta trazabilidad:

```text
Cliente → Reserva → Servicio → Factura → Pago → Caja
```

Esta relación será la base para que todos los reportes posteriores sean confiables.
