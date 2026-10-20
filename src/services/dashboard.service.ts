import { BillingRepository } from "../repositories/billing.repository.js";
import { FoodOrderRepository } from "../repositories/food-order.repository.js";
import { LaundryRepository } from "../repositories/laundry.repository.js";
import { GuestRepository } from "../repositories/guest.repository.js";
import { CashRepository } from "../repositories/cash.repository.js";

export class DashboardService {
  constructor(
    private billingRepo: BillingRepository,
    private orderRepo: FoodOrderRepository,
    private laundryRepo: LaundryRepository,
    private guestRepo: GuestRepository,
    private cashRepo: CashRepository
  ) {}

  public async getMetrics() {
    const billingTotals = await this.billingRepo.getTotals();
    const pendingOrders = await this.orderRepo.countPending();
    const pendingLaundry = await this.laundryRepo.countPending();
    const guests = await this.guestRepo.findAll();
    const activeStays = guests.filter(g => g.estado === "Activo").length;
    const currentCash = await this.cashRepo.getCurrentSession();
    const allAccounts = await this.billingRepo.findAll();

    const recentTransactions = allAccounts.slice(0, 4).map(a => ({
      guest: a.huesped,
      service: a.concepto,
      date: a.fecha,
      amount: `$ ${a.total.toFixed(2)}`,
      status: a.estado === "Pagado" ? "Completado" : "Pendiente",
    }));

    return {
      stats: [
        {
          label: "Ingresos del día",
          value: `$ ${billingTotals.totalCobrado.toFixed(2)}`,
          detail: "Pagos registrados",
          code: "revenue",
          className: "stat-green",
        },
        {
          label: "Cuentas abiertas",
          value: allAccounts.filter(a => a.estado !== "Pagado").length.toString(),
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
