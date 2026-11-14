// A state badge: a review's standing (fresh / STALE / unreviewed) or a PR's state (open / closed / merged).
import { Text, View } from "nsh";

export function Badge(props: { label: string; tone: "fresh" | "stale" | "unreviewed" | "open" | "closed" | "merged" }) {
  const tone = () =>
    props.tone === "fresh" || props.tone === "merged"
      ? "bg-success"
      : props.tone === "stale" || props.tone === "closed"
        ? "bg-destructive"
        : "bg-muted";
  const ink = () =>
    props.tone === "fresh" || props.tone === "merged"
      ? "text-primary-foreground"
      : props.tone === "stale" || props.tone === "closed"
        ? "text-primary-foreground"
        : "text-muted-foreground";
  return (
    <View class={`rounded-full px-2 py-0.5 ${tone()}`}>
      <Text class={`text-xs ${ink()}`}>{props.label}</Text>
    </View>
  );
}
