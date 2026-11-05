import { createFileRoute } from "@tanstack/react-router";
import { DesignScreen } from "@/components/DesignScreen";
import { useLiveAdminStatus } from "@/hooks/use-live-admin-status";
import * as screen from "@/screens/adminStatus";

const nav: Record<string, string> = {"All Orders": "/admin", "Change Status": "/admin/status", "Escalations": "/admin/escalations"};

export const Route = createFileRoute("/admin/status")({
  head: () => ({
    meta: [
      { title: "Change Order Status · Udyam Operations Console" },
      { name: "description", content: "Move orders through provisioning stages and sync updates." },
      { property: "og:title", content: "Change Order Status · Udyam Operations Console" },
      { property: "og:description", content: "Move orders through provisioning stages and sync updates." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminStatusPage,
});

function AdminStatusPage() {
  useLiveAdminStatus();
  return <DesignScreen screen={screen} nav={nav} />;
}
