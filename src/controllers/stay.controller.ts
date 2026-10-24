import { NextFunction, Request, Response } from "express";
import { StayStatus } from "../models/stay.model.js";
import { StayService } from "../services/stay.service.js";

export class StayController {
  public constructor(private readonly service: StayService) {}

  public getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getAll(req.query.status as StayStatus | undefined);
      res.json({ success: true, data, message: "Estancias consultadas" });
    } catch (error) { next(error); }
  };
  public getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getById(Number(req.params.id));
      res.json({ success: true, data, message: "Estancia consultada" });
    } catch (error) { next(error); }
  };
  public checkIn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.checkIn(Number(req.params.id), req.user!.sub, req.ip);
      res.status(201).json({ success: true, data, message: "Check-in registrado" });
    } catch (error) { next(error); }
  };
  public checkOut = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.checkOut(Number(req.params.id), req.user!.sub, req.ip);
      res.json({ success: true, data, message: "Check-out registrado" });
    } catch (error) { next(error); }
  };
}
