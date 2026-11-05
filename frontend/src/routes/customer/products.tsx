import { createFileRoute } from "@tanstack/react-router";
import { DesignScreen } from "@/components/DesignScreen";
import { useLiveProducts } from "@/hooks/use-live-products";
import * as screen from "@/screens/products";

const nav: Record<string, string> = {"Authenticate Business": "/customer/verify", "AI Assistant & Voice": "/customer/assistant"};

export const Route = createFileRoute("/customer/products")({
  head: () => ({
    meta: [
      { title: "Enterprise Products · Airtel Business" },
      { name: "description", content: "Browse Airtel Business connectivity, cloud and security products for MSMEs." },
      { property: "og:title", content: "Enterprise Products · Airtel Business" },
      { property: "og:description", content: "Browse Airtel Business connectivity, cloud and security products for MSMEs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductsPage,
});

function ProductsPage() {
  useLiveProducts();
  return <DesignScreen screen={screen} nav={nav} />;
}
