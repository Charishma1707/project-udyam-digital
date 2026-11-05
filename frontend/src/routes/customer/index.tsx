import { createFileRoute } from "@tanstack/react-router";
import { DesignScreen } from "@/components/DesignScreen";
import * as screen from "@/screens/hub";

const nav: Record<string, string> = {"Authenticate Business": "/customer/verify", "Upload Verification Files": "/customer/verify", "View All Products": "/customer/products", "AI Assistant & Voice": "/customer/assistant", "Track Order": "/customer/track"};

export const Route = createFileRoute("/customer/")({
  head: () => ({
    meta: [
      { title: "Customer Hub · Airtel Business" },
      { name: "description", content: "Authenticate your business, browse enterprise products, or ask the AI assistant." },
      { property: "og:title", content: "Customer Hub · Airtel Business" },
      { property: "og:description", content: "Authenticate your business, browse enterprise products, or ask the AI assistant." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HubPage,
});

function HubPage() {
  return <DesignScreen screen={screen} nav={nav} />;
}
