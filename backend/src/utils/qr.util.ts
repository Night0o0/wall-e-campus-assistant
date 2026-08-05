import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const generateQrToken = (sessionId: string, qrSecret: string): string => {
  const secret = qrSecret + env.JWT_SECRET;
  return jwt.sign({ sessionId }, secret, { expiresIn: "30s" });
};

export const decodeQrTokenUnsafe = (token: string): { sessionId: string } | null => {
  try {
    const decoded = jwt.decode(token) as { sessionId: string } | null;
    return decoded;
  } catch {
    return null;
  }
};

export const verifyQrToken = (token: string, qrSecret: string): { sessionId: string } => {
  const secret = qrSecret + env.JWT_SECRET;
  const decoded = jwt.verify(token, secret) as { sessionId: string };
  return decoded;
};
