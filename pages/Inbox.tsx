// The Inbox: the repo the store shows, its PRs from the store, and the sync buttons.
// Every row's facts come from the store's probe records; nothing is hand-written here.
import { List, signal, Text, View } from "nsh";
import { Button, Input, NavPage } from "nsh/base";
import { Badge } from "../components/Badge";
import { Header } from "../components/Header";
import { RateLimitBar } from "../components/RateLimitBar";
import { nav } from "../nav";
import { addRepo, current, getFull, getRepos, saveSettings, selectRepo, statusOf, syncAll, syncState } from "../store";

export function Inbox() {
  // The Add form's draft; the store owns everything else.
  const owner = signal("");
  const repo = signal("");
  const add = () => {
    addRepo(owner(), repo());
    saveSettings({ orgFilter: owner().trim() || undefined });
    owner.set("");
    repo.set("");
  };
  const rows = () => (current() ? getFull(current()!) : []);
  return (
    <NavPage title="Inbox" header={<Header title="Inbox" />}>
      <View class="flex-1">
        <RateLimitBar />
        <View class="flex-row items-center gap-2 border-b border-border px-4 py-2">
          <Text class="flex-1 text-sm text-foreground">
            <If when={current()} else={<Text class="text-sm text-muted-foreground">No repo selected</Text>}>
              {(full) => <Text class="text-sm text-foreground">{full()}</Text>}
            </If>
          </Text>
          <Button onPress={() => nav.push({ name: "settings" })} class="rounded-(--radius) border border-border px-3 py-1.5 active:opacity-60">
            <Text class="text-sm text-foreground">Settings</Text>
          </Button>
          <Button
            onPress={() => {
              void syncAll();
            }}
            disabled={syncState().running}
            class="rounded-(--radius) bg-primary px-3 py-1.5 active:opacity-60 disabled:opacity-40"
          >
            <If when={syncState().running} else={<Text class="text-sm text-primary-foreground">Sync</Text>}>
              <Text class="text-sm text-primary-foreground">Syncing…</Text>
            </If>
          </Button>
        </View>
        <If when={syncState().error} else={<View />}>
          {(error) => (
            <View class="border-b border-border px-4 py-2">
              <Text class="text-xs text-destructive">{`Sync failed: ${error()}`}</Text>
            </View>
          )}
        </If>
        <If when={current() === null && getRepos().length > 0}>
          <View class="flex-row items-center gap-2 border-b border-border px-4 py-2">
            <Text class="flex-1 text-xs text-muted-foreground">Pick a repo:</Text>
            <Each of={getRepos()} key={(r) => `${r.owner}/${r.repo}`}>
              {(r) => (
                <Button
                  onPress={() => selectRepo(`${r().owner}/${r().repo}`)}
                  class="rounded-(--radius) border border-border px-2 py-1 active:opacity-60"
                >
                  <Text class="text-xs text-foreground">{`${r().owner}/${r().repo}`}</Text>
                </Button>
              )}
            </Each>
          </View>
        </If>
        <List
          each={rows()}
          keyExtractor={(item) => String(item.number)}
          estimatedItemSize={56}
          class="flex-1"
          empty={
            <View class="items-center px-4 py-6">
              <Text class="text-sm text-muted-foreground">No PRs synced for this repo yet.</Text>
            </View>
          }
        >
          {(row) => (
            <View
              role="button"
              accessibilityLabel={`PR ${row().number}`}
              onPress={() => nav.push({ name: "pr", full: current()!, n: row().number })}
              class="flex-row items-center gap-3 border-b border-border px-4 py-3 active:bg-muted"
            >
              <View class="flex-1 gap-1">
                <Text class="text-sm font-semibold text-foreground">{`#${row().number} ${row().title}`}</Text>
                <Text class="text-xs text-muted-foreground">
                  {`${row().author} · +${row().additions} −${row().deletions} · ${row().changedFiles} files`}
                </Text>
              </View>
              <Badge label={row().merged ? "merged" : row().state} tone={row().merged ? "merged" : row().state} />
              <ReviewBadge full={current()!} n={row().number} />
            </View>
          )}
        </List>
        <View class="flex-row items-center gap-2 border-t border-border px-4 py-3">
          <Text class="text-xs text-muted-foreground">{`${getRepos().length} repo${getRepos().length === 1 ? "" : "s"}`}</Text>
          <View class="flex-1" />
          <Input
            value={owner()}
            onChange={({ value }) => owner.set(value)}
            placeholder="owner"
            autoCapitalize="none"
            accessibilityLabel="Owner"
            class="w-24 rounded-(--radius) border border-input px-2 py-1.5 text-sm text-foreground"
          />
          <Input
            value={repo()}
            onChange={({ value }) => repo.set(value)}
            placeholder="repo"
            autoCapitalize="none"
            onSubmit={add}
            accessibilityLabel="Repo"
            class="w-24 rounded-(--radius) border border-input px-2 py-1.5 text-sm text-foreground"
          />
          <Button
            onPress={add}
            disabled={!owner().trim() || !repo().trim()}
            class="rounded-(--radius) border border-border px-3 py-1.5 active:opacity-60 disabled:opacity-40"
          >
            <Text class="text-sm text-foreground">Add</Text>
          </Button>
        </View>
      </View>
    </NavPage>
  );
}

// The review standing of one PR, read where the row is reused.
function ReviewBadge(props: { full: string; n: number }) {
  const status = () => statusOf(props.full, props.n);
  return (
    <If when={status() === "unreviewed"} else={<Badge label={status()} tone={status() === "fresh" ? "fresh" : "stale"} />}>
      <Badge label="unreviewed" tone="unreviewed" />
    </If>
  );
}
