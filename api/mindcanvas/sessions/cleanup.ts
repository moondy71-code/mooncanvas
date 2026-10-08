import { createSessionService, json, sessionErrorResponse, type MindCanvasApiEnvironment } from "../../../src/server/mindcanvas-api.js";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return json({ error: "not-found" }, 404);
    try {
      const environment = process.env as MindCanvasApiEnvironment;
      if (!environment.MINDCANVAS_CRON_SECRET || request.headers.get("x-mindcanvas-cron") !== environment.MINDCANVAS_CRON_SECRET) {
        return json({ error: "unauthorized" }, 401);
      }
      return json({ removed: await createSessionService(environment).cleanup() });
    } catch (error) {
      return sessionErrorResponse(error);
    }
  },
};
