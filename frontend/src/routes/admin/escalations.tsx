import { createFileRoute } from "@tanstack/react-router";
import { DesignScreen } from "@/components/DesignScreen";
import * as screen from "@/screens/adminEscalations";

const nav: Record<string, string> = {"All Orders": "/admin", "Change Status": "/admin/status", "Escalations": "/admin/escalations"};

export const Route = createFileRoute("/admin/escalations")({
  head: () => ({
    meta: [
      { title: "Escalations · Udyam Operations Console" },
      { name: "description", content: "Triage escalated orders flagged for urgent review." },
      { property: "og:title", content: "Escalations · Udyam Operations Console" },
      { property: "og:description", content: "Triage escalated orders flagged for urgent review." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminEscalationsPage,
});

function AdminEscalationsPage() {
  return <DesignScreen screen={screen} nav={nav} />;
}
