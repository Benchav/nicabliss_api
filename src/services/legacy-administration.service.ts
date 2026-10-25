import { LegacyAdministrationRepository } from "../repositories/legacy-administration.repository.js";

export class LegacyAdministrationService {
  public constructor(private readonly repository: LegacyAdministrationRepository) {}

  public async getHistoricalAccounts(search?: string, openOnly = false) {
    const [accounts, summary] = await Promise.all([
      this.repository.findHistoricalAccounts(search, openOnly),
      this.repository.getHistoricalSummary(),
    ]);
    return { accounts, summary };
  }

  public async getReviews(includeResolved = false) {
    const reviews = await this.repository.findReviews(includeResolved);
    return {
      reviews,
      summary: {
        pending: reviews.filter((item) => item.status === "REVIEW").length,
        acceptedUnlinked: reviews.filter((item) => item.resolution === "ACCEPTED_UNLINKED").length,
      },
    };
  }

  public async acceptUnlinked(id: number, reason: string, userId: string, ipAddress?: string) {
    if (!Number.isInteger(id) || id <= 0) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "El identificador de revisión no es válido" };
    }
    return this.repository.acceptUnlinked(id, reason.trim(), userId, ipAddress);
  }
}
