import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AnalyticsDashboard } from "@/components/analytics/AnalyticsDashboard";

function monthStartISO(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

export default async function AnalyticsPage(props: { searchParams: Promise<{ month?: string }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const searchParams = await props.searchParams;
  const month = searchParams.month || monthStartISO();

  return <AnalyticsDashboard month={month} />;
}
