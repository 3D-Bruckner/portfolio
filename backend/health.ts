// GET /health: what Docker's health check and Playwright wait for. It says only whether the app answers and its database does.
import { databaseAnswers } from "./db";
import type { Runtime } from "./runtime";

export type HealthResponse = { status: 200 | 503; body: { status: "ok" | "unavailable" } };

export function healthResponse(rt: Runtime): HealthResponse {
  return databaseAnswers(rt.raw) ? { status: 200, body: { status: "ok" } } : { status: 503, body: { status: "unavailable" } };
}
