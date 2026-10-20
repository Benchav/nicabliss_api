import { GuestModel } from "../models/guest.model.js";

export class GuestRepository {
  private guests: Map<number, GuestModel> = new Map();

  constructor() {
    this.seed();
  }

  private seed(): void {
    const initial: GuestModel[] = [
      { id: 1, nombre: "María González", documento: "001-150298-0001A", habitacion: "Habitación 01", entrada: "2026-10-17", salida: "2026-10-20", estado: "Activo" },
      { id: 2, nombre: "Carlos Mendoza", documento: "001-230195-0002B", habitacion: "Habitación 04", entrada: "2026-10-18", salida: "2026-10-22", estado: "Activo" },
      { id: 3, nombre: "Sophie Laurent", documento: "P12345678", habitacion: "Habitación 07", entrada: "2026-10-15", salida: "2026-10-19", estado: "Finalizado" },
      { id: 4, nombre: "James Wilson", documento: "P87654321", habitacion: "Habitación 03", entrada: "2026-10-21", salida: "2026-10-25", estado: "Reservado" },
    ];
    for (const g of initial) {
      this.guests.set(g.id, g);
    }
  }

  public async findAll(search?: string): Promise<GuestModel[]> {
    const all = Array.from(this.guests.values());
    if (!search?.trim()) return all.map(g => ({ ...g }));
    const term = search.toLowerCase().trim();
    return all
      .filter(g => `${g.nombre} ${g.documento} ${g.habitacion}`.toLowerCase().includes(term))
      .map(g => ({ ...g }));
  }

  public async findById(id: number): Promise<GuestModel | null> {
    const g = this.guests.get(id);
    return g ? { ...g } : null;
  }

  public async save(guest: GuestModel): Promise<void> {
    this.guests.set(guest.id, { ...guest });
  }

  public async delete(id: number): Promise<boolean> {
    return this.guests.delete(id);
  }
}
