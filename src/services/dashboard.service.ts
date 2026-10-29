import { FoodOrderRepository } from "../repositories/food-order.repository.js";
import { LaundryRepository } from "../repositories/laundry.repository.js";
import { GuestRepository } from "../repositories/guest.repository.js";
import { CashRepository } from "../repositories/cash.repository.js";
import { ReportRepository } from "../repositories/report.repository.js";
import { ReportService } from "./report.service.js";
import { config } from "../config/env.js";
import { businessToday } from "../utils/business-time.js";

export class DashboardService {
  constructor(
    private orderRepo: FoodOrderRepository,
    private laundryRepo: LaundryRepository,
    private guestRepo: GuestRepository,
    private cashRepo: CashRepository,
    private reportService: ReportService = new ReportService(new ReportRepository())
  ) {}

  public async getMetrics() {
    const today = businessToday(config.businessTimezone);
    const [daily, pendingOrders, pendingLaundry, guests, currentCash] = await Promise.all([
      this.reportService.getDailyDashboard(today),
      this.orderRepo.countPending(),
      this.laundryRepo.countPending(),
      this.guestRepo.findAll(),
      this.cashRepo.getCurrentSession(),
    ]);
    const activeStays = guests.filter(g => g.estado === "Activo").length;
    const recentTransactions = daily.recentPayments.slice(0, 4).map(payment => ({
      guest: payment.customerName,
      service: `${payment.kind === "REVERSAL" ? "Reversión" : "Pago"} · ${payment.method}`,
      date: payment.paymentDate,
      amount: `$ ${payment.amount.toFixed(2)}`,
      status: payment.kind === "REVERSAL" ? "Revertido" : "Cobrado",
    }));

    return {
      stats: [
        {
          label: "Ingresos del día",
          value: `$ ${daily.income.collected.toFixed(2)}`,
          detail: "Pagos registrados",
          code: "revenue",
          className: "stat-green",
        },
        {
          label: "Cuentas abiertas",
          value: daily.receivables.count.toString(),
          detail: "Huéspedes con saldo activo",
          code: "accounts",
          className: "stat-blue",
        },
        {
          label: "Pedidos pendientes",
          value: pendingOrders.toString(),
          detail: "Solicitudes por atender",
          code: "orders",
          className: "stat-orange",
        },
        {
          label: "Lavandería pendiente",
          value: pendingLaundry.toString(),
          detail: "Solicitudes en proceso",
          code: "laundry",
          className: "stat-purple",
        },
      ],
      activeStays,
      cashRegisterActive: currentCash !== null,
      recentTransactions,
    };
  }
}
