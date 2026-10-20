import { Request, Response, NextFunction } from "express";
import { GuestService } from "../services/guest.service.js";

export class GuestController {
  constructor(private guestService: GuestService) {}

  public getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const search = req.query.search as string | undefined;
      const data = await this.guestService.getAll(search);
      res.json({ success: true, count: data.length, data });
    } catch (err) { next(err); }
  };

  public getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.guestService.getById(Number(req.params.id));
      res.json({ success: true, data });
    } catch (err) { next(err); }
  };

  public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.guestService.create(req.body);
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  };

  public update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.guestService.update(Number(req.params.id), req.body);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  };

  public updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.guestService.updateStatus(Number(req.params.id), req.body);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  };

  public delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.guestService.delete(Number(req.params.id));
      res.json({ success: true, message: `Huésped con id ${req.params.id} eliminado correctamente` });
    } catch (err) { next(err); }
  };
}
