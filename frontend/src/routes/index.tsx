import { createFileRoute } from "@tanstack/react-router";
import { DesignScreen } from "@/components/DesignScreen";
import * as screen from "@/screens/role";

const nav: Record<string, string> = {"Enter Customer Portal": "/customer", "Enter Operations Console": "/admin"};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Select Your Access Portal · Airtel Business Udyam" },
      { name: "description", content: "Choose the customer portal or the operations console for Airtel Business Udyam." },
      { property: "og:title", content: "Select Your Access Portal · Airtel Business Udyam" },
      { property: "og:description", content: "Choose the customer portal or the operations console for Airtel Business Udyam." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RolePage,
});

function RolePage() {
  return <DesignScreen screen={screen} nav={nav} />;
}
