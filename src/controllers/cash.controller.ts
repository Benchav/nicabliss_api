import { Request, Response, NextFunction } from "express";
import { CashService } from "../services/cash.service.js";

export class CashController {
  constructor(private cashService: CashService) {}

  public getCurrent = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.cashService.getCurrentSession();
      res.json({ success: true, data });
    } catch (err) { next(err); }
  };

  public openSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.cashService.openSession(req.body);
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  };

  public addMovement = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.cashService.addMovement(req.body);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  };

  public closeSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.cashService.closeSession(req.body);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  };

  public getHistory = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.cashService.getHistory();
      res.json({ success: true, count: data.length, data });
    } catch (err) { next(err); }
  };
}
