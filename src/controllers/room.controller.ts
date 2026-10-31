import { NextFunction, Request, Response } from "express";
import { RoomService } from "../services/room.service.js";

export class RoomController {
  public constructor(private readonly service: RoomService) {}

  public getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const includeInactive = req.query.includeInactive !== "false";
      const data = await this.service.getAll(includeInactive);
      res.json({ success: true, data, message: "Habitaciones consultadas" });
    } catch (error) { next(error); }
  };

  public getAvailability = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getAvailability(
        req.query.from as string | undefined,
        req.query.to as string | undefined,
        req.query.excludeReservationId ? Number(req.query.excludeReservationId) : undefined
      );
      res.json({ success: true, data, message: "Disponibilidad consultada" });
    } catch (error) { next(error); }
  };

  public getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getById(Number(req.params.id));
      res.json({ success: true, data, message: "Habitación consultada" });
    } catch (error) { next(error); }
  };

  public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.create(req.body, req.user!.sub, req.ip);
      res.status(201).json({ success: true, data, message: "Habitación creada" });
    } catch (error) { next(error); }
  };

  public update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.update(Number(req.params.id), req.body, req.user!.sub, req.ip);
      res.json({ success: true, data, message: "Habitación actualizada" });
    } catch (error) { next(error); }
  };

  public deactivate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.deactivate(Number(req.params.id), req.user!.sub, req.ip);
      res.json({ success: true, data, message: "Habitación desactivada" });
    } catch (error) { next(error); }
  };
}
