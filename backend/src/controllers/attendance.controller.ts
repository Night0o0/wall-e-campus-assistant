import { Request, Response } from "express";
import { AttendanceService } from "../services/attendance.service.js";

const attendanceService = new AttendanceService();

export const scanAttendance = async (req: Request, res: Response) => {
    try {
        const { token } = req.body;
        const studentId = req.user!.id;
        const orgId = req.user!.organizationId;
        const attendance = await attendanceService.scanAttendance(token, studentId, orgId);
        res.status(201).json({
            message: "Attendance recorded successfully",
            attendance
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getSessionAttendance = async (req: Request, res: Response) => {
    try {
        const sessionId = req.params.sessionId;
        const orgId = req.user!.organizationId;
        const attendances = await attendanceService.getSessionAttendance(sessionId, orgId);
        res.status(200).json(attendances);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getMyAttendance = async (req: Request, res: Response) => {
    try {
        const studentId = req.user!.id;
        const attendances = await attendanceService.getMyAttendance(studentId);
        res.status(200).json(attendances);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getSessionStats = async (req: Request, res: Response) => {
    try {
        const sessionId = req.params.sessionId;
        const orgId = req.user!.organizationId;
        const stats = await attendanceService.getSessionStats(sessionId, orgId);
        res.status(200).json(stats);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getAdminAnalytics = async (req: Request, res: Response) => {
    try {
        const adminId = req.user!.id;
        const orgId = req.user!.organizationId;
        const analytics = await attendanceService.getAdminAnalytics(adminId, orgId);
        res.status(200).json(analytics);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
