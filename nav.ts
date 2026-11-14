import { createNavStack } from "nsh/base";

// The navigation stack's state, created once; pages import it to navigate.
export type Route =
  | { name: "inbox" }
  | { name: "pr"; full: string; n: number }
  | { name: "settings" };

export const nav = createNavStack<Route>([{ name: "inbox" }]);
