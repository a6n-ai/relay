import { MegaphoneIcon } from "lucide-react";
import { StubPage } from "@/components/ds";

export default function CampaignsPage() {
  return (
    <StubPage
      icon={MegaphoneIcon}
      title="Campaigns"
      subtitle="Broadcasts sit on the same outbox as transactional sends."
      message="Campaign tables are not wired in this operator schema yet. Listing will land once Relay mounts makeCampaignTables."
    />
  );
}
