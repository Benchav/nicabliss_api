import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DashboardService } from "../../src/services/dashboard.service.js";
import { FoodOrderRepository } from "../../src/repositories/food-order.repository.js";
import { LaundryRepository } from "../../src/repositories/laundry.repository.js";
import { GuestRepository } from "../../src/repositories/guest.repository.js";
import { CashRepository } from "../../src/repositories/cash.repository.js";
import { ReportService } from "../../src/services/report.service.js";
import { config } from "../../src/config/env.js";
import { businessToday } from "../../src/utils/business-time.js";

describe("DashboardService Unit Tests", () => {
  it("debe agregar métricas en tiempo real de todos los módulos", async () => {
    let requestedDate = "";
    const reportService = {
      getDailyDashboard: async (date: string) => {
        requestedDate = date;
        return {
          income: { collected: 42.5 },
          receivables: { count: 3 },
          recentPayments: [{
            customerName: "Cliente canónico",
            kind: "PAYMENT",
            method: "Transferencia",
            paymentDate: "2026-10-29T18:00:00.000Z",
            paymentNumber: "PAY-2026-0000001",
            amount: 42.5,
          }],
        };
      },
    } as unknown as ReportService;
    const dashboardService = new DashboardService(
      { countPending: async () => 2 } as FoodOrderRepository,
      { countPending: async () => 4 } as LaundryRepository,
      { findAll: async () => [{ estado: "Activo" }] } as GuestRepository,
      { getCurrentSession: async () => null } as CashRepository,
      reportService
    );

    const metrics = await dashboardService.getMetrics();

    assert.equal(requestedDate, businessToday(config.businessTimezone));
    assert.ok(metrics.stats.length === 4);
    assert.equal(metrics.stats[0].label, "Ingresos del día");
    assert.equal(metrics.stats[0].value, "$ 42.50");
    assert.equal(metrics.stats[1].label, "Cuentas abiertas");
    assert.equal(metrics.stats[1].value, "3");
    assert.equal(metrics.stats[2].label, "Pedidos pendientes");
    assert.equal(metrics.stats[2].value, "2");
    assert.equal(metrics.stats[3].label, "Lavandería pendiente");
    assert.equal(metrics.stats[3].value, "4");
    assert.equal(metrics.recentTransactions[0].guest, "Cliente canónico");
    assert.equal(metrics.recentTransactions[0].amount, "$ 42.50");
  });
});
