import { routeApi } from "../../server.mjs";

async function readJson(request) {
  return await request.json().catch(() => ({}));
}

export default async function handler(request) {
  try {
    if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
    return Response.json(await routeApi(request.method, "/api/grade", await readJson(request)));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Grading failed" }, { status: 500 });
  }
}

export const config = {
  path: "/api/grade",
};
