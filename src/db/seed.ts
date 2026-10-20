import { dbClient } from "./client.js";
import { PasswordHasher } from "../utils/hasher.js";
import { Logger } from "../utils/logger.js";

export async function runSeeds(): Promise<void> {
  Logger.info("Verificando y ejecutando seeds en Turso...", "SEED");

  // 1. Seed Usuario Admin
  const existingUsers = await dbClient.execute("SELECT COUNT(*) as count FROM users;");
  const userCount = Number(existingUsers.rows[0].count);
  if (userCount === 0) {
    const adminHash = PasswordHasher.hashSync("12345");
    await dbClient.execute({
      sql: `INSERT INTO users (id, username, email, password_hash, role, full_name, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?);`,
      args: [
        "usr_admin_001",
        "admin",
        "admin@nicabliss.com",
        adminHash,
        "ADMIN",
        "Administrador Nicabliss",
        new Date().toISOString(),
      ],
    });
    Logger.info("Usuario administrador inicial insertado.", "SEED");
  }

  // 2. Seed Huéspedes
  const existingGuests = await dbClient.execute("SELECT COUNT(*) as count FROM guests;");
  const guestCount = Number(existingGuests.rows[0].count);
  if (guestCount === 0) {
    const guests = [
      { id: 1, nombre: "María González", documento: "001-150298-0001A", habitacion: "Habitación 01", entrada: "2026-10-17", salida: "2026-10-20", estado: "Activo" },
      { id: 2, nombre: "Carlos Mendoza", documento: "001-230195-0002B", habitacion: "Habitación 04", entrada: "2026-10-18", salida: "2026-10-22", estado: "Activo" },
      { id: 3, nombre: "Sophie Laurent", documento: "P12345678", habitacion: "Habitación 07", entrada: "2026-10-15", salida: "2026-10-19", estado: "Finalizado" },
      { id: 4, nombre: "James Wilson", documento: "P87654321", habitacion: "Habitación 03", entrada: "2026-10-21", salida: "2026-10-25", estado: "Reservado" },
    ];
    for (const g of guests) {
      await dbClient.execute({
        sql: `INSERT INTO guests (id, nombre, documento, habitacion, entrada, salida, estado, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        args: [g.id, g.nombre, g.documento, g.habitacion, g.entrada, g.salida, g.estado, new Date().toISOString()],
      });
    }
    Logger.info("Huéspedes iniciales insertados.", "SEED");
  }

  // 3. Seed Cuentas de Cobro
  const existingBilling = await dbClient.execute("SELECT COUNT(*) as count FROM billing_accounts;");
  const billingCount = Number(existingBilling.rows[0].count);
  if (billingCount === 0) {
    const accounts = [
      { id: 1001, huesped: "María González", habitacion: "Habitación 01", concepto: "Hospedaje", total: 40, pagado: 40, saldo: 0, estado: "Pagado", fecha: "2026-10-19" },
      { id: 1002, huesped: "Carlos Mendoza", habitacion: "Habitación 04", concepto: "Alimentación", total: 12.5, pagado: 0, saldo: 12.5, estado: "Pendiente", fecha: "2026-10-19" },
      { id: 1003, huesped: "Sophie Laurent", habitacion: "Habitación 07", concepto: "Lavandería", total: 8, pagado: 3, saldo: 5, estado: "Parcial", fecha: "2026-10-19" },
    ];
    for (const a of accounts) {
      await dbClient.execute({
        sql: `INSERT INTO billing_accounts (id, huesped, habitacion, concepto, total, pagado, saldo, estado, fecha)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        args: [a.id, a.huesped, a.habitacion, a.concepto, a.total, a.pagado, a.saldo, a.estado, a.fecha],
      });
    }
    Logger.info("Cuentas de cobro iniciales insertadas.", "SEED");
  }

  // 4. Seed Pedidos de Alimentos
  const existingOrders = await dbClient.execute("SELECT COUNT(*) as count FROM food_orders;");
  const ordersCount = Number(existingOrders.rows[0].count);
  if (ordersCount === 0) {
    const orders = [
      { id: 101, orderCode: "#PED-024", huesped: "María González", habitacion: "Habitación 01", productos: "2 desayunos americanos", total: 12, estado: "Pendiente", fecha: "19/10/2026" },
      { id: 102, orderCode: "#PED-023", huesped: "Carlos Mendoza", habitacion: "Habitación 04", productos: "1 sándwich y 1 café", total: 7.5, estado: "En preparación", fecha: "19/10/2026" },
      { id: 103, orderCode: "#PED-022", huesped: "Sophie Laurent", habitacion: "Habitación 07", productos: "1 desayuno continental", total: 6, estado: "Entregado", fecha: "19/10/2026" },
    ];
    for (const o of orders) {
      await dbClient.execute({
        sql: `INSERT INTO food_orders (id, order_code, huesped, habitacion, productos, total, estado, fecha)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        args: [o.id, o.orderCode, o.huesped, o.habitacion, o.productos, o.total, o.estado, o.fecha],
      });
    }
    Logger.info("Pedidos de alimentos iniciales insertados.", "SEED");
  }

  // 5. Seed Lavandería
  const existingLaundry = await dbClient.execute("SELECT COUNT(*) as count FROM laundry_orders;");
  const laundryCount = Number(existingLaundry.rows[0].count);
  if (laundryCount === 0) {
    const laundry = [
      {
        id: 1001,
        huesped: "María González",
        habitacion: "Habitación 01",
        prendas: JSON.stringify([
          { tipo: "Camisa", cantidad: 2 },
          { tipo: "Pantalón", cantidad: 1 },
          { tipo: "Ropa interior", cantidad: 3 },
        ]),
        totalPrendas: 6,
        total: 3.0,
        estado: "Listo",
        fecha: "19/10/2026",
        observaciones: "Planchar camisa con cuidado",
      },
    ];
    for (const l of laundry) {
      await dbClient.execute({
        sql: `INSERT INTO laundry_orders (id, huesped, habitacion, prendas, total_prendas, total, estado, fecha, observaciones)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        args: [l.id, l.huesped, l.habitacion, l.prendas, l.totalPrendas, l.total, l.estado, l.fecha, l.observaciones],
      });
    }
    Logger.info("Órdenes de lavandería iniciales insertadas.", "SEED");
  }

  // 6. Seed Histórico de Caja
  const existingCash = await dbClient.execute("SELECT COUNT(*) as count FROM cash_sessions;");
  const cashCount = Number(existingCash.rows[0].count);
  if (cashCount === 0) {
    const sessionId = 9001;
    await dbClient.execute({
      sql: `INSERT INTO cash_sessions (
        id, responsable, apertura, cierre, fondo_inicial, ingresos_efectivo,
        ingresos_digitales, salidas_efectivo, efectivo_esperado, efectivo_contado,
        diferencia, observaciones, is_closed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      args: [
        sessionId,
        "Administrador",
        "18/10/2026, 08:00 AM",
        "18/10/2026, 06:00 PM",
        100,
        40,
        0,
        15,
        125,
        125,
        0,
        "Cierre de turno sin novedades",
        1,
      ],
    });

    await dbClient.execute({
      sql: `INSERT INTO cash_movements (id, session_id, fecha, tipo, concepto, descripcion, metodo, monto)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      args: [1, sessionId, "18/10/2026, 10:30 AM", "Ingreso", "Hospedaje", "Pago estancia habitación 01", "Efectivo", 40],
    });

    await dbClient.execute({
      sql: `INSERT INTO cash_movements (id, session_id, fecha, tipo, concepto, descripcion, metodo, monto)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      args: [2, sessionId, "18/10/2026, 02:15 PM", "Salida", "Gasto operativo", "Compra suministros de limpieza", "Efectivo", 15],
    });
    Logger.info("Historial de caja inicial insertado.", "SEED");
  }

  Logger.info("Seeds procesados correctamente en Turso.", "SEED");
}

if (process.argv[1] && process.argv[1].endsWith("seed.ts")) {
  runSeeds()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
