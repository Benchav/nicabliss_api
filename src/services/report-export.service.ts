import ExcelJS from "exceljs";
import { PaymentMethod } from "../models/payment.model.js";
import { ReportRepository } from "../repositories/report.repository.js";
import { config } from "../config/env.js";
import { businessDateRange } from "../utils/business-time.js";
import { centsToMoney } from "../utils/money.js";

export type ExportPeriod = "daily" | "weekly" | "monthly";

export interface ReportExportRequest {
  period: string;
  date?: string;
  month?: string;
  method?: string;
  category?: string;
}

interface ResolvedPeriod {
  period: ExportPeriod;
  from: string;
  to: string;
  label: string;
  filenamePeriod: string;
}

const paymentMethods: PaymentMethod[] = ["Efectivo", "Tarjeta", "Transferencia"];
const categories = ["Hospedaje", "Alimentos", "Lavandería", "Minibar", "Transporte", "Otro"];
const currencyFormat = '$#,##0.00;[Red]-$#,##0.00';
const countFormat = "#,##0";
const navy = "173B32";
const green = "24634F";
const paleGreen = "EAF2ED";
const gold = "C49A55";
const muted = "64736B";

function invalid(message: string): never {
  throw { statusCode: 400, code: "VALIDATION_ERROR", message };
}

function shiftDate(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function validateDate(value: string | undefined, field: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return invalid(`${field} debe usar formato YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return invalid(`${field} no es una fecha válida`);
  }
  const year = Number(value.slice(0, 4));
  if (year < 2000 || year > 2100) return invalid(`${field} debe estar entre los años 2000 y 2100`);
  return value;
}

function resolvePeriod(input: ReportExportRequest): ResolvedPeriod {
  if (input.period === "daily" || input.period === "weekly") {
    const date = validateDate(input.date, "date");
    if (input.period === "daily") {
      return { period: "daily", from: date, to: date, label: `Día ${date}`, filenamePeriod: date };
    }
    const dayOfWeek = new Date(`${date}T12:00:00.000Z`).getUTCDay();
    const from = shiftDate(date, -((dayOfWeek + 6) % 7));
    const to = shiftDate(from, 6);
    return { period: "weekly", from, to, label: `Semana ${from} al ${to}`, filenamePeriod: `${from}-a-${to}` };
  }

  if (input.period === "monthly") {
    if (!input.month || !/^\d{4}-\d{2}$/.test(input.month)) {
      return invalid("month debe usar formato YYYY-MM");
    }
    const [year, month] = input.month.split("-").map(Number);
    if (year < 2000 || year > 2100 || month < 1 || month > 12) {
      return invalid("month debe corresponder a un mes válido entre 2000 y 2100");
    }
    const from = `${input.month}-01`;
    const to = shiftDate(year === 2100 && month === 12 ? "2100-12-31" : new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10), 0);
    const monthName = new Intl.DateTimeFormat("es-NI", { timeZone: config.businessTimezone, month: "long", year: "numeric" })
      .format(new Date(`${from}T12:00:00.000Z`));
    return { period: "monthly", from, to, label: monthName, filenamePeriod: input.month };
  }

  return invalid("period debe ser daily, weekly o monthly");
}

function asNumber(value: unknown): number {
  return Number(value ?? 0);
}

function businessTimestamp(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const raw = String(value);
  const localTimestamp = raw.match(/^(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2})/);
  if (localTimestamp) {
    const [, day, month, year, hour, minute] = localTimestamp;
    return `${year}-${month}-${day} ${hour}:${minute}`;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.businessTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}

function addDetailSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: Array<Array<string | number | boolean>>,
  widths: number[],
  currencyColumns: number[] = [],
  countColumns: number[] = []
): void {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 1 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    properties: { defaultRowHeight: 19 },
  });
  sheet.columns = headers.map((header, index) => ({ header, key: `column${index}`, width: widths[index] ?? 18 }));
  const header = sheet.getRow(1);
  header.height = 30;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };
    cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFFFFF" } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "medium", color: { argb: gold } } };
  });

  rows.forEach((values, index) => {
    const row = sheet.addRow(values);
    row.height = 21;
    row.eachCell((cell, columnNumber) => {
      cell.font = { name: "Aptos", size: 10, color: { argb: "26352E" } };
      cell.alignment = { vertical: "middle", wrapText: false };
      cell.border = { bottom: { style: "hair", color: { argb: "DCE5DF" } } };
      if ((index + 1) % 2 === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F5F8F6" } };
      if (currencyColumns.includes(columnNumber)) {
        cell.numFmt = currencyFormat;
        cell.alignment = { horizontal: "right", vertical: "middle" };
      }
      if (countColumns.includes(columnNumber)) cell.numFmt = countFormat;
    });
  });

  if (rows.length > 0) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: headers.length } };
  } else {
    const empty = sheet.addRow(["Sin registros para el periodo y filtros seleccionados."]);
    empty.font = { name: "Aptos", italic: true, color: { argb: muted } };
    sheet.mergeCells(2, 1, 2, headers.length);
  }
}

export class ReportExportService {
  public constructor(private readonly repository: ReportRepository) {}

  public async createWorkbook(input: ReportExportRequest): Promise<{ buffer: Buffer; filename: string }> {
    const period = resolvePeriod(input);
    const method = input.method?.trim() || undefined;
    if (method && !paymentMethods.includes(method as PaymentMethod)) {
      return invalid("method no es un método de pago válido");
    }
    const category = input.category?.trim() || undefined;
    if (category && (!categories.includes(category) || category.length > 60)) {
      return invalid("category no es una categoría válida");
    }

    const range = businessDateRange(period.from, period.to, config.businessTimezone);
    const data = await this.repository.getFinancialExportData(range, {
      method: method as PaymentMethod | undefined,
      category,
    }, period.from, period.to);
    const generatedAt = new Date();
    const manualIncomeCents = data.cashMovements
      .filter((row) => row.source === "MANUAL" && row.tipo === "Ingreso")
      .reduce((sum, row) => sum + asNumber(row.amount_cents), 0);
    const manualOutputCents = data.cashMovements
      .filter((row) => row.source === "MANUAL" && row.tipo === "Salida")
      .reduce((sum, row) => sum + asNumber(row.amount_cents), 0);
    const receivablesCents = data.receivables.reduce((sum, row) => sum + asNumber(row.balance_cents), 0);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Nicabliss PMS";
    workbook.lastModifiedBy = "Nicabliss PMS";
    workbook.created = generatedAt;
    workbook.modified = generatedAt;
    workbook.subject = `Reporte financiero ${period.label}`;
    workbook.title = `Nicabliss · Reporte financiero ${period.label}`;
    workbook.company = "Nicabliss";
    workbook.category = "Reportes financieros";
    workbook.description = "Generado por el backend con datos contables canónicos de Nicabliss PMS.";

    const summary = workbook.addWorksheet("Resumen", {
      views: [{ state: "frozen", ySplit: 4 }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
      properties: { defaultRowHeight: 21 },
    });
    summary.properties.tabColor = { argb: gold };
    summary.columns = [
      { width: 24 }, { width: 15 }, { width: 18 },
      { width: 24 }, { width: 15 }, { width: 18 },
    ];
    summary.mergeCells("A1:F1");
    summary.getCell("A1").value = "NICABLISS  |  REPORTE FINANCIERO";
    summary.getCell("A1").font = { name: "Aptos Display", size: 19, bold: true, color: { argb: "FFFFFF" } };
    summary.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };
    summary.getCell("A1").alignment = { vertical: "middle" };
    summary.getRow(1).height = 42;
    summary.mergeCells("A2:F2");
    summary.getCell("A2").value = period.label;
    summary.getCell("A2").font = { name: "Aptos Display", size: 15, bold: true, color: { argb: navy } };
    summary.getRow(2).height = 29;
    summary.mergeCells("A3:F3");
    summary.getCell("A3").value = `Generado ${businessTimestamp(generatedAt.toISOString())} · Zona horaria ${config.businessTimezone}`;
    summary.getCell("A3").font = { name: "Aptos", size: 10, color: { argb: muted } };
    summary.mergeCells("A4:F4");
    summary.getCell("A4").value = `Filtros: categoría ${category ?? "Todas"} (facturación y servicios) · método ${method ?? "Todos"} (cobros y anticipos)`;
    summary.getCell("A4").font = { name: "Aptos", size: 10, color: { argb: muted }, italic: true };

    const cards = [
      { label: category ? `FACTURADO POR LÍNEAS · ${category.toLocaleUpperCase("es-NI")}` : "FACTURADO NETO", value: centsToMoney(data.invoicedCents), start: "A", end: "B" },
      { label: "COBRADO NETO", value: centsToMoney(data.collectedCents), start: "C", end: "D" },
      { label: "ANTICIPOS NETOS · INCLUIDOS EN COBRADO", value: centsToMoney(data.advancesCents), start: "E", end: "F" },
    ];
    for (const card of cards) {
      summary.mergeCells(`${card.start}6:${card.end}6`);
      summary.mergeCells(`${card.start}7:${card.end}7`);
      const title = summary.getCell(`${card.start}6`);
      title.value = card.label;
      title.font = { name: "Aptos", size: 9, bold: true, color: { argb: "FFFFFF" } };
      title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: green } };
      title.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      const value = summary.getCell(`${card.start}7`);
      value.value = card.value;
      value.numFmt = currencyFormat;
      value.font = { name: "Aptos Display", size: 17, bold: true, color: { argb: navy } };
      value.fill = { type: "pattern", pattern: "solid", fgColor: { argb: paleGreen } };
      value.alignment = { horizontal: "center", vertical: "middle" };
    }
    summary.getRow(6).height = 31;
    summary.getRow(7).height = 38;

    summary.mergeCells("A9:F9");
    summary.getCell("A9").value = `CUENTAS POR COBRAR VIGENTES AL ${businessTimestamp(generatedAt.toISOString())}`;
    summary.getCell("A9").font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFFFFF" } };
    summary.getCell("A9").fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };
    summary.mergeCells("A10:B10");
    summary.getCell("A10").value = data.receivables.length;
    summary.getCell("A10").numFmt = `${countFormat} "facturas abiertas"`;
    summary.mergeCells("C10:D10");
    summary.getCell("C10").value = centsToMoney(receivablesCents);
    summary.getCell("C10").numFmt = currencyFormat;
    summary.getCell("C10").font = { name: "Aptos Display", size: 15, bold: true, color: { argb: navy } };
    summary.mergeCells("E10:F10");
    summary.getCell("E10").value = "Saldo actual, no histórico al cierre del periodo";
    summary.getCell("E10").font = { name: "Aptos", size: 9, color: { argb: muted }, italic: true };
    summary.getCell("E10").alignment = { wrapText: true, vertical: "middle" };
    summary.getRow(10).height = 32;

    summary.mergeCells("A12:C12");
    summary.getCell("A12").value = "IMPORTE DE LÍNEAS POR CATEGORÍA";
    summary.mergeCells("D12:F12");
    summary.getCell("D12").value = "COBROS NETOS POR MÉTODO";
    for (const address of ["A12", "D12"]) {
      const cell = summary.getCell(address);
      cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: green } };
    }
    ["A13", "B13", "C13", "D13", "E13", "F13"].forEach((address) => {
      summary.getCell(address).font = { name: "Aptos", size: 9, bold: true, color: { argb: navy } };
      summary.getCell(address).fill = { type: "pattern", pattern: "solid", fgColor: { argb: paleGreen } };
    });
    summary.getCell("A13").value = "Categoría";
    summary.getCell("B13").value = "Líneas";
    summary.getCell("C13").value = "Facturado";
    summary.getCell("D13").value = "Método";
    summary.getCell("E13").value = "Operaciones";
    summary.getCell("F13").value = "Neto";
    data.byCategory.forEach((row, index) => {
      const target = 14 + index;
      summary.getCell(`A${target}`).value = String(row.category);
      summary.getCell(`B${target}`).value = asNumber(row.line_count);
      summary.getCell(`C${target}`).value = centsToMoney(asNumber(row.total_cents));
      summary.getCell(`C${target}`).numFmt = currencyFormat;
    });
    data.byMethod.forEach((row, index) => {
      const target = 14 + index;
      summary.getCell(`D${target}`).value = String(row.payment_method);
      summary.getCell(`E${target}`).value = asNumber(row.operation_count);
      summary.getCell(`F${target}`).value = centsToMoney(asNumber(row.total_cents));
      summary.getCell(`F${target}`).numFmt = currencyFormat;
    });
    const manualRow = Math.max(16, 14 + Math.max(data.byCategory.length, data.byMethod.length) + 1);
    summary.mergeCells(`A${manualRow}:F${manualRow}`);
    summary.getCell(`A${manualRow}`).value = `CONTROL DE CAJA (NO SUMAR A INGRESOS) · Ingresos manuales: ${centsToMoney(manualIncomeCents)} · Salidas manuales: ${centsToMoney(manualOutputCents)}. Los cobros automáticos ya están representados en la hoja Pagos.`;
    summary.getCell(`A${manualRow}`).font = { name: "Aptos", size: 9, bold: true, color: { argb: "7A4A14" } };
    summary.getCell(`A${manualRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4DF" } };
    summary.getCell(`A${manualRow}`).alignment = { wrapText: true, vertical: "middle" };
    summary.getRow(manualRow).height = 34;
    summary.mergeCells(`A${manualRow + 1}:F${manualRow + 1}`);
    summary.getCell(`A${manualRow + 1}`).value = "Criterio: facturación por fecha de emisión; cobros por fecha del pago y reversiones en negativo. Los saldos de CxC son vigentes al generar el archivo. Una reversión reduce el cobro neto del periodo en que fue registrada.";
    summary.getCell(`A${manualRow + 1}`).font = { name: "Aptos", size: 9, color: { argb: muted }, italic: true };
    summary.getCell(`A${manualRow + 1}`).alignment = { wrapText: true, vertical: "middle" };
    summary.getRow(manualRow + 1).height = 32;
    summary.mergeCells(`A${manualRow + 2}:F${manualRow + 2}`);
    summary.getCell(`A${manualRow + 2}`).value = "Nota de desglose: la facturación por categoría suma importes de líneas; los descuentos globales de factura no se prorratean por categoría, por lo que el desglose puede diferir del facturado neto. Si se filtra categoría, el indicador Facturado muestra el importe de líneas filtrado. La hoja Facturas conserva los totales íntegros de cada documento.";
    summary.getCell(`A${manualRow + 2}`).font = { name: "Aptos", size: 9, color: { argb: muted }, italic: true };
    summary.getCell(`A${manualRow + 2}`).alignment = { wrapText: true, vertical: "middle" };
    summary.getRow(manualRow + 2).height = 38;

    addDetailSheet(workbook, "Facturas", [
      "Factura", "Emitida (Managua)", "Estado actual", "Cliente", "Documento", "Reserva", "Habitación",
      "Subtotal", "Impuesto", "Descuento", "Total documento", "Pagado actual", "Saldo actual", "Emitida por",
    ], data.invoices.map((row) => [
      String(row.invoice_number), businessTimestamp(row.issued_at), String(row.status), String(row.customer_name),
      String(row.customer_document), String(row.codigo_reserva), String(row.habitacion),
      centsToMoney(asNumber(row.subtotal_cents)), centsToMoney(asNumber(row.tax_cents)),
      centsToMoney(asNumber(row.discount_cents)), centsToMoney(asNumber(row.total_cents)),
      centsToMoney(asNumber(row.paid_amount_cents)), centsToMoney(asNumber(row.balance_cents)),
      String(row.issued_by_name ?? ""),
    ]), [18, 21, 15, 28, 18, 18, 14, 15, 14, 15, 17, 16, 16, 24], [8, 9, 10, 11, 12, 13]);

    addDetailSheet(workbook, "Líneas facturadas", [
      "Factura", "Emitida (Managua)", "Estado actual", "Cliente", "Reserva", "Categoría", "Tipo", "Concepto",
      "Cantidad", "Precio unitario", "Subtotal línea", "Impuesto línea", "Total línea",
    ], data.invoiceLines.map((row) => [
      String(row.invoice_number), businessTimestamp(row.issued_at), String(row.status), String(row.customer_name),
      String(row.codigo_reserva), String(row.category), String(row.service_type), String(row.description),
      asNumber(row.quantity), centsToMoney(asNumber(row.unit_price_cents)), centsToMoney(asNumber(row.subtotal_cents)),
      centsToMoney(asNumber(row.tax_cents)), centsToMoney(asNumber(row.total_cents)),
    ]), [18, 21, 15, 28, 18, 17, 14, 38, 12, 17, 17, 16, 16], [10, 11, 12, 13], [9]);

    addDetailSheet(workbook, "Pagos", [
      "Pago", "Fecha (Managua)", "Tipo", "Estado", "Importe neto", "Método", "Factura", "Cliente", "Documento",
      "Reserva", "Anticipo", "Referencia", "Reversa a", "Recibido por", "Motivo reversión",
    ], data.payments.map((row) => [
      String(row.payment_number), businessTimestamp(row.payment_date), row.kind === "REVERSAL" ? "Reversión" : "Cobro",
      String(row.status), centsToMoney((row.kind === "REVERSAL" ? -1 : 1) * asNumber(row.amount_cents)),
      String(row.payment_method), String(row.invoice_number ?? ""), String(row.customer_name),
      String(row.customer_document), String(row.codigo_reserva ?? ""), Number(row.is_advance) === 1 ? "Sí" : "No",
      String(row.reference ?? ""), String(row.reverses_payment_number ?? ""), String(row.received_by_name),
      String(row.void_reason ?? ""),
    ]), [19, 21, 14, 14, 17, 18, 18, 28, 18, 18, 13, 20, 19, 24, 36], [5]);

    addDetailSheet(workbook, "CxC vigente", [
      "Factura", "Fecha emisión", "Estado", "Cliente", "Documento", "Reserva", "Habitación", "Total documento",
      "Pagado actual", "Saldo actual", "Antigüedad (días)",
    ], data.receivables.map((row) => {
      const issuedAt = String(row.issued_at ?? "");
      const ageDays = issuedAt ? Math.max(0, Math.floor((generatedAt.getTime() - new Date(issuedAt).getTime()) / 86_400_000)) : 0;
      return [
        String(row.invoice_number), businessTimestamp(issuedAt), String(row.status), String(row.customer_name),
        String(row.customer_document), String(row.codigo_reserva), String(row.habitacion),
        centsToMoney(asNumber(row.total_cents)), centsToMoney(asNumber(row.paid_amount_cents)),
        centsToMoney(asNumber(row.balance_cents)), ageDays,
      ];
    }), [19, 21, 15, 28, 18, 18, 14, 18, 18, 18, 19], [8, 9, 10], [11]);

    addDetailSheet(workbook, "Servicios gestionados", [
      "Fecha (Managua)", "Estado", "Categoría", "Servicio", "Cantidad", "Precio unitario", "Subtotal operativo",
      "Cliente", "Reserva", "Habitación", "Origen", "Gestionado por", "Observaciones",
    ], data.services.map((row) => [
      businessTimestamp(row.consumed_at), String(row.estado), String(row.categoria), String(row.service_name),
      asNumber(row.cantidad), centsToMoney(asNumber(row.precio_unitario_cents)), centsToMoney(asNumber(row.subtotal_cents)),
      String(row.customer_name), String(row.codigo_reserva), String(row.habitacion), String(row.source_type),
      String(row.created_by_name), String(row.observaciones ?? ""),
    ]), [21, 15, 17, 29, 12, 17, 20, 28, 18, 14, 16, 24, 38], [6, 7], [5]);

    addDetailSheet(workbook, "Caja operativa", [
      "Movimiento", "Fecha (Managua)", "Origen", "Tipo", "Concepto", "Descripción", "Método", "Importe", "Sesión",
      "Responsable caja", "Cliente", "Pago relacionado", "Registrado por", "Tratamiento financiero",
    ], data.cashMovements.map((row) => [
      asNumber(row.id), businessTimestamp(row.fecha), String(row.source), String(row.tipo), String(row.concepto),
      String(row.descripcion ?? ""), String(row.metodo), centsToMoney(asNumber(row.amount_cents)),
      asNumber(row.session_id), String(row.cash_responsible), String(row.customer_name ?? ""),
      String(row.payment_number ?? ""), String(row.created_by_name ?? ""),
      row.source === "PAYMENT" || row.source === "REVERSAL"
        ? "No volver a sumar: conciliación operativa del pago/reversión"
        : "Solo control de Caja; no es ingreso financiero reportado",
    ]), [13, 21, 15, 13, 20, 38, 17, 16, 12, 24, 28, 20, 24, 48], [8]);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const periodName: Record<ExportPeriod, string> = { daily: "diario", weekly: "semanal", monthly: "mensual" };
    const filename = `nicabliss-reporte-${periodName[period.period]}-${period.filenamePeriod}.xlsx`;
    return { buffer, filename };
  }
}
