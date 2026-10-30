import { Router } from "express";
import { PaymentController } from "../controllers/payment.controller.js";
import { ReservationController } from "../controllers/reservation.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import { validateBody } from "../middlewares/validate.middleware.js";
import { PaymentRepository } from "../repositories/payment.repository.js";
import { ReservationRepository } from "../repositories/reservation.repository.js";
import { PaymentService } from "../services/payment.service.js";
import { ReservationService } from "../services/reservation.service.js";
import {
  createPaymentSchema,
  createReservationSchema,
  updateReservationSchema,
  updateReservationStatusSchema,
  voidPaymentSchema,
} from "../validators/reservation.validator.js";
import { stayController } from "./stay.routes.js";

export const reservationRepository = new ReservationRepository();
const reservationService = new ReservationService(reservationRepository);
const reservationController = new ReservationController(reservationService);
const paymentRepository = new PaymentRepository();
const paymentService = new PaymentService(paymentRepository, reservationRepository);
const paymentController = new PaymentController(paymentService);

export const reservationRouter = Router();
reservationRouter.use(authMiddleware, requireRole("ADMIN", "RECEPTIONIST"));
reservationRouter.get("/", reservationController.getAll);
reservationRouter.post("/", validateBody(createReservationSchema), reservationController.create);
reservationRouter.post("/:id/check-in", stayController.checkIn);
reservationRouter.get("/:id/payments", paymentController.getForReservation);
reservationRouter.post("/:id/payments", validateBody(createPaymentSchema), paymentController.createForReservation);
reservationRouter.get("/:id/account", stayController.getAccountByReservation);
reservationRouter.get("/:id", reservationController.getById);
reservationRouter.put("/:id", validateBody(updateReservationSchema), reservationController.update);
reservationRouter.patch("/:id/status", validateBody(updateReservationStatusSchema), reservationController.updateStatus);

export const roomRouter = Router();
roomRouter.use(authMiddleware, requireRole("ADMIN", "RECEPTIONIST"));
roomRouter.get("/availability", reservationController.getRooms);
roomRouter.get("/", reservationController.getRooms);

export const paymentRouter = Router();
paymentRouter.use(authMiddleware, requireRole("ADMIN", "RECEPTIONIST"));
paymentRouter.get("/:id/receipt", paymentController.receipt);
paymentRouter.post("/:id/void", requireRole("ADMIN"), validateBody(voidPaymentSchema), paymentController.void);
