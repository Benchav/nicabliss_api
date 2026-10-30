import { NextFunction, Request, Response } from "express";
import { CustomerService } from "../services/customer.service.js";

export class CustomerController {
  public constructor(private readonly customerService: CustomerService) {}

  public getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.customerService.getAll(req.query.search as string | undefined);
      res.json({ success: true, data, message: "Clientes consultados" });
    } catch (error) { next(error); }
  };

  public getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.customerService.getById(Number(req.params.id));
      res.json({ success: true, data, message: "Cliente consultado" });
    } catch (error) { next(error); }
  };

  public getHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.customerService.getHistory(Number(req.params.id));
      res.json({ success: true, data, message: "Historial del cliente consultado" });
    } catch (error) { next(error); }
  };

  public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.customerService.create(req.body, req.user!.sub, req.ip);
      res.status(201).json({ success: true, data, message: "Cliente creado" });
    } catch (error) { next(error); }
  };

  public update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.customerService.update(Number(req.params.id), req.body, req.user!.sub, req.ip);
      res.json({ success: true, data, message: "Cliente actualizado" });
    } catch (error) { next(error); }
  };
}
