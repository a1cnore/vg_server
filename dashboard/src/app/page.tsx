import HomeClient from "./_home-client";
import { getOverviewData } from "@/lib/overview";

export const dynamic = "force-dynamic";

export default async function Page() {
  const overview = await getOverviewData();

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#e5e5e5] p-6">
      <HomeClient initial={overview} />
    </main>
  );
}
