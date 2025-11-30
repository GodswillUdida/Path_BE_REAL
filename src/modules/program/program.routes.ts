import { Router } from "express";
import * as ctrl from "./program.controller";
import { authGuard } from "../../middleware/authGuard";
import { roleGuard } from "../../middleware/roleGuard";

const r = Router();

r.post(
  "/",
  authGuard,
  roleGuard("admin", "superadmin"),
  ctrl.createProgramController
);
r.get("/", ctrl.listProgramsController);
r.get("/:id", ctrl.getProgramController);

export default r;
