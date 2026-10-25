import { Router } from "express";
import { InvoiceController } from "../controllers/invoice.controller.js";
import { PaymentController } from "../controllers/payment.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import { validateBody } from "../middlewares/validate.middleware.js";
import { InvoiceRepository } from "../repositories/invoice.repository.js";
import { PaymentRepository } from "../repositories/payment.repository.js";
import { ReservationRepository } from "../repositories/reservation.repository.js";
import { InvoiceService } from "../services/invoice.service.js";
import { PaymentService } from "../services/payment.service.js";
import { createInvoiceSchema, voidInvoiceSchema } from "../validators/invoice.validator.js";
import { createPaymentSchema } from "../validators/reservation.validator.js";

const invoiceRepository = new InvoiceRepository();
const invoiceService = new InvoiceService(invoiceRepository);
const invoiceController = new InvoiceController(invoiceService);
const paymentController = new PaymentController(
  new PaymentService(new PaymentRepository(), new ReservationRepository(), invoiceRepository)
);

export const invoiceRouter = Router();
invoiceRouter.use(authMiddleware, requireRole("ADMIN", "RECEPTIONIST"));
invoiceRouter.get("/", invoiceController.getAll);
invoiceRouter.post("/", validateBody(createInvoiceSchema), invoiceController.create);
invoiceRouter.get("/:id/pdf", invoiceController.pdf);
invoiceRouter.post("/:id/issue", invoiceController.issue);
invoiceRouter.post("/:id/payments", validateBody(createPaymentSchema), paymentController.createForInvoice);
invoiceRouter.post("/:id/void", requireRole("ADMIN"), validateBody(voidInvoiceSchema), invoiceController.void);
invoiceRouter.get("/:id", invoiceController.getById);
