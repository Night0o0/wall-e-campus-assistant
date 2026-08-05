import { Request, Response } from "express";

export const healthCheck = (
    req: Request,
    res: Response
) => {

    res.status(200).json({

        status: "OK",

        project: "Wall-E Campus Assistant",

        version: "1.0.0",

        timestamp: new Date()

    });

};