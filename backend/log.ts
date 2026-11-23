// The app's log: pino, structured, English (conventions: Next.js app). Never a token, a photo's name or an email address.
// PORTFOLIO_LOG_LEVEL (pino's levels: debug, info, warn, error, silent) defaults to info.
import pino from "pino";

export const log = pino({ base: { app: "portfolio" }, level: process.env.PORTFOLIO_LOG_LEVEL || "info" });
