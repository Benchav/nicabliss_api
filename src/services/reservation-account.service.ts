import { CreateConsumptionDto } from "../dtos/service.dto.js";
import { InvoiceModel } from "../models/invoice.model.js";
import { ReservationAccountModel } from "../models/reservation-account.model.js";
import { ServiceConsumptionModel } from "../models/service.model.js";
import { StayModel } from "../models/stay.model.js";
import { InvoiceRepository } from "../repositories/invoice.repository.js";
import { ReservationAccountRepository } from "../repositories/reservation-account.repository.js";
import { ServiceRepository } from "../repositories/service.repository.js";
import { StayRepository } from "../repositories/stay.repository.js";
import { ServiceService } from "./service.service.js";
import { StayService } from "./stay.service.js";

export interface ReservationCheckoutResult {
  reservationId: number;
  stay: StayModel;
  invoice: InvoiceModel;
  account: ReservationAccountModel;
}

export class ReservationAccountService {
  public constructor(
    private readonly accountRepository: ReservationAccountRepository = new ReservationAccountRepository(),
    private readonly serviceRepository: ServiceRepository = new ServiceRepository(),
    private readonly stayService: StayService = new StayService(new StayRepository(), new ServiceRepository()),
    private readonly invoiceRepository: InvoiceRepository = new InvoiceRepository()
  ) {}

  public async getAccount(reservationId: number): Promise<ReservationAccountModel> {
    const account = await this.accountRepository.findByReservationId(reservationId);
    if (!account) throw { statusCode: 404, code: "NOT_FOUND", message: "Reserva no encontrada" };
    return account;
  }

  public async listConsumptions(reservationId: number): Promise<ServiceConsumptionModel[]> {
    const account = await this.getAccount(reservationId);
    return account.consumptions;
  }

  public async addConsumption(
    reservationId: number,
    dto: CreateConsumptionDto,
    userId: string,
    role: string
  ): Promise<ServiceConsumptionModel> {
    const account = await this.getAccount(reservationId);
    if (!account.stayId) {
      throw {
        statusCode: 409,
        code: "STAY_NOT_OPENED",
        message: "La reserva aún no tiene check-in. Registra el check-in para abrir la cuenta de consumos.",
      };
    }
    if (account.status !== "Activa") {
      throw {
        statusCode: 409,
        code: "STAY_NOT_ACTIVE",
        message: "La estancia ya no está activa; no se pueden agregar consumos.",
      };
    }
    const serviceService = new ServiceService(this.serviceRepository);
    return serviceService.createConsumption(account.stayId, dto, userId, role);
  }

  public async checkOut(
    reservationId: number,
    userId: string,
    ipAddress?: string
  ): Promise<ReservationCheckoutResult> {
    const account = await this.getAccount(reservationId);
    if (!account.stayId) {
      throw {
        statusCode: 409,
        code: "STAY_NOT_OPENED",
        message: "La reserva no tiene una estancia abierta para hacer check-out.",
      };
    }

    const stay = await this.stayService.checkOut(account.stayId, userId, ipAddress);
    const draft = await this.invoiceRepository.create(stay.id, userId);
    const invoice = await this.invoiceRepository.issue(draft.id, userId, ipAddress);

    return {
      reservationId,
      stay,
      invoice,
      account: await this.getAccount(reservationId),
    };
  }
}
