import { Router } from "express";
import {
    verifyCertificateController,
    getCertificateController,
    issueCertificateController,
    getuserCertificates,
} from "./certificate.controller";
import { authGuard } from "@/middleware/authGuard";
import { roleGuard } from "@/middleware/roleGuard";

const r = Router();

r.post("/issue", authGuard, roleGuard("superadmin", "admin"), issueCertificateController);
r.get("/verify/:verification", authGuard, verifyCertificateController);
r.get("/:enrollmentId", authGuard, getCertificateController);
r.get("/", authGuard, getuserCertificates);

export default r;