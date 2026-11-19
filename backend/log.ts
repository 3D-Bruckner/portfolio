// The app's log: pino, structured, English (conventions: Next.js app). Never a token, a photo's name or an email address.
// UPLOAD_LOG_LEVEL (pino's levels: debug, info, warn, error, silent) defaults to info.
import pino from "pino";

export const log = pino({ base: { app: "upload" }, level: process.env.UPLOAD_LOG_LEVEL || "info" });
