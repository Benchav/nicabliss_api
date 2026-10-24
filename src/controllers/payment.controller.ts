import { NextFunction, Request, Response } from "express";
import { PaymentService } from "../services/payment.service.js";

export class PaymentController {
  public constructor(private readonly paymentService: PaymentService) {}

  public createForReservation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.paymentService.create(
        Number(req.params.id),
        req.body,
        req.user!.sub,
        req.header("Idempotency-Key"),
        req.ip
      );
      res.status(201).json({ success: true, data, message: "Pago registrado" });
    } catch (error) { next(error); }
  };

  public getForReservation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.paymentService.getByReservation(Number(req.params.id));
      res.json({ success: true, data, message: "Pagos consultados" });
    } catch (error) { next(error); }
  };

  public void = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.paymentService.void(Number(req.params.id), req.body.reason, req.user!.sub, req.ip);
      res.json({ success: true, data, message: "Pago anulado mediante reversión" });
    } catch (error) { next(error); }
  };

  public receipt = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.paymentService.getReceipt(Number(req.params.id));
      res.json({ success: true, data, message: "Comprobante consultado" });
    } catch (error) { next(error); }
  };
}
