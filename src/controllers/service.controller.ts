import { NextFunction, Request, Response } from "express";
import { ServiceService } from "../services/service.service.js";

export class ServiceController {
  public constructor(private readonly service: ServiceService) {}

  public getCatalog = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getCatalog(req.query.includeInactive === "true");
      res.json({ success: true, data, message: "Catálogo consultado" });
    } catch (error) { next(error); }
  };
  public createCatalog = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.createCatalog(req.body);
      res.status(201).json({ success: true, data, message: "Servicio creado" });
    } catch (error) { next(error); }
  };
  public updateCatalog = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.updateCatalog(Number(req.params.id), req.body);
      res.json({ success: true, data, message: "Servicio actualizado" });
    } catch (error) { next(error); }
  };
  public getByStay = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getByStay(Number(req.params.id));
      res.json({ success: true, data, message: "Consumos consultados" });
    } catch (error) { next(error); }
  };
  public createConsumption = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.createConsumption(Number(req.params.id), req.body, req.user!.sub, req.user!.role);
      res.status(201).json({ success: true, data, message: "Servicio agregado a la estancia" });
    } catch (error) { next(error); }
  };
  public updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.updateStatus(Number(req.params.id), req.body.estado, req.user!.sub);
      res.json({ success: true, data, message: "Estado del servicio actualizado" });
    } catch (error) { next(error); }
  };
  public updateConsumption = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.updateConsumption(Number(req.params.id), req.body, req.user!.sub, req.user!.role);
      res.json({ success: true, data, message: "Consumo actualizado" });
    } catch (error) { next(error); }
  };
}
