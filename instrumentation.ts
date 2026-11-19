// Runs once when the server starts: reads the settings and opens upload.sqlite (bringing it to the last migration), so a bad setting
// or a broken database stops the start instead of the first request.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { log, runtime } = await import("@/backend");
  const rt = runtime();
  log.info({ publicUrl: rt.config.publicUrl, allowed: rt.config.allowedEmails.length, devUser: Boolean(rt.config.devUser) }, "upload started");
}
