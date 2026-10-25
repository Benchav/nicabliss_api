import { NextFunction, Request, Response } from "express";
import { AttendanceStatus } from "../models/attendance.model.js";
import { AttendanceService } from "../services/attendance.service.js";

export class AttendanceController {
  public constructor(private readonly service: AttendanceService) {}
  public checkIn = async (req: Request, res: Response, next: NextFunction) => { try { res.status(201).json({ success: true, data: await this.service.checkIn(req.user!.sub), message: "Entrada registrada" }); } catch (e) { next(e); } };
  public checkOut = async (req: Request, res: Response, next: NextFunction) => { try { res.json({ success: true, data: await this.service.checkOut(req.user!.sub), message: "Salida registrada" }); } catch (e) { next(e); } };
  public absence = async (req: Request, res: Response, next: NextFunction) => { try { res.status(201).json({ success: true, data: await this.service.absence(req.body, req.user!.sub) }); } catch (e) { next(e); } };
  public today = async (req: Request, res: Response, next: NextFunction) => { try { res.json({ success: true, data: await this.service.today(req.user!.sub, req.user!.role) }); } catch (e) { next(e); } };
  public all = async (req: Request, res: Response, next: NextFunction) => { try { res.json({ success: true, data: await this.service.findAll({ from: req.query.from as string, to: req.query.to as string, userId: req.query.userId as string, status: req.query.status as AttendanceStatus }) }); } catch (e) { next(e); } };
  public report = async (req: Request, res: Response, next: NextFunction) => { try { res.json({ success: true, data: await this.service.report({ from: req.query.from as string, to: req.query.to as string, userId: req.query.userId as string }) }); } catch (e) { next(e); } };
  public update = async (req: Request, res: Response, next: NextFunction) => { try { res.json({ success: true, data: await this.service.update(Number(req.params.id), req.body, req.user!.sub) }); } catch (e) { next(e); } };
  public schedules = async (req: Request, res: Response, next: NextFunction) => { try { res.json({ success: true, data: await this.service.getSchedules(req.query.userId as string) }); } catch (e) { next(e); } };
  public saveSchedule = async (req: Request, res: Response, next: NextFunction) => { try { res.json({ success: true, data: await this.service.saveSchedule(req.body) }); } catch (e) { next(e); } };
}
