import { Request, Response, NextFunction } from "express";
import { FoodOrderService } from "../services/food-order.service.js";

export class FoodOrderController {
  constructor(private orderService: FoodOrderService) {}

  public getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const search = req.query.search as string | undefined;
      const data = await this.orderService.getAll(search);
      res.json({ success: true, count: data.length, data });
    } catch (err) { next(err); }
  };

  public getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.orderService.getById(Number(req.params.id));
      res.json({ success: true, data });
    } catch (err) { next(err); }
  };

  public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.orderService.create(req.body);
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  };

  public updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.orderService.updateStatus(Number(req.params.id), req.body);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  };
}
