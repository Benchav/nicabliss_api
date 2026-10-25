import { Request, Response, NextFunction } from "express";
import { UserService } from "../services/user.service.js";

export class UserController {
  constructor(private userService: UserService) {}

  public getAll = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.userService.getAll();
      res.json({ success: true, count: data.length, data });
    } catch (err) {
      next(err);
    }
  };

  public getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.userService.getById(String(req.params.id));
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.userService.create(req.body);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  public update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const currentUserId = req.user?.sub;
      const data = await this.userService.update(String(req.params.id), req.body, currentUserId, req.ip);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  public delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const currentUserId = req.user?.sub;
      await this.userService.delete(String(req.params.id), currentUserId);
      res.json({ success: true, message: `Usuario con ID '${req.params.id}' eliminado correctamente` });
    } catch (err) {
      next(err);
    }
  };
}
