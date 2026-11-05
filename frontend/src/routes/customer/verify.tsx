import { createFileRoute } from "@tanstack/react-router";
import { DesignScreen } from "@/components/DesignScreen";
import { useLiveKyc } from "@/hooks/use-live-kyc";
import * as screen from "@/screens/verify";

const nav: Record<string, string> = {"Authenticate Business": "/customer/track"};

export const Route = createFileRoute("/customer/verify")({
  head: () => ({
    meta: [
      { title: "Verify Business Documents · Airtel Business" },
      { name: "description", content: "Upload Udyam, PAN and utility documents to authenticate your business." },
      { property: "og:title", content: "Verify Business Documents · Airtel Business" },
      { property: "og:description", content: "Upload Udyam, PAN and utility documents to authenticate your business." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VerifyPage,
});

function VerifyPage() {
  useLiveKyc();
  return <DesignScreen screen={screen} nav={nav} />;
}
