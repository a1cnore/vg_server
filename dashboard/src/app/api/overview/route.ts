import { getOverviewData } from "@/lib/overview";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getOverviewData());
}
