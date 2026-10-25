# Respaldo, ensayo y restauración de Turso

Este runbook usa Node.js y `@libsql/client` con `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` del `.env`. No requiere Turso CLI.

## Principios de seguridad

1. No ejecutar primero sobre el destino remoto.
2. No usar `db:seed` sobre datos reales.
3. Crear un respaldo local, calcular su SHA-256 y validar su integridad.
4. Ensayar migraciones y conversión sobre una copia independiente.
5. Conservar las tablas heredadas y dejar asociaciones ambiguas en `REVIEW`.
6. Aplicar al destino solo después de verificar el ensayo.

## 1. Configuración

El `.env` debe contener:

```env
TURSO_DATABASE_URL=libsql://<base>.turso.io
TURSO_AUTH_TOKEN=<token>
AUTO_MIGRATE=false
ALLOW_DEMO_SEED=false
```

No imprimir ni versionar el token. Confirmar que la URL corresponde al destino esperado.

## 2. Respaldo remoto

```powershell
npm run db:backup
```

El comando:

- crea `backups/nicabliss-pre-migration-<timestamp>.db`;
- copia esquema, índices, triggers, vistas y filas;
- compara los conteos de cada tabla entre origen y copia;
- ejecuta `PRAGMA integrity_check` y `PRAGMA foreign_key_check`;
- imprime el checksum SHA-256.

`backups/` está ignorado por Git. Conservar el archivo y checksum fuera del equipo de despliegue antes de una migración de producción.

## 3. Copia de ensayo local

Crear una copia de trabajo para mantener inmutable el respaldo:

```powershell
$Backup = Get-ChildItem "backups\nicabliss-pre-migration-*.db" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
Copy-Item $Backup.FullName "backups\nicabliss-rehearsal.db"
```

Aplicar las migraciones exclusivamente sobre esa copia:

```powershell
npx cross-env NODE_ENV=development `
  TURSO_DATABASE_URL=file:backups/nicabliss-rehearsal.db `
  TURSO_AUTH_TOKEN= npm run db:migrate

npx cross-env NODE_ENV=development `
  TURSO_DATABASE_URL=file:backups/nicabliss-rehearsal.db `
  TURSO_AUTH_TOKEN= npm run db:verify
```

## 4. Preview y conversión en el ensayo

```powershell
npx cross-env NODE_ENV=development `
  TURSO_DATABASE_URL=file:backups/nicabliss-rehearsal.db `
  TURSO_AUTH_TOKEN= npm run db:legacy:preview

npx cross-env NODE_ENV=development `
  TURSO_DATABASE_URL=file:backups/nicabliss-rehearsal.db `
  TURSO_AUTH_TOKEN= npm run db:legacy:execute

# Segunda ejecución obligatoria para probar idempotencia.
npx cross-env NODE_ENV=development `
  TURSO_DATABASE_URL=file:backups/nicabliss-rehearsal.db `
  TURSO_AUTH_TOKEN= npm run db:legacy:execute
```

Revisar conteos, filas `REVIEW`, cuentas históricas y ausencia de duplicados. No resolver coincidencias dudosas solo por nombre.

## 5. Aplicación al destino remoto

Solo después de aprobar el ensayo:

```powershell
npm run db:migrate
npm run db:verify
npm run db:legacy:preview

$env:ALLOW_LEGACY_MIGRATION = "true"
$env:LEGACY_MIGRATION_CONFIRMATION = "BACKUP_VERIFIED"
npm run db:legacy:execute
npm run db:legacy:execute
npm run db:verify
```

La conversión remota queda bloqueada si faltan las dos variables de confirmación. La segunda ejecución debe producir los mismos conteos.

## 6. Validación funcional

Levantar la API con el `.env` remoto y verificar, como mínimo:

- login y perfil autenticado;
- clientes, habitaciones, reservas y estancias;
- catálogo y consumos;
- facturas y pagos en modo lectura;
- caja, dashboard y reportes;
- asistencia;
- endpoints heredados.

Las suites automatizadas y Playwright deben continuar usando exclusivamente `file:test.db`; no deben ejecutarse apuntando a Turso.

## Reversión

Las migraciones son aditivas. Ante un incidente:

1. detener escrituras;
2. conservar la base incidente para análisis;
3. copiar el respaldo verificado a una nueva base LibSQL/Turso con un proceso controlado;
4. ejecutar comprobaciones de integridad y conteos;
5. cambiar `TURSO_DATABASE_URL` y el token de la aplicación;
6. reabrir tráfico después de validar el sistema.

No eliminar la base anterior hasta cerrar la auditoría.
