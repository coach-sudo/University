import { routeApi } from "../../server.mjs";

export default async function handler(request) {
  try {
    return Response.json(await routeApi(request.method, "/api/status"));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Status failed" }, { status: 500 });
  }
}

export const config = {
  path: "/api/status",
};
