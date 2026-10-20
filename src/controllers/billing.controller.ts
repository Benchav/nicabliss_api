import { Request, Response, NextFunction } from "express";
import { BillingService } from "../services/billing.service.js";

export class BillingController {
  constructor(private billingService: BillingService) {}

  public getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const search = req.query.search as string | undefined;
      const result = await this.billingService.getAll(search);
      res.json({ success: true, ...result });
    } catch (err) { next(err); }
  };

  public getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.billingService.getById(Number(req.params.id));
      res.json({ success: true, data });
    } catch (err) { next(err); }
  };

  public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.billingService.create(req.body);
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  };

  public update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.billingService.update(Number(req.params.id), req.body);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  };

  public recordPayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.billingService.recordPayment(Number(req.params.id), req.body);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  };

  public delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.billingService.delete(Number(req.params.id));
      res.json({ success: true, message: `Cuenta de cobro #${req.params.id} eliminada correctamente` });
    } catch (err) { next(err); }
  };
}
