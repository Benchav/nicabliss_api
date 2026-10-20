import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { guestRouter } from "./guest.routes.js";
import { billingRouter } from "./billing.routes.js";
import { foodOrderRouter } from "./food-order.routes.js";
import { laundryRouter } from "./laundry.routes.js";
import { cashRouter } from "./cash.routes.js";
import { dashboardRouter } from "./dashboard.routes.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/guests", guestRouter);
apiRouter.use("/billing", billingRouter);
apiRouter.use("/food-orders", foodOrderRouter);
apiRouter.use("/laundry", laundryRouter);
apiRouter.use("/cash-register", cashRouter);
apiRouter.use("/dashboard", dashboardRouter);
