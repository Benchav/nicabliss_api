import { LaundryModel } from "../models/laundry.model.js";

export class LaundryRepository {
  private orders: Map<number, LaundryModel> = new Map();

  constructor() {
    this.seed();
  }

  private seed(): void {
    const initial: LaundryModel[] = [
      {
        id: 1001,
        huesped: "María González",
        habitacion: "Habitación 01",
        prendas: [
          { tipo: "Camisa", cantidad: 2 },
          { tipo: "Pantalón", cantidad: 1 },
          { tipo: "Ropa interior", cantidad: 3 },
        ],
        totalPrendas: 6,
        total: 3.0,
        estado: "Listo",
        fecha: "19/10/2026",
        observaciones: "Planchar camisa con cuidado",
      },
      {
        id: 1002,
        huesped: "Carlos Mendoza",
        habitacion: "Habitación 04",
        prendas: [
          { tipo: "Camiseta", cantidad: 3 },
          { tipo: "Short", cantidad: 2 },
        ],
        totalPrendas: 5,
        total: 2.5,
        estado: "En proceso",
        fecha: "19/10/2026",
        observaciones: "Entrega urgente antes de las 4 PM",
      },
    ];
    for (const o of initial) {
      this.orders.set(o.id, o);
    }
  }

  public async findAll(search?: string): Promise<LaundryModel[]> {
    const all = Array.from(this.orders.values());
    if (!search?.trim()) return all.map(o => ({ ...o, prendas: [...o.prendas] }));
    const term = search.toLowerCase().trim();
    return all
      .filter(o => `${o.huesped} ${o.habitacion}`.toLowerCase().includes(term))
      .map(o => ({ ...o, prendas: [...o.prendas] }));
  }

  public async findById(id: number): Promise<LaundryModel | null> {
    const o = this.orders.get(id);
    return o ? { ...o, prendas: [...o.prendas] } : null;
  }

  public async save(order: LaundryModel): Promise<void> {
    this.orders.set(order.id, { ...order, prendas: [...order.prendas] });
  }

  public async countPending(): Promise<number> {
    let count = 0;
    for (const o of this.orders.values()) {
      if (o.estado === "Pendiente" || o.estado === "En proceso") {
        count++;
      }
    }
    return count;
  }
}
