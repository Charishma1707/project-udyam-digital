import { createFileRoute } from "@tanstack/react-router";
import { DesignScreen } from "@/components/DesignScreen";
import { useLiveTrack } from "@/hooks/use-live-track";
import * as screen from "@/screens/track";

const nav: Record<string, string> = {};

export const Route = createFileRoute("/customer/track")({
  head: () => ({
    meta: [
      { title: "Track Orders · Airtel Business" },
      { name: "description", content: "Follow every order from confirmation to a live circuit." },
      { property: "og:title", content: "Track Orders · Airtel Business" },
      { property: "og:description", content: "Follow every order from confirmation to a live circuit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TrackPage,
});

function TrackPage() {
  useLiveTrack();
  return <DesignScreen screen={screen} nav={nav} />;
}
