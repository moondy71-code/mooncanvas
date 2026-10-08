import { createSessionService, json, sessionErrorResponse, type MindCanvasApiEnvironment } from "../../../src/server/mindcanvas-api.js";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return json({ error: "not-found" }, 404);
    try {
      return json(await createSessionService(process.env as MindCanvasApiEnvironment).create(), 201);
    } catch (error) {
      return sessionErrorResponse(error);
    }
  },
};
