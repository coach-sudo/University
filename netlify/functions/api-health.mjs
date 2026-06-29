import { routeApi } from "../../server.mjs";

export default async function handler(request) {
  try {
    return Response.json(await routeApi(request.method, "/api/health"));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Health check failed" }, { status: 500 });
  }
}

export const config = {
  path: "/api/health",
};
