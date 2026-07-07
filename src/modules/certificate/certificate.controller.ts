// certificate.controller.ts
import { Request, Response } from "express";
import { CertificateService } from "./certificate.service";
import { success } from "zod";

export const issueCertificateController = async (req: Request, res: Response) => {
    const { enrollmentId } = req.body;

    const certificate = await CertificateService.issueCertificate(enrollmentId);

    res.status(201).json({
        success: true,
        data: certificate,
    });
};

export const verifyCertificateController = async (req: Request, res: Response) => {
    const { verification } = req.params;

    const certificate = await CertificateService.verifyCertificate(verification as string);

    res.json({
        success: true,
        data: certificate,
    });
};

export const getCertificateController = async (req: Request, res: Response) => {
    const { enrollmentId } = req.params;

    const certificate =
        await CertificateService.getCertificateByEnrollment(enrollmentId as string);

    res.json({
        success: true,
        data: certificate,
    });
};

export const getuserCertificates = async (req: Request, res: Response) => {
    const userId = req.user?.id || req.user?.userId;

    const certificate = await CertificateService.getMyCertificates(userId as string);

    res.status(200).json({
        success: true,
        data: certificate,
    })

}