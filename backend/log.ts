// The app's log: pino, structured, English (conventions: Next.js app). Never a token, a photo's name or an email address.
import pino from "pino";

export const log = pino({ base: { app: "upload" }, level: process.env.LOG_LEVEL ?? "info" });
