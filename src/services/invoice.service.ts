import PDFDocument from "pdfkit";
import { CreateInvoiceDto } from "../dtos/invoice.dto.js";
import { InvoiceModel, InvoiceStatus } from "../models/invoice.model.js";
import { InvoiceRepository } from "../repositories/invoice.repository.js";
import { config } from "../config/env.js";
import { formatBusinessDateTime } from "../utils/business-time.js";

export class InvoiceService {
  public constructor(private readonly repository: InvoiceRepository) {}

  public async getAll(search?: string, status?: InvoiceStatus): Promise<InvoiceModel[]> {
    return this.repository.findAll(search, status);
  }

  public async getById(id: number): Promise<InvoiceModel> {
    const invoice = await this.repository.findById(id);
    if (!invoice) throw { statusCode: 404, code: "NOT_FOUND", message: "Factura no encontrada" };
    return invoice;
  }

  public async create(dto: CreateInvoiceDto, userId: string): Promise<InvoiceModel> {
    return this.repository.create(Number(dto.stayId), userId);
  }

  public async issue(id: number, userId: string, ipAddress?: string): Promise<InvoiceModel> {
    return this.repository.issue(id, userId, ipAddress);
  }

  public async void(id: number, reason: string, userId: string, ipAddress?: string): Promise<InvoiceModel> {
    return this.repository.void(id, reason.trim(), userId, ipAddress);
  }

  public async getPdf(id: number): Promise<{ invoice: InvoiceModel; buffer: Buffer }> {
    const invoice = await this.getById(id);
    const document = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Comprobante ${invoice.invoiceNumber}` } });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));

    document.fontSize(20).fillColor("#193c31").text("NICABLISS", { align: "center" });
    document.fontSize(10).fillColor("#555555").text("COMPROBANTE INTERNO · NO ES FACTURA FISCAL", { align: "center" });
    document.moveDown(1.5);
    document.fontSize(14).fillColor("#111111").text(invoice.invoiceNumber);
    document.fontSize(9).text(`Estado: ${invoice.status}`);
    document.text(`Fecha: ${formatBusinessDateTime(invoice.issuedAt || invoice.createdAt, config.businessTimezone)}`);
    document.moveDown();
    document.fontSize(11).text(`Cliente: ${invoice.customerName}`);
    document.fontSize(9).text(`Documento: ${invoice.customerDocument}`);
    document.text(`Reserva: ${invoice.reservationCode}`);
    document.text(`Habitación: ${invoice.room}`);
    document.moveDown();
    document.fontSize(10).fillColor("#193c31").text("DETALLE", { underline: true });
    document.moveDown(0.5);

    for (const item of invoice.items) {
      document.fillColor("#111111").fontSize(9).text(item.description);
      document.fillColor("#555555").text(`${item.quantity} × $${item.unitPrice.toFixed(2)}   $${item.total.toFixed(2)}`, { align: "right" });
      document.moveDown(0.5);
    }

    document.moveDown();
    document.fillColor("#111111").fontSize(10).text(`Subtotal: $${invoice.subtotal.toFixed(2)}`, { align: "right" });
    document.text(`Impuestos: $${invoice.tax.toFixed(2)}`, { align: "right" });
    document.fontSize(12).text(`Total: $${invoice.total.toFixed(2)}`, { align: "right" });
    document.fillColor("#166534").text(`Pagado: $${invoice.paidAmount.toFixed(2)}`, { align: "right" });
    document.fillColor("#b42318").text(`Saldo: $${invoice.balance.toFixed(2)}`, { align: "right" });
    if (invoice.status === "Anulada") {
      document.moveDown().fillColor("#b42318").fontSize(14).text("ANULADA", { align: "center" });
      document.fontSize(9).text(invoice.voidReason || "Sin motivo registrado", { align: "center" });
    }
    document.moveDown(2).fillColor("#555555").fontSize(8).text("Documento de control interno emitido por Nicabliss PMS.", { align: "center" });

    const completed = new Promise<Buffer>((resolve, reject) => {
      document.on("end", () => resolve(Buffer.concat(chunks)));
      document.on("error", reject);
    });
    document.end();
    return { invoice, buffer: await completed };
  }
}
