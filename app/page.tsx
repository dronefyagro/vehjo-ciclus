import DashboardClient from "./dashboard-client";
import { getVehjoData } from "./lib/google-sheets";
import { getServerSession } from "./lib/auth";
import { canAccessSheet, USER_RECORD_KIND } from "./lib/access-control";
import { buildStandardDashboardSummary } from "./lib/standard-dashboard";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getServerSession();
  if (!session) redirect("/login");
  const data = await getVehjoData();
  const standardDashboard = session.role === "user" ? buildStandardDashboardSummary(data) : null;
  const sheets = Object.fromEntries(Object.entries(data.sheets).flatMap(([name, sheetRows]) => {
    if (name === "Configurações" && session.role !== "user") return [[name, sheetRows.filter((row) => row[0] !== USER_RECORD_KIND)]];
    return canAccessSheet(session.role, name) ? [[name, sheetRows]] : [];
  }));
  return <DashboardClient data={{ ...data, sheets }} session={session} standardDashboard={standardDashboard}/>;
}

