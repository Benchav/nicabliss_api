import { StayModel, StayStatus } from "../models/stay.model.js";
import { ServiceRepository } from "../repositories/service.repository.js";
import { StayRepository } from "../repositories/stay.repository.js";

export class StayService {
  public constructor(
    private readonly stayRepository: StayRepository,
    private readonly serviceRepository: ServiceRepository
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
