import DashboardClient from "./dashboard-client";
import { getVehjoData } from "./lib/google-sheets";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await getVehjoData();
  return <DashboardClient data={data} />;
}

