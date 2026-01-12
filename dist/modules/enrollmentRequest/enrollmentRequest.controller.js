"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSingleRequest = exports.listPhysicalRequests = exports.createPhysicalEnrollmentRequest = void 0;
const enrollmentRequest_schema_1 = require("./enrollmentRequest.schema");
const enrollmentRequest_service_1 = require("./enrollmentRequest.service");
// import {
//   sendPhysicalEnrollmentRequestAdminNotification,
//   sendPhysicalEnrollmentRequestNotification,
// } from "../../services/emailService";
const createPhysicalEnrollmentRequest = async (req, res) => {
    try {
        const courseId = req.params.courseId;
        const body = enrollmentRequest_schema_1.enrollmentRequestSchema.safeParse({
            ...req.body,
            courseId,
        });
        if (!body.success) {
            return res.status(400).json({
                success: false,
                message: "Invalid request data",
                errors: body.error.flatten().fieldErrors,
            });
        }
        const request = await (0, enrollmentRequest_service_1.createPhysicalEnrollmentRequestService)(courseId, {
            name: body.data.name,
            email: body.data.email,
            phone: body.data.phone,
            notes: body.data.notes,
            courseId: body.data.courseId,
        });
        // try {
        //   await sendPhysicalEnrollmentRequestNotification(body.data.email, {
        //     name: body.data.name,
        //     course: request.courseId,
        //     requestId: request.id,
        //   });
        //   await sendPhysicalEnrollmentRequestAdminNotification({
        //     name: body.data.name,
        //     email: body.data.email,
        //     phone: body.data.phone,
        //     notes: body.data.notes || "",
        //     course: request.courseId,
        //     requestId: request.id,
        //   });
        // } catch (emailError) {
        //   console.error(
        //     "Error sending physical enrollment request emails:",
        //     emailError
        //   );
        // }
        return res.json({
            success: true,
            message: "Your request has been submitted",
            data: request,
        });
    }
    catch (error) {
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Unable to submit request",
        });
    }
};
exports.createPhysicalEnrollmentRequest = createPhysicalEnrollmentRequest;
const listPhysicalRequests = async (req, res, next) => {
    try {
        const requests = await (0, enrollmentRequest_service_1.listPhysicalEnrollmentRequestsService)();
        return res.json({ success: true, data: requests });
    }
    catch (error) {
        console.error("Error: ", error.message);
        next(error);
    }
};
exports.listPhysicalRequests = listPhysicalRequests;
const getSingleRequest = async (req, res, next) => {
    try {
        const id = req.params.id;
        const request = await (0, enrollmentRequest_service_1.getSingleEnrollmentRequestService)(id);
        return res.json({ success: true, data: request });
    }
    catch (error) {
        next(error);
    }
};
exports.getSingleRequest = getSingleRequest;
