import {
  Bot,
  BookOpenText,
  Boxes,
  Clock3,
  ContactRound,
  GitBranch,
  Hand,
  Layers3,
  LifeBuoy,
  Megaphone,
  MessageCircleMore,
  Package,
  Send,
  ShoppingBag,
  Tags,
  Truck,
  WandSparkles,
  Workflow,
} from "lucide-react";
import type { MarketingFeatureIcon as MarketingFeatureIconName } from "@/lib/marketing-features";

const featureIcons = {
  bot: Bot,
  whatsapp: MessageCircleMore,
  web: MessageCircleMore,
  telegram: Send,
  layers: Layers3,
  hand: Hand,
  contact: ContactRound,
  pipeline: GitBranch,
  segment: Tags,
  complaint: LifeBuoy,
  wand: WandSparkles,
  book: BookOpenText,
  clock: Clock3,
  automation: Workflow,
  broadcast: Megaphone,
  product: Package,
  order: ShoppingBag,
  shipping: Truck,
} satisfies Record<MarketingFeatureIconName, typeof Bot>;

export function MarketingFeatureIcon({
  name,
  size = 18,
}: {
  name: MarketingFeatureIconName;
  size?: number;
}) {
  const Icon = featureIcons[name] ?? Boxes;
  return <Icon size={size} aria-hidden="true" />;
}
