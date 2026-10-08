import { createSessionService, json, requestBody, sessionErrorResponse, type MindCanvasApiEnvironment } from "../../../../src/server/mindcanvas-api.js";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return json({ error: "not-found" }, 404);
    try {
      const input = await requestBody(request);
      if (typeof input["capability"] !== "string") return json({ error: "invalid" }, 400);
      const sessionId = new URL(request.url).pathname.split("/").filter(Boolean).at(-2);
      if (!sessionId) return json({ error: "invalid" }, 400);
      return json(await createSessionService(process.env as MindCanvasApiEnvironment).joinClient(sessionId, input["capability"]));
    } catch (error) {
      return sessionErrorResponse(error);
    }
  },
};
