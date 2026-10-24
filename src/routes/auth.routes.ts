import { Router } from "express";
import { AuthController } from "../controllers/auth.controller.js";
import { AuthService } from "../services/auth.service.js";
import { UserRepository } from "../repositories/user.repository.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import { rateLimit } from "express-rate-limit";
import { validateBody } from "../middlewares/validate.middleware.js";
import { loginSchema, registerSchema } from "../validators/auth.validator.js";

export const userRepository = new UserRepository();
export const authService = new AuthService(userRepository);
export const authController = new AuthController(authService);

export const authRouter = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "Demasiados intentos de inicio de sesión. Intenta nuevamente más tarde.",
    },
  },
});

authRouter.post("/login", loginLimiter, validateBody(loginSchema), authController.login);
authRouter.post(
  "/register",
  authMiddleware,
  requireRole("ADMIN"),
  validateBody(registerSchema),
  authController.register
);
authRouter.get("/me", authMiddleware, authController.getProfile);
