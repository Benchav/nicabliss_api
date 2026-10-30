import { StayAccountRepository } from "../repositories/stay-account.repository.js";
import { StayAccountModel } from "../models/stay-account.model.js";

export class StayAccountService {
  public constructor(private readonly repository: StayAccountRepository) {}

  public async getByStay(stayId: number): Promise<StayAccountModel> {
    const account = await this.repository.findByStayId(stayId);
    if (!account) throw { statusCode: 404, code: "NOT_FOUND", message: "Estancia no encontrada" };
    return account;
  }
}
