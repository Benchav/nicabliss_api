import { NextFunction, Request, Response } from "express";
import { ReservationAccountService } from "../services/reservation-account.service.js";

export class ReservationAccountController {
  public constructor(private readonly service: ReservationAccountService) {}

  public getAccount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getAccount(Number(req.params.id));
      res.json({ success: true, data, message: "Cuenta de la reserva consultada" });
    } catch (error) { next(error); }
  };

  public getConsumptions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.listConsumptions(Number(req.params.id));
      res.json({ success: true, data, message: "Consumos de la reserva consultados" });
    } catch (error) { next(error); }
  };

  public addConsumption = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.addConsumption(
        Number(req.params.id),
        req.body,
        req.user!.sub,
        req.user!.role
      );
      res.status(201).json({ success: true, data, message: "Consumo agregado a la cuenta" });
    } catch (error) { next(error); }
  };

  public checkOut = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.checkOut(Number(req.params.id), req.user!.sub, req.ip);
      res.json({ success: true, data, message: "Check-out registrado y factura emitida" });
    } catch (error) { next(error); }
  };
}
