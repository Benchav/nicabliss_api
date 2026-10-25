import { Router } from "express";
import { AuthController } from "../controllers/auth.controller.js";
import { AuthService } from "../services/auth.service.js";
import { UserRepository } from "../repositories/user.repository.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import { validateBody } from "../middlewares/validate.middleware.js";
import { loginSchema, registerSchema } from "../validators/auth.validator.js";
import { loginRateLimit } from "../middlewares/login-rate-limit.middleware.js";

export const userRepository = new UserRepository();
export const authService = new AuthService(userRepository);
export const authController = new AuthController(authService);

export const authRouter = Router();
authRouter.post("/login", validateBody(loginSchema), loginRateLimit, authController.login);
authRouter.post(
  "/register",
  authMiddleware,
  requireRole("ADMIN"),
  validateBody(registerSchema),
  authController.register
);
authRouter.get("/me", authMiddleware, authController.getProfile);
