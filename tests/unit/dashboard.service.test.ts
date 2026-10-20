import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DashboardService } from "../../src/services/dashboard.service.js";
import { BillingRepository } from "../../src/repositories/billing.repository.js";
import { FoodOrderRepository } from "../../src/repositories/food-order.repository.js";
import { LaundryRepository } from "../../src/repositories/laundry.repository.js";
import { GuestRepository } from "../../src/repositories/guest.repository.js";
import { CashRepository } from "../../src/repositories/cash.repository.js";

describe("DashboardService Unit Tests", () => {
  it("debe agregar métricas en tiempo real de todos los módulos", async () => {
    const dashboardService = new DashboardService(
      new BillingRepository(),
      new FoodOrderRepository(),
      new LaundryRepository(),
      new GuestRepository(),
      new CashRepository()
    );

    const metrics = await dashboardService.getMetrics();

    assert.ok(metrics.stats.length === 4);
    assert.equal(metrics.stats[0].label, "Ingresos del día");
    assert.equal(metrics.stats[1].label, "Cuentas abiertas");
    assert.equal(metrics.stats[2].label, "Pedidos pendientes");
    assert.equal(metrics.stats[3].label, "Lavandería pendiente");
    assert.ok(metrics.recentTransactions.length > 0);
  });
});
