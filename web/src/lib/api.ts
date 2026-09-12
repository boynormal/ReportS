import { parseRange } from "./dates";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function errorJson(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

export function readFilters(request: Request) {
  const url = new URL(request.url);
  const range = parseRange(url.searchParams);
  const branch = url.searchParams.get("branch_code") || url.searchParams.get("branch");
  const recordedBy = url.searchParams.get("recorded_by") || url.searchParams.get("uid");
  return {
    range,
    branch: branch && branch.length > 0 ? branch : null,
    recordedBy: recordedBy && recordedBy.length > 0 ? recordedBy : null,
    search: url.searchParams,
  };
}
