import { NextFunction, Request, Response } from "express";
import { LegacyAdministrationService } from "../services/legacy-administration.service.js";

export class LegacyAdministrationController {
  public constructor(private readonly service: LegacyAdministrationService) {}

  public historicalAccounts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getHistoricalAccounts(
        typeof req.query.search === "string" ? req.query.search : undefined,
        req.query.openOnly === "true"
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  };

  public reviews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getReviews(req.query.includeResolved === "true");
      res.json({ success: true, data });
    } catch (error) { next(error); }
  };

  public acceptUnlinked = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.acceptUnlinked(Number(req.params.id), req.body.reason, req.user!.sub, req.ip);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  };
}
