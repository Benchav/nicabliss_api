import { Router } from "express";
import { RoomController } from "../controllers/room.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import { validateBody } from "../middlewares/validate.middleware.js";
import { RoomRepository } from "../repositories/room.repository.js";
import { RoomService } from "../services/room.service.js";
import { createRoomSchema, updateRoomSchema } from "../validators/room.validator.js";

const controller = new RoomController(new RoomService(new RoomRepository()));

export const roomRouter = Router();
roomRouter.use(authMiddleware);
roomRouter.get("/availability", requireRole("ADMIN", "RECEPTIONIST", "STAFF"), controller.getAvailability);
roomRouter.get("/", requireRole("ADMIN", "RECEPTIONIST", "STAFF"), controller.getAll);
roomRouter.get("/:id", requireRole("ADMIN", "RECEPTIONIST", "STAFF"), controller.getById);
roomRouter.post("/", requireRole("ADMIN"), validateBody(createRoomSchema), controller.create);
roomRouter.put("/:id", requireRole("ADMIN"), validateBody(updateRoomSchema), controller.update);
roomRouter.delete("/:id", requireRole("ADMIN"), controller.deactivate);
