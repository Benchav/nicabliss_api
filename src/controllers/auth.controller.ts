import { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/auth.service.js";

export class AuthController {
  constructor(private authService: AuthService) {}

  public login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.authService.login(req.body);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  };

  public register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.authService.register(req.body);
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  };

  public getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.authService.getProfile(req.user!.sub);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  };
}
