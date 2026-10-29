import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import ExcelJS from "exceljs";
import { createApp } from "../../src/app.js";
import { config } from "../../src/config/env.js";
import { businessToday } from "../../src/utils/business-time.js";

describe("Administrative reports integration", () => {
  let server: http.Server;
  let baseUrl = "";
  let token = "";
  let invoiceId = 0;
  let invoiceNumber = "";
  let paymentNumber = "";
  const today = businessToday(config.businessTimezone);
  const year = Number(today.slice(0, 4));
  let baselineDaily: any;
  let baselineMonthly: any;

  before(async () => {
    server = http.createServer(createApp());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as { port: number };
    baseUrl = `http://localhost:${address.port}`;
    const login = await request("/api/v1/auth/login", {
      method: "POST", body: JSON.stringify({ usuario: "admin", password: "12345" }),
    });
    token = login.body.data.token;
    baselineDaily = (await request(`/api/v1/reports/dashboard?date=${today}`)).body.data;
    baselineMonthly = (await request(`/api/v1/reports/revenue/monthly?year=${year}`)).body.data;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function request(path: string, options: RequestInit = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    return { status: response.status, body: await response.json() };
  }

  async function requestFile(path: string, authorization = true) {
    return fetch(`${baseUrl}${path}`, {
      headers: authorization && token ? { Authorization: `Bearer ${token}` } : {},
    });
  }

  it("creates a fully traceable sale for report verification", async () => {
    const opened = await request("/api/v1/cash-register/open", {
      method: "POST", body: JSON.stringify({ fondoInicial: 100 }),
    });
    assert.equal(opened.status, 201);
    const customer = await request("/api/v1/customers", {
      method: "POST", body: JSON.stringify({ nombre: "Reporte", apellido: "Integración", documento: "TEST-REPORT-001" }),
    });
    const rooms = await request("/api/v1/rooms/availability?from=2031-08-01&to=2031-08-03");
    const activeStays = await request("/api/v1/stays?status=Activa");
    const occupiedRoomIds = new Set(activeStays.body.data.map((stay: { roomId: number }) => stay.roomId));
    const room = rooms.body.data.find((item: { available: boolean; id: number }) => item.available && !occupiedRoomIds.has(item.id));
    assert.ok(room);
    const reservation = await request("/api/v1/reservations", {
      method: "POST",
      body: JSON.stringify({ customerId: customer.body.data.id, roomId: room.id,
        fechaEntrada: "2031-08-01", fechaSalida: "2031-08-03", totalReserva: 80,
        depositType: "FIXED", depositValue: 0 }),
    });
    await request(`/api/v1/reservations/${reservation.body.data.id}/status`, {
      method: "PATCH", body: JSON.stringify({ estado: "Confirmada" }),
    });
    const checkIn = await request(`/api/v1/reservations/${reservation.body.data.id}/check-in`, { method: "POST" });
    assert.equal(checkIn.status, 201);
    const service = await request(`/api/v1/stays/${checkIn.body.data.id}/services`, {
      method: "POST", body: JSON.stringify({ serviceId: 1, cantidad: 1, precioUnitario: 10, observaciones: "Reporte" }),
    });
    await request(`/api/v1/service-consumptions/${service.body.data.id}/status`, {
      method: "PATCH", body: JSON.stringify({ estado: "Consumido" }),
    });
    const draft = await request("/api/v1/invoices", {
      method: "POST", body: JSON.stringify({ stayId: checkIn.body.data.id }),
    });
    invoiceId = draft.body.data.id;
    const issued = await request(`/api/v1/invoices/${invoiceId}/issue`, { method: "POST" });
    invoiceNumber = issued.body.data.invoiceNumber;
    assert.equal(issued.body.data.total, 90);
    const payment = await request(`/api/v1/invoices/${invoiceId}/payments`, {
      method: "POST",
      headers: { "Idempotency-Key": "reports-transfer-001" },
      body: JSON.stringify({ amount: 40, paymentMethod: "Transferencia", reference: "REPORT-TRX-001" }),
    });
    assert.equal(payment.status, 201);
    paymentNumber = payment.body.data.paymentNumber;

    const cashAfterPayment = await request("/api/v1/cash-register/current");
    assert.equal(cashAfterPayment.body.data.ingresosDigitales, 40);
    assert.equal(cashAfterPayment.body.data.efectivoEsperado, 100);
    assert.ok(cashAfterPayment.body.data.movimientos.some((movement: { source: string; monto: number }) =>
      movement.source === "PAYMENT" && movement.monto === 40));

    const manualMovement = await request("/api/v1/cash-register/movements", {
      method: "POST",
      body: JSON.stringify({ tipo: "Ingreso", concepto: "Otro ingreso", descripcion: "Solo arqueo", metodo: "Efectivo", monto: 7 }),
    });
    assert.equal(manualMovement.status, 200);
  });

  it("keeps billed, collected, pending, methods, categories, and services distinct", async () => {
    const daily = await request(`/api/v1/reports/dashboard?date=${today}`);
    assert.equal(daily.status, 200);
    assert.equal(daily.body.data.income.invoiced, baselineDaily.income.invoiced + 90);
    assert.equal(daily.body.data.income.collected, baselineDaily.income.collected + 40);
    assert.equal(daily.body.data.income.pending, baselineDaily.income.pending + 50);
    assert.equal(daily.body.data.cash.open, true);

    const filteredCategory = await request(`/api/v1/reports/dashboard?date=${today}&category=Hospedaje`);
    assert.equal(filteredCategory.status, 200);
    assert.equal(filteredCategory.body.data.income.invoiced, 80);
    assert.deepEqual(filteredCategory.body.data.byCategory.map((row: { category: string }) => row.category), ["Hospedaje"]);

    const filteredCategoryReport = await request(`/api/v1/reports/revenue/categories?from=${today}&to=${today}&category=Hospedaje`);
    assert.equal(filteredCategoryReport.status, 200);
    assert.equal(filteredCategoryReport.body.data.total, 80);
    assert.deepEqual(filteredCategoryReport.body.data.items.map((row: { category: string }) => row.category), ["Hospedaje"]);

    const transfer = daily.body.data.byMethod.find((row: { method: string }) => row.method === "Transferencia");
    const baselineTransfer = baselineDaily.byMethod.find((row: { method: string }) => row.method === "Transferencia");
    assert.equal(transfer.amount, baselineTransfer.amount + 40);

    const filteredDaily = await request(`/api/v1/reports/dashboard?date=${today}&method=Transferencia`);
    assert.equal(filteredDaily.status, 200);
    const filteredTransfer = filteredDaily.body.data.byMethod.find((row: { method: string }) => row.method === "Transferencia");
    assert.equal(filteredDaily.body.data.income.collected, filteredTransfer.amount);
    assert.ok(filteredDaily.body.data.byMethod
      .filter((row: { method: string }) => row.method !== "Transferencia")
      .every((row: { amount: number; operationCount: number }) => row.amount === 0 && row.operationCount === 0));
    assert.equal(filteredDaily.body.data.income.collected, baselineTransfer.amount + 40);
    assert.equal(filteredDaily.body.data.income.invoiced, daily.body.data.income.invoiced);

    const currentCash = await request("/api/v1/cash-register/current");
    assert.equal(currentCash.body.data.ingresosEfectivo, 7);
    assert.equal(currentCash.body.data.ingresosDigitales, 40);
    assert.equal(currentCash.body.data.efectivoEsperado, 107);

    const dashboardMetrics = await request("/api/v1/dashboard/metrics");
    assert.equal(dashboardMetrics.body.data.stats[0].value, `$ ${daily.body.data.income.collected.toFixed(2)}`);
    assert.equal(dashboardMetrics.body.data.stats[1].value, String(daily.body.data.receivables.count));

    const services = await request(`/api/v1/reports/services?from=${today}&to=${today}&category=${encodeURIComponent("Alimentos")}`);
    assert.equal(services.status, 200);
    assert.ok(services.body.data.items.some((item: { serviceName: string; revenue: number }) => item.serviceName === "Pedido de alimentos" && item.revenue >= 10));

    const categories = await request(`/api/v1/reports/revenue/categories?from=${today}&to=${today}`);
    assert.equal(categories.status, 200);
    assert.ok(categories.body.data.items.some((item: { category: string; invoiced: number }) => item.category === "Hospedaje" && item.invoiced >= 80));
    assert.ok(categories.body.data.items.some((item: { category: string; invoiced: number }) => item.category === "Alimentos" && item.invoiced >= 10));

    const receivables = await request("/api/v1/reports/receivables");
    assert.equal(receivables.status, 200);
    const invoice = receivables.body.data.items.find((item: { invoiceId: number }) => item.invoiceId === invoiceId);
    assert.equal(invoice.balance, 50);
  });

  it("reports monthly totals, validates dates, and closes the reconciled test cash session", async () => {
    const monthly = await request(`/api/v1/reports/revenue/monthly?year=${year}`);
    assert.equal(monthly.status, 200);
    assert.equal(monthly.body.data.totals.invoiced, baselineMonthly.totals.invoiced + 90);
    assert.equal(monthly.body.data.totals.collected, baselineMonthly.totals.collected + 40);

    const invalid = await request("/api/v1/reports/services?from=2026-13-01&to=2026-01-01");
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error.code, "VALIDATION_ERROR");

    const closed = await request("/api/v1/cash-register/close", {
      method: "POST", body: JSON.stringify({ efectivoContado: 107, observaciones: "Cierre de prueba de reportes" }),
    });
    assert.equal(closed.status, 200);
  });

  it("downloads authenticated, detailed, real XLSX workbooks for day, week, and month", async () => {
    const unauthorized = await requestFile(`/api/v1/reports/export.xlsx?period=daily&date=${today}`, false);
    assert.equal(unauthorized.status, 401);

    const invalid = await requestFile(`/api/v1/reports/export.xlsx?period=weekly&date=2026-13-01`);
    assert.equal(invalid.status, 400);

    const dailyResponse = await requestFile(
      `/api/v1/reports/export.xlsx?period=daily&date=${today}&method=Transferencia&category=Hospedaje`
    );
    assert.equal(dailyResponse.status, 200);
    assert.match(dailyResponse.headers.get("content-type") ?? "", /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
    assert.match(dailyResponse.headers.get("content-disposition") ?? "", /nicabliss-reporte-diario-/);
    assert.match(dailyResponse.headers.get("cache-control") ?? "", /no-store/);

    const dailyWorkbook = new ExcelJS.Workbook();
    await dailyWorkbook.xlsx.load(Buffer.from(await dailyResponse.arrayBuffer()));
    assert.deepEqual(dailyWorkbook.worksheets.map((sheet) => sheet.name), [
      "Resumen", "Facturas", "Líneas facturadas", "Pagos", "CxC vigente", "Servicios gestionados", "Caja operativa",
    ]);
    const summary = dailyWorkbook.getWorksheet("Resumen")!;
    assert.equal(summary.getCell("A7").value, 80);
    assert.equal(summary.getCell("C7").value, baselineDaily.byMethod.find((row: { method: string }) => row.method === "Transferencia").amount + 40);
    assert.match(String(summary.getCell("A16").value), /CONTROL DE CAJA \(NO SUMAR A INGRESOS\)/);

    const invoiceSheet = dailyWorkbook.getWorksheet("Facturas")!;
    const invoiceRow = invoiceSheet.getRows(2, invoiceSheet.rowCount - 1)?.find((row) => row.getCell(1).value === invoiceNumber);
    assert.equal(invoiceRow?.getCell(1).value, invoiceNumber);
    assert.equal(invoiceRow?.getCell(11).value, 90);

    const lineSheet = dailyWorkbook.getWorksheet("Líneas facturadas")!;
    const filteredLine = lineSheet.getRows(2, lineSheet.rowCount - 1)?.find((row) => row.getCell(1).value === invoiceNumber);
    assert.equal(filteredLine?.getCell(6).value, "Hospedaje");
    assert.equal(filteredLine?.getCell(13).value, 80);

    const paymentsSheet = dailyWorkbook.getWorksheet("Pagos")!;
    const paymentRow = paymentsSheet.getRows(2, paymentsSheet.rowCount - 1)?.find((row) => row.getCell(1).value === paymentNumber);
    assert.equal(paymentRow?.getCell(5).value, 40);
    assert.equal(paymentRow?.getCell(6).value, "Transferencia");

    const cashSheet = dailyWorkbook.getWorksheet("Caja operativa")!;
    const manualRow = cashSheet.getRows(2, cashSheet.rowCount - 1)?.find((row) => row.getCell(6).value === "Solo arqueo");
    assert.match(String(manualRow?.getCell(2).value), new RegExp(`^${today} `));
    assert.equal(manualRow?.getCell(8).value, 7);
    assert.match(String(manualRow?.getCell(14).value), /no es ingreso financiero reportado/);

    const weeklyResponse = await requestFile(`/api/v1/reports/export.xlsx?period=weekly&date=${today}`);
    assert.equal(weeklyResponse.status, 200);
    assert.match(weeklyResponse.headers.get("content-disposition") ?? "", /nicabliss-reporte-semanal-\d{4}-\d{2}-\d{2}-a-\d{4}-\d{2}-\d{2}\.xlsx/);
    const weeklyWorkbook = new ExcelJS.Workbook();
    await weeklyWorkbook.xlsx.load(Buffer.from(await weeklyResponse.arrayBuffer()));
    assert.match(String(weeklyWorkbook.getWorksheet("Resumen")?.getCell("A2").value), /^Semana \d{4}-\d{2}-\d{2} al \d{4}-\d{2}-\d{2}$/);

    const month = today.slice(0, 7);
    const monthlyResponse = await requestFile(`/api/v1/reports/export.xlsx?period=monthly&month=${month}`);
    assert.equal(monthlyResponse.status, 200);
    assert.match(monthlyResponse.headers.get("content-disposition") ?? "", new RegExp(`nicabliss-reporte-mensual-${month}\\.xlsx`));
    const monthlyWorkbook = new ExcelJS.Workbook();
    await monthlyWorkbook.xlsx.load(Buffer.from(await monthlyResponse.arrayBuffer()));
    assert.ok(String(monthlyWorkbook.getWorksheet("Resumen")?.getCell("A2").value).includes(String(year)));
  });
});
