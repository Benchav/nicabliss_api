import { FoodOrderModel } from "../models/food-order.model.js";

export class FoodOrderRepository {
  private orders: Map<number, FoodOrderModel> = new Map();

  constructor() {
    this.seed();
  }

  private seed(): void {
    const initial: FoodOrderModel[] = [
      { id: 101, orderCode: "#PED-024", huesped: "María González", habitacion: "Habitación 01", productos: "2 desayunos americanos", total: 12, estado: "Pendiente", fecha: "19/10/2026" },
      { id: 102, orderCode: "#PED-023", huesped: "Carlos Mendoza", habitacion: "Habitación 04", productos: "1 sándwich y 1 café", total: 7.5, estado: "En preparación", fecha: "19/10/2026" },
      { id: 103, orderCode: "#PED-022", huesped: "Sophie Laurent", habitacion: "Habitación 07", productos: "1 desayuno continental", total: 6, estado: "Entregado", fecha: "19/10/2026" },
    ];
    for (const o of initial) {
      this.orders.set(o.id, o);
    }
  }

  public async findAll(search?: string): Promise<FoodOrderModel[]> {
    const all = Array.from(this.orders.values());
    if (!search?.trim()) return all.map(o => ({ ...o }));
    const term = search.toLowerCase().trim();
    return all
      .filter(o => `${o.huesped} ${o.habitacion} ${o.orderCode} ${o.productos}`.toLowerCase().includes(term))
      .map(o => ({ ...o }));
  }

  public async findById(id: number): Promise<FoodOrderModel | null> {
    const o = this.orders.get(id);
    return o ? { ...o } : null;
  }

  public async save(order: FoodOrderModel): Promise<void> {
    this.orders.set(order.id, { ...order });
  }

  public async countPending(): Promise<number> {
    let count = 0;
    for (const o of this.orders.values()) {
      if (o.estado === "Pendiente" || o.estado === "En preparación" || o.estado === "En camino") {
        count++;
      }
    }
    return count;
  }
}
