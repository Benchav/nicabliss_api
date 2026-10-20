# 🏨 Nicabliss API · Hotel Management Backend

Backend empresarial estructurado en **Capas Limpias (Layered Architecture)**, con modelos, controladores, servicios y repositorios en memoria centralizados para una máxima facilidad de lectura y entendimiento.

---

## 📂 Estructura del Proyecto

```
src/
├── config/                  # Variables de entorno y configuración (env.ts)
├── models/                  # Todos los Modelos de Datos del sistema
│   ├── user.model.ts
│   ├── guest.model.ts
│   ├── billing.model.ts
│   ├── food-order.model.ts
│   ├── laundry.model.ts
│   └── cash.model.ts
├── dtos/                    # Contratos de Datos (Data Transfer Objects)
│   ├── auth.dto.ts
│   ├── guest.dto.ts
│   ├── billing.dto.ts
│   ├── food-order.dto.ts
│   ├── laundry.dto.ts
│   └── cash.dto.ts
├── repositories/            # Almacenamiento en Memoria Thread-safe
│   ├── user.repository.ts
│   ├── guest.repository.ts
│   ├── billing.repository.ts
│   ├── food-order.repository.ts
│   ├── laundry.repository.ts
│   └── cash.repository.ts
├── services/                # Toda la Lógica de Negocio y Reglas
│   ├── auth.service.ts
│   ├── guest.service.ts
│   ├── billing.service.ts
│   ├── food-order.service.ts
│   ├── laundry.service.ts
│   ├── cash.service.ts
│   └── dashboard.service.ts
├── controllers/             # Controladores HTTP (Manejan req y res)
│   ├── auth.controller.ts
│   ├── guest.controller.ts
│   ├── billing.controller.ts
│   ├── food-order.controller.ts
│   ├── laundry.controller.ts
│   ├── cash.controller.ts
│   └── dashboard.controller.ts
├── routes/                  # Rutas Express (/api/v1/...)
│   ├── auth.routes.ts
│   ├── guest.routes.ts
│   ├── billing.routes.ts
│   ├── food-order.routes.ts
│   ├── laundry.routes.ts
│   ├── cash.routes.ts
│   ├── dashboard.routes.ts
│   └── index.ts
├── middlewares/             # Seguridad, JWT, CORS y Manejo de Errores
│   ├── auth.middleware.ts
│   ├── role.middleware.ts
│   ├── error.middleware.ts
│   └── logger.middleware.ts
├── utils/                   # Herramientas criptográficas y logger
│   ├── hasher.ts (Bcrypt)
│   ├── jwt.ts (JSON Web Tokens)
│   └── logger.ts
├── app.ts                   # Aplicación Express
└── server.ts                # Arranque del servidor HTTP
```

---

## 🧪 Suite de Pruebas Automatizadas (Senior QA Suite)

El proyecto cuenta con **33 pruebas automatizadas** que validan exhaustivamente cada componente, servicio, modelo y endpoint antes del despliegue:

- **Unit Tests:**
  - `auth.service.test.ts`: Login con Bcrypt, token JWT, validación de contraseñas incorrectas y control de usuarios duplicados.
  - `guest.service.test.ts`: Listado, búsqueda, creación y validación de reglas de negocio (fecha de salida no puede ser anterior a la de entrada).
  - `billing.service.test.ts`: Cálculo de totales, abonos parciales, liquidación total y rechazo de pagos mayores al saldo.
  - `food-order.service.test.ts`: Generación de códigos de orden (#PED-xxx) y flujo de preparación.
  - `laundry.service.test.ts`: Cálculo automático de $0.50 por prenda, conteo de prendas y validación de listas vacías.
  - `cash.service.test.ts`: Apertura de turno, prevención de turnos dobles, control de efectivo disponible, arqueo y cálculo de diferencia.
  - `dashboard.service.test.ts`: Agregación de KPIs operativos en tiempo real.
- **Integration Tests (E2E):**
  - `api.test.ts`: Health check (`GET /health`), autenticación JWT, protección de rutas (`401 Unauthorized`), respuestas 200 con Bearer Token y manejo semántico de errores (`404 Not Found`).

### Correr Pruebas:
```bash
npm test
```

---

## ⚡ Comandos para Ejecutar

```bash
# 1. Instalar dependencias
npm install

# 2. Correr las 33 pruebas unitarias y de integración
npm test

# 3. Iniciar en modo desarrollo con recarga en caliente
npm run dev

# 4. Compilar para producción
npm run build
npm start
```

---

## 🔐 Credenciales Iniciales

- **Usuario:** `admin`
- **Contraseña:** `12345`
- **Rol:** `ADMIN`
