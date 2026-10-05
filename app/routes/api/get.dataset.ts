// Internal endpoint — intentionally undocumented (omitted from the OpenAPI/Swagger spec).
import { extractMetadata, readDataset } from "~/lib/cache.server";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const pid = url.searchParams.get("pid");

  if (!pid) {
    return Response.json({ message: "pid query param is required" }, { status: 400 });
  }

  if (pid.includes("/") || pid.includes("\\") || pid.includes("..")) {
    return Response.json({ message: "pid contains invalid characters" }, { status: 400 });
  }

  try {
    const data = await readDataset(pid);
    const metadata = extractMetadata(data);

    if (!metadata) {
      return Response.json({ message: `No metadata found for pid ${pid}` }, { status: 404 });
    }

    return Response.json(metadata);
  } catch {
    return Response.json({ message: `Dataset ${pid} not found` }, { status: 404 });
  }
}
