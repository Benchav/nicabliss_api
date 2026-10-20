import { BillingModel } from "../models/billing.model.js";

export class BillingRepository {
  private accounts: Map<number, BillingModel> = new Map();

  constructor() {
    this.seed();
  }

  private seed(): void {
    const initial: BillingModel[] = [
      { id: 1001, huesped: "María González", habitacion: "Habitación 01", concepto: "Hospedaje", total: 40, pagado: 40, saldo: 0, estado: "Pagado", fecha: "2026-10-19" },
      { id: 1002, huesped: "Carlos Mendoza", habitacion: "Habitación 04", concepto: "Alimentación", total: 12.5, pagado: 0, saldo: 12.5, estado: "Pendiente", fecha: "2026-10-19" },
      { id: 1003, huesped: "Sophie Laurent", habitacion: "Habitación 07", concepto: "Lavandería", total: 8, pagado: 3, saldo: 5, estado: "Parcial", fecha: "2026-10-19" },
    ];
    for (const a of initial) {
      this.accounts.set(a.id, a);
    }
  }

  public async findAll(search?: string): Promise<BillingModel[]> {
    const all = Array.from(this.accounts.values());
    if (!search?.trim()) return all.map(a => ({ ...a }));
    const term = search.toLowerCase().trim();
    return all
      .filter(a => `${a.huesped} ${a.habitacion} ${a.concepto}`.toLowerCase().includes(term))
      .map(a => ({ ...a }));
  }

  public async findById(id: number): Promise<BillingModel | null> {
    const a = this.accounts.get(id);
    return a ? { ...a } : null;
  }

  public async save(account: BillingModel): Promise<void> {
    this.accounts.set(account.id, { ...account });
  }

  public async getTotals() {
    let facturado = 0;
    let cobrado = 0;
    for (const a of this.accounts.values()) {
      facturado += a.total;
      cobrado += a.pagado;
    }
    return {
      totalFacturado: Number(facturado.toFixed(2)),
      totalCobrado: Number(cobrado.toFixed(2)),
      saldoPendiente: Number((facturado - cobrado).toFixed(2)),
    };
  }
}
