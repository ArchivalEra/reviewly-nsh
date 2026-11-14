// The app shell: the root and the navigation stack, no page logic.
// The store's saved state is read once at startup, before the first paint.
import { mount, View } from "nsh";
import { NavStack } from "nsh/base";
import { nav } from "./nav";
import { Inbox } from "./pages/Inbox";
import { PrDetail } from "./pages/PrDetail";
import { SettingsPage } from "./pages/SettingsPage";
import { loadStore } from "./store";

loadStore();

function App() {
  return (
    <View class="flex-1 bg-background">
      <NavStack state={nav} class="flex-1">
        {(route) => {
          switch (route.name) {
            case "inbox":
              return <Inbox />;
            case "pr":
              return <PrDetail full={route.full} n={route.n} />;
            case "settings":
              return <SettingsPage />;
          }
        }}
      </NavStack>
    </View>
  );
}

mount(App);
