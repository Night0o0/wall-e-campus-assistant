import { Request, Response } from "express";
import { AuthService } from "../services/auth.service.js";

const authService = new AuthService();

export const register = async (
    req: Request,
    res: Response
) => {

    try {

        const user = await authService.register(req.body);

        res.status(201).json({
            message: "User registered successfully",
            user: {
                id: user.id,
                universityId: user.universityId,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                isVerified: user.isVerified
            }
        });

    } catch (error) {

        res.status(400).json({
            message:
                error instanceof Error
                    ? error.message
                    : "Unknown Error"
        });

    }

};

export const login = async (
    req: Request,
    res: Response
) => {

    try {

        const result = await authService.login(req.body);

        res.status(200).json({
            message: "Login successful",
            token: result.token,
            user: result.user
        });

    } catch (error) {

        res.status(401).json({
            message:
                error instanceof Error
                    ? error.message
                    : "Unknown Error"
        });

    }

};

export const getProfile = async (
    req: Request,
    res: Response
) => {

    try {

        const profile = await authService.getProfile(req.user!.id);

        res.status(200).json({
            user: profile
        });

    } catch (error) {

        res.status(400).json({
            message:
                error instanceof Error
                    ? error.message
                    : "Unknown Error"
        });

    }

};