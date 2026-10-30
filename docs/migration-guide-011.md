# Guía de despliegue: pedidos anticipados y cobro posterior

Esta guía cubre el cambio que introduce la migración `011` y los ajustes de pedidos, cuenta de estancia e historial de cliente.

## 1. Antes de desplegar

1. Confirmar que no hay una migración o despliegue en curso.
2. Generar un respaldo remoto verificado:

   ```bash
   npm run db:backup
   ```

   Guardar el archivo indicado en `backups/` y su checksum fuera del equipo de despliegue.

3. Ejecutar la verificación de producción para conocer los bloqueadores de entorno:

   ```bash
   npm run db:production:check
   ```

   Los bloqueadores de configuración deben resolverse antes de desplegar. La migración faltante no debe aparecer después del paso 2.

## 2. Aplicar la migración

```bash
npm run db:migrate
npm run db:verify
```

Resultado esperado:

- `appliedMigrations` y `expectedMigrations` en `11`.
- `checksumsMatch: true`.
- `integrity: "ok"`.
- `foreignKeyViolations: 0`.

La migración `011` solo agrega `food_orders.reservation_id` y su índice. Es aditiva y no elimina ni reescribe datos.

## 3. Desplegar el backend

1. Desplegar la versión nueva del backend.
2. Verificar salud y esquema:

   ```bash
   curl https://<backend>/health
   curl https://<backend>/ready
   ```

   `/ready` debe responder `200` con `schemaVersion: "011"`.

3. Probar un pedido anticipado controlado antes de abrir el frontend:
   - crear una reserva y confirmarla;
   - crear un pedido con `reservationId`;
   - verificar que el pedido queda sin `stayId`;
   - registrar check-in;
   - verificar que el pedido obtiene `stayId` una sola vez;
   - marcar `Entregado` y comprobar que aparece en la cuenta de la estancia.

## 4. Desplegar el frontend

Desplegar después de que el backend esté en `011`. La interfaz nueva requiere:

- `GET /reservations/:id/account`;
- pedidos con `reservationId`;
- historial de pagos del cliente;
- bloqueo de cargos después de emitir una factura.

## 5. Cambios operativos que debe conocer el equipo

- Los pedidos anticipados solo se aceptan para reservas **Confirmadas**. Una reserva pendiente debe confirmarse primero.
- Un pedido pasa por transiciones controladas. `Entregado` y `Cancelado` son estados terminales.
- “En camino” no se factura; solo `Entregado` o `Consumido` entran a la cuenta.
- Si la reserva se cancela o se marca como no presentada, sus pedidos previos se cancelan y no se cobran.
- Una factura emitida bloquea nuevos cargos y cambios de estado de alimentos, servicios y lavandería de esa estancia. Para modificarlos, primero debe anularse la factura.
- El check-out puede cerrarse con saldo pendiente. Ese saldo se puede cobrar después desde la reserva o desde el historial del cliente.
- Para cobrar se requiere una caja abierta y que el usuario sea su responsable.

## 6. Prueba rápida después del despliegue

1. Abrir caja.
2. Crear cliente y reserva; confirmar la reserva.
3. Crear pedido anticipado desde Alimentos.
4. Registrar check-in.
5. Marcar el pedido como `Entregado`.
6. Verificar el total de la cuenta de estancia.
7. Registrar check-out con saldo pendiente.
8. Registrar el pago posterior desde la reserva.
9. Abrir el cliente y confirmar que aparecen la estancia, el pago y el saldo actualizado.

## 7. Rollback

La migración `011` es aditiva: una versión anterior del backend puede seguir operando sin usar la columna nueva. Si el despliegue debe revertirse:

1. Volver a desplegar el backend anterior.
2. Volver a desplegar el frontend anterior.
3. No es necesario eliminar la columna `reservation_id`.
4. Si hubo corrupción de datos, restaurar el respaldo generado en el paso 1 y validar con `npm run db:verify`.

No ejecutar el rollback restaurando un respaldo si solo se revierte el código: se perderían los movimientos posteriores al respaldo.

## 8. Problemas frecuentes

| Código | Causa | Acción |
| --- | --- | --- |
| `RESERVATION_NOT_AVAILABLE` | La reserva no está confirmada o ya fue cerrada | Confirmar la reserva o revisar su estado |
| `INVOICE_ISSUED` | La estancia tiene una factura emitida | Anular la factura antes de agregar o modificar cargos |
| `PENDING_SERVICES` | Hay servicios sin entregar o cancelar | Resolverlos antes del check-out |
| `PAYMENT_EXCEEDS_BALANCE` | El monto supera el saldo real de la cuenta | Revisar el saldo de la reserva o de la estancia |
| `CASH_SESSION_REQUIRED` | No hay caja abierta | Abrir caja con el usuario que registrará el pago |
| `CASH_SESSION_OWNER_REQUIRED` | La caja pertenece a otro usuario | Usar el responsable de la caja o cerrar y abrir una nueva |

## 9. Notas de seguridad

- No ejecutar pruebas automatizadas contra la base remota.
- No usar `ALLOW_DEMO_SEED=true` en producción.
- Mantener `AUTO_MIGRATE=false`; la migración se ejecuta de forma explícita y supervisada.
- Conservar el respaldo y su checksum hasta confirmar que el sistema opera con normalidad.
