import { TipoMovimiento, ConceptoMovimiento, MetodoPago } from "../models/cash.model.js";

export interface OpenCashDto {
  responsable: string;
  fondoInicial: number;
}

export interface AddMovementDto {
  tipo: TipoMovimiento;
  concepto: ConceptoMovimiento;
  descripcion: string;
  metodo: MetodoPago;
  monto: number;
}

export interface CloseCashDto {
  efectivoContado: number;
  observaciones?: string;
}
