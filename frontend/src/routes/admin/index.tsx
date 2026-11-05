import { createFileRoute } from "@tanstack/react-router";
import { DesignScreen } from "@/components/DesignScreen";
import { useLiveAdminOrders } from "@/hooks/use-live-admin-orders";
import * as screen from "@/screens/adminOrders";

const nav: Record<string, string> = {"All Orders": "/admin", "Change Status": "/admin/status", "Escalations": "/admin/escalations"};

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "All Orders · Udyam Operations Console" },
      { name: "description", content: "Review and filter every customer order in the operations console." },
      { property: "og:title", content: "All Orders · Udyam Operations Console" },
      { property: "og:description", content: "Review and filter every customer order in the operations console." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminOrdersPage,
});

function AdminOrdersPage() {
  useLiveAdminOrders();
  return <DesignScreen screen={screen} nav={nav} />;
}
