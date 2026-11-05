import { createFileRoute } from "@tanstack/react-router";
import { DesignScreen } from "@/components/DesignScreen";
import { useAssistantChat } from "@/hooks/use-assistant-chat";
import * as screen from "@/screens/assistant";

const nav: Record<string, string> = {"Authenticate Business": "/customer/verify", "Verify Now": "/customer/verify", "View All Products": "/customer/products", "Accept Stack & Sign -Month Contract": "/customer/track"};

export const Route = createFileRoute("/customer/assistant")({
  head: () => ({
    meta: [
      { title: "AI Assistant · Airtel Business" },
      { name: "description", content: "Build your connectivity stack with the AI assistant and see live pricing." },
      { property: "og:title", content: "AI Assistant · Airtel Business" },
      { property: "og:description", content: "Build your connectivity stack with the AI assistant and see live pricing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssistantPage,
});

function AssistantPage() {
  useAssistantChat();
  return <DesignScreen screen={screen} nav={nav} />;
}
