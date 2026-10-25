import { NextFunction, Request, Response } from "express";
import { ReservationStatus } from "../models/reservation.model.js";
import { ReservationService } from "../services/reservation.service.js";

export class ReservationController {
  public constructor(private readonly reservationService: ReservationService) {}

  public getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.reservationService.getAll(
        req.query.search as string | undefined,
        req.query.status as ReservationStatus | undefined
      );
      res.json({ success: true, data, message: "Reservas consultadas" });
    } catch (error) { next(error); }
  };

  public getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.reservationService.getById(Number(req.params.id));
      res.json({ success: true, data, message: "Reserva consultada" });
    } catch (error) { next(error); }
  };

  public getRooms = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.reservationService.getRooms(
        req.query.from as string | undefined,
        req.query.to as string | undefined
      );
      res.json({ success: true, data, message: "Disponibilidad consultada" });
    } catch (error) { next(error); }
  };

  public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.reservationService.create(req.body, req.user!.sub);
      res.status(201).json({ success: true, data, message: "Reserva creada" });
    } catch (error) { next(error); }
  };

  public update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.reservationService.update(Number(req.params.id), req.body, req.user!.sub);
      res.json({ success: true, data, message: "Reserva actualizada" });
    } catch (error) { next(error); }
  };

  public updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.reservationService.updateStatus(
        Number(req.params.id),
        req.body.estado,
        req.user!.sub
      );
      res.json({ success: true, data, message: "Estado de reserva actualizado" });
    } catch (error) { next(error); }
  };
}
