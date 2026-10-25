export type InvoiceStatus = "Borrador" | "Emitida" | "Parcial" | "Pagada" | "Anulada";
export type InvoiceItemType = "LODGING" | "SERVICE";

export interface InvoiceItemModel {
  id: number;
  invoiceId: number;
  serviceType: InvoiceItemType;
  sourceId: number;
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  tax: number;
  total: number;
  createdAt: string;
}

export interface InvoiceModel {
  id: number;
  invoiceNumber: string;
  customerId: number;
  customerName: string;
  customerDocument: string;
  reservationId: number;
  reservationCode: string;
  stayId: number;
  room: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paidAmount: number;
  balance: number;
  status: InvoiceStatus;
  issuedAt?: string;
  issuedBy?: string;
  issuedByName?: string;
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  items: InvoiceItemModel[];
}
