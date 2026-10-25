# Despliegue de producción

El backend y frontend se despliegan como proyectos separados. Reservar primero ambos dominios HTTPS para evitar usar CORS abierto.

## 1. Backend

Configurar en la plataforma todas las variables de `.env.production.example`:

- `NODE_ENV=production`
- `JWT_SECRET` aleatorio de al menos 32 caracteres
- `CORS_ORIGIN=https://<dominio-frontend>`
- `TRUST_PROXY=true`
- `BUSINESS_TIMEZONE=America/Managua`
- `AUTO_MIGRATE=false`
- `ALLOW_DEMO_SEED=false`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

Antes de abrir tráfico:

```bash
npm ci
npm run build
npm run db:verify
npm run db:production:check
```

La contraseña demo de `admin` hace fallar intencionalmente el último comando. Para rotarla, cargar temporalmente `ADMIN_NEW_PASSWORD` sin guardarla en Git y ejecutar:

```powershell
$env:ALLOW_ADMIN_PASSWORD_ROTATION = "true"
$env:ADMIN_PASSWORD_ROTATION_CONFIRMATION = "ROTATE_REMOTE_ADMIN"
npm run db:admin:rotate-password
```

Eliminar esas tres variables inmediatamente después. Comprobar:

```text
GET https://<backend>/health  -> 200
GET https://<backend>/ready   -> 200, schemaVersion 009
```

## 2. Frontend

Configurar las variables de `.env.production.example`:

```env
VITE_API_URL=https://<dominio-backend>/api/v1
VITE_BUSINESS_TIMEZONE=America/Managua
```

Ejecutar `npm ci && npm run build`. Los builds de CI/Vercel rechazan una URL ausente, HTTP, localhost o sin `/api/v1`.

## 3. Smoke posterior

1. Iniciar sesión con la credencial administrativa rotada.
2. Abrir dashboard, clientes, reservas, estancias, facturas, caja, reportes, asistencia, catálogo, usuarios y datos heredados.
3. Confirmar que el navegador no muestra errores CORS ni respuestas `4xx/5xx` inesperadas.
4. Crear una reserva de validación, registrar pago, check-in, servicio, factura y cierre de caja.
5. Conservar ese flujo como evidencia o anularlo mediante operaciones contables; no borrar pagos publicados.

## Reversión

No ejecutar `DROP` ni seeds. Detener tráfico, conservar la base incidente y cambiar las credenciales de la aplicación hacia una base restaurada desde el respaldo verificado según `turso-backup-rehearsal.md`.
