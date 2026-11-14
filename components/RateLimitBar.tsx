// The rate-limit line every page shows above its content: remaining requests and when the window resets.
import { Text, View } from "nsh";
import { rateLimit } from "../store";

export function RateLimitBar() {
  return (
    <View class="flex-row items-center border-b border-border px-4 py-1.5">
      <Text class="flex-1 text-xs text-muted-foreground">
        <If when={rateLimit().known} else={<Text class="text-xs text-muted-foreground">API quota: no response yet</Text>}>
          {() => (
            <Text class="text-xs text-muted-foreground">
              {`API quota: ${rateLimit().remaining} requests left (resets at ${new Date(rateLimit().reset * 1000).toLocaleTimeString()})`}
            </Text>
          )}
        </If>
      </Text>
    </View>
  );
}
