import { Router } from "express";
import { FoodOrderController } from "../controllers/food-order.controller.js";
import { FoodOrderService } from "../services/food-order.service.js";
import { FoodOrderRepository } from "../repositories/food-order.repository.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import { validateBody } from "../middlewares/validate.middleware.js";
import {
  createFoodOrderSchema,
  updateFoodOrderSchema,
  updateFoodOrderStatusSchema,
} from "../validators/food-order.validator.js";

export const foodOrderRepository = new FoodOrderRepository();
export const foodOrderService = new FoodOrderService(foodOrderRepository);
export const foodOrderController = new FoodOrderController(foodOrderService);

export const foodOrderRouter = Router();
foodOrderRouter.use(authMiddleware);
foodOrderRouter.use(requireRole("ADMIN", "RECEPTIONIST", "STAFF"));
foodOrderRouter.get("/", foodOrderController.getAll);
foodOrderRouter.get("/:id", foodOrderController.getById);
foodOrderRouter.post("/", validateBody(createFoodOrderSchema), foodOrderController.create);
foodOrderRouter.put("/:id", validateBody(updateFoodOrderSchema), foodOrderController.update);
foodOrderRouter.patch("/:id/status", validateBody(updateFoodOrderStatusSchema), foodOrderController.updateStatus);
foodOrderRouter.delete("/:id", foodOrderController.delete);
