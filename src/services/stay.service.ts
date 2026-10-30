import { StayAccountModel } from "../models/stay-account.model.js";
import { StayModel, StayStatus } from "../models/stay.model.js";
import { ServiceRepository } from "../repositories/service.repository.js";
import { StayAccountRepository } from "../repositories/stay-account.repository.js";
import { StayRepository } from "../repositories/stay.repository.js";

export class StayService {
  public constructor(
    private readonly stayRepository: StayRepository,
    private readonly serviceRepository: ServiceRepository,
    private readonly stayAccountRepository: StayAccountRepository = new StayAccountRepository()
  ) {}

  public async getAll(status?: StayStatus): Promise<StayModel[]> {
    return this.stayRepository.findAll(status);
  }

  public async getById(id: number): Promise<StayModel> {
    const stay = await this.stayRepository.findById(id);
    if (!stay) throw { statusCode: 404, code: "NOT_FOUND", message: "Estancia no encontrada" };
    return stay;
  }

  public async checkIn(reservationId: number, userId: string, ipAddress?: string): Promise<StayModel> {
    return this.stayRepository.checkIn(reservationId, userId, ipAddress);
  }

  public async getAccount(stayId: number): Promise<StayAccountModel> {
    await this.getById(stayId);
    const account = await this.stayAccountRepository.findByStayId(stayId);
    if (!account) throw { statusCode: 404, code: "NOT_FOUND", message: "Cuenta de estancia no encontrada" };
    return account;
  }

  public async getAccountByReservation(reservationId: number): Promise<StayAccountModel> {
    const stay = await this.stayRepository.findByReservationId(reservationId);
    if (!stay) throw { statusCode: 404, code: "NOT_FOUND", message: "La reserva no tiene una estancia asociada" };
    return this.getAccount(stay.id);
  }

  public async checkOut(stayId: number, userId: string, ipAddress?: string): Promise<StayModel> {
    await this.getById(stayId);
    const services = await this.serviceRepository.getByStay(stayId);
    if (services.some((service) => ["Registrado", "EnProceso"].includes(service.estado))) {
      throw {
        statusCode: 409,
        code: "PENDING_SERVICES",
        message: "La estancia tiene servicios pendientes de entregar o cancelar",
      };
    }
    return this.stayRepository.checkOut(stayId, userId, ipAddress);
  }
}
