import { NextFunction, Request, Response } from "express";
import { InvoiceStatus } from "../models/invoice.model.js";
import { InvoiceService } from "../services/invoice.service.js";

export class InvoiceController {
  public constructor(private readonly service: InvoiceService) {}

  public getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getAll(req.query.search as string | undefined, req.query.status as InvoiceStatus | undefined);
      res.json({ success: true, data, message: "Facturas consultadas" });
    } catch (error) { next(error); }
  };
  public getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getById(Number(req.params.id));
      res.json({ success: true, data, message: "Factura consultada" });
    } catch (error) { next(error); }
  };
  public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.create(req.body, req.user!.sub);
      res.status(201).json({ success: true, data, message: "Borrador de factura creado" });
    } catch (error) { next(error); }
  };
  public issue = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.issue(Number(req.params.id), req.user!.sub, req.ip);
      res.json({ success: true, data, message: "Factura emitida" });
    } catch (error) { next(error); }
  };
  public void = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.void(Number(req.params.id), req.body.reason, req.user!.sub, req.ip);
      res.json({ success: true, data, message: "Factura anulada" });
    } catch (error) { next(error); }
  };
  public pdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { invoice, buffer } = await this.service.getPdf(Number(req.params.id));
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoiceNumber}.pdf"`);
      res.send(buffer);
    } catch (error) { next(error); }
  };
}
