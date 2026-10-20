import { CashSessionModel } from "../models/cash.model.js";

export class CashRepository {
  private currentSession: CashSessionModel | null = null;
  private history: CashSessionModel[] = [];

  constructor() {
    this.seed();
  }

  private seed(): void {
    const closed: CashSessionModel = {
      id: 9001,
      responsable: "Administrador",
      apertura: "18/10/2026, 08:00 AM",
      cierre: "18/10/2026, 06:00 PM",
      fondoInicial: 100,
      ingresosEfectivo: 40,
      ingresosDigitales: 0,
      salidasEfectivo: 15,
      efectivoEsperado: 125,
      efectivoContado: 125,
      diferencia: 0,
      observaciones: "Cierre de turno sin novedades",
      isClosed: true,
      movimientos: [
        { id: 1, fecha: "18/10/2026, 10:30 AM", tipo: "Ingreso", concepto: "Hospedaje", descripcion: "Pago estancia habitación 01", metodo: "Efectivo", monto: 40 },
        { id: 2, fecha: "18/10/2026, 02:15 PM", tipo: "Salida", concepto: "Gasto operativo", descripcion: "Compra suministros de limpieza", metodo: "Efectivo", monto: 15 },
      ],
    };
    this.history.push(closed);
  }

  public async getCurrentSession(): Promise<CashSessionModel | null> {
    return this.currentSession ? JSON.parse(JSON.stringify(this.currentSession)) : null;
  }

  public async saveCurrentSession(session: CashSessionModel | null): Promise<void> {
    this.currentSession = session ? JSON.parse(JSON.stringify(session)) : null;
  }

  public async addHistory(session: CashSessionModel): Promise<void> {
    this.history.unshift(JSON.parse(JSON.stringify(session)));
  }

  public async getHistory(): Promise<CashSessionModel[]> {
    return JSON.parse(JSON.stringify(this.history));
  }
}
