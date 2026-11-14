// The Settings page: the PAT, the repos with their removal, the org filter, and clearing the cache.
import { Button, Input, NavPage } from "nsh/base";
import { signal, Text, View } from "nsh";
import { Header } from "../components/Header";
import { RateLimitBar } from "../components/RateLimitBar";
import { addRepo, clearCache, getRepos, getSettings, removeRepo, saveSettings } from "../store";

export function SettingsPage() {
  const token = signal(getSettings().token ?? "");
  const org = signal(getSettings().orgFilter ?? "");
  const owner = signal("");
  const repo = signal("");
  const saveToken = () => saveSettings({ token: token().trim() || undefined });
  const saveOrg = () => saveSettings({ orgFilter: org().trim() || undefined });
  const add = () => {
    addRepo(owner(), repo());
    owner.set("");
    repo.set("");
  };
  return (
    <NavPage title="Settings" header={<Header title="Settings" />}>
      <View class="flex-1">
        <RateLimitBar />
        <View class="gap-3 p-4">
          <Text class="text-sm font-semibold text-foreground">GitHub personal access token</Text>
          <Input
            value={token()}
            onChange={({ value }) => token.set(value)}
            onSubmit={saveToken}
            masked
            autoCapitalize="none"
            placeholder="ghp_… (empty = anonymous)"
            accessibilityLabel="GitHub personal access token"
            class="rounded-(--radius) border border-input px-3 py-2 text-sm text-foreground"
          />
          <Button onPress={saveToken} class="self-start rounded-(--radius) bg-primary px-4 py-2 active:opacity-60">
            <Text class="text-sm text-primary-foreground">Save token</Text>
          </Button>
          <Text class="text-xs text-muted-foreground">
            With a token, requests carry `Authorization: Bearer`. Without one, GitHub allows 60 requests an hour.
          </Text>

          <Text class="text-sm font-semibold text-foreground">Repos</Text>
          <View class="flex-row items-center gap-2">
            <Input
              value={owner()}
              onChange={({ value }) => owner.set(value)}
              placeholder="owner"
              autoCapitalize="none"
              class="w-28 rounded-(--radius) border border-input px-2 py-1.5 text-sm text-foreground"
            />
            <Input
              value={repo()}
              onChange={({ value }) => repo.set(value)}
              placeholder="repo"
              autoCapitalize="none"
              onSubmit={add}
              class="w-28 rounded-(--radius) border border-input px-2 py-1.5 text-sm text-foreground"
            />
            <Button
              onPress={add}
              disabled={!owner().trim() || !repo().trim()}
              class="rounded-(--radius) border border-border px-3 py-1.5 active:opacity-60 disabled:opacity-40"
            >
              <Text class="text-sm text-foreground">Add</Text>
            </Button>
          </View>
          <Each of={getRepos()} key={(r) => `${r.owner}/${r.repo}`}>
            {(r) => (
              <View class="flex-row items-center gap-2">
                <Text class="flex-1 text-sm text-foreground">{`${r().owner}/${r().repo}`}</Text>
                <Button
                  onPress={() => removeRepo(`${r().owner}/${r().repo}`)}
                  class="rounded-(--radius) border border-destructive px-3 py-1.5 active:opacity-60"
                >
                  <Text class="text-sm text-destructive">Remove</Text>
                </Button>
              </View>
            )}
          </Each>

          <Text class="text-sm font-semibold text-foreground">Organization filter</Text>
          <Input
            value={org()}
            onChange={({ value }) => org.set(value)}
            onSubmit={saveOrg}
            autoCapitalize="none"
            placeholder="org (empty = no filter)"
            class="rounded-(--radius) border border-input px-3 py-2 text-sm text-foreground"
          />
          <Button onPress={saveOrg} class="self-start rounded-(--radius) border border-border px-4 py-2 active:opacity-60">
            <Text class="text-sm text-foreground">Save filter</Text>
          </Button>

          <Text class="text-sm font-semibold text-foreground">Cache</Text>
          <Button
            onPress={() => {
              clearCache();
            }}
            class="self-start rounded-(--radius) border border-destructive px-4 py-2 active:opacity-60"
          >
            <Text class="text-sm text-destructive">Clear cached PRs, details and reviews</Text>
          </Button>
        </View>
      </View>
    </NavPage>
  );
}
