// Internal endpoint — intentionally undocumented (omitted from the OpenAPI/Swagger spec).
import { readFile } from "fs/promises";
import path from "path";
import { extractMetadata, getDataDir } from "~/lib/cache.server";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const pid = url.searchParams.get("pid");

  if (!pid) {
    return Response.json({ message: "pid query param is required" }, { status: 400 });
  }

  try {
    const content = await readFile(path.join(getDataDir(), `${pid}.json`), "utf-8");
    const data = JSON.parse(content);
    const metadata = extractMetadata(data);

    if (!metadata) {
      return Response.json({ message: `No metadata found for pid ${pid}` }, { status: 404 });
    }

    return Response.json(metadata);
  } catch {
    return Response.json({ message: `Dataset ${pid} not found` }, { status: 404 });
  }
}
