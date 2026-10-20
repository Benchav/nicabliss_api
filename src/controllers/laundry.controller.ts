import { Request, Response, NextFunction } from "express";
import { LaundryService } from "../services/laundry.service.js";

export class LaundryController {
  constructor(private laundryService: LaundryService) {}

  public getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const search = req.query.search as string | undefined;
      const data = await this.laundryService.getAll(search);
      res.json({ success: true, count: data.length, data });
    } catch (err) { next(err); }
  };

  public getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.laundryService.getById(Number(req.params.id));
      res.json({ success: true, data });
    } catch (err) { next(err); }
  };

  public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.laundryService.create(req.body);
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  };

  public update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.laundryService.update(Number(req.params.id), req.body);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  };

  public updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.laundryService.updateStatus(Number(req.params.id), req.body);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  };

  public delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.laundryService.delete(Number(req.params.id));
      res.json({ success: true, message: `Orden de lavandería #${req.params.id} eliminada correctamente` });
    } catch (err) { next(err); }
  };
}
