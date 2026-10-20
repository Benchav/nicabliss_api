import { Router } from "express";
import { UserController } from "../controllers/user.controller.js";
import { UserService } from "../services/user.service.js";
import { UserRepository } from "../repositories/user.repository.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";

export const userRepository = new UserRepository();
export const userService = new UserService(userRepository);
export const userController = new UserController(userService);

export const userRouter = Router();

// Todas las operaciones de gestión de usuarios y roles requieren autenticación y rol ADMIN
userRouter.use(authMiddleware);
userRouter.use(requireRole("ADMIN"));

userRouter.get("/", userController.getAll);
userRouter.get("/:id", userController.getById);
userRouter.post("/", userController.create);
userRouter.put("/:id", userController.update);
userRouter.delete("/:id", userController.delete);
