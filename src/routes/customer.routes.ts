import { Router } from "express";
import { CustomerController } from "../controllers/customer.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import { validateBody } from "../middlewares/validate.middleware.js";
import { CustomerRepository } from "../repositories/customer.repository.js";
import { CustomerService } from "../services/customer.service.js";
import { createCustomerSchema, updateCustomerSchema } from "../validators/customer.validator.js";

const repository = new CustomerRepository();
const service = new CustomerService(repository);
const controller = new CustomerController(service);

export const customerRouter = Router();
customerRouter.use(authMiddleware, requireRole("ADMIN", "RECEPTIONIST"));
customerRouter.get("/", controller.getAll);
customerRouter.post("/", validateBody(createCustomerSchema), controller.create);
customerRouter.get("/:id", controller.getById);
customerRouter.put("/:id", validateBody(updateCustomerSchema), controller.update);
