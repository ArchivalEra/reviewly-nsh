// The PR page: overview from the store, the lazily loaded files and diff,
// DiffView in patch mode with line annotations, and the review to save.
import { signal, Text, View } from "nsh";
import { Button, DiffView, Input, NavPage } from "nsh/base";
import { Badge } from "../components/Badge";
import { Header } from "../components/Header";
import { nav } from "../nav";
import { ensureDetail, getHead, prDetail, prRecord, prReview, saveReview, setHead, syncState } from "../store";
import type { Review } from "../lib/gh";

export function PrDetail(props: { full: string; n: number }) {
  // Reads through closures, so the page follows the store.
  const record = () => prRecord(props.full, props.n);
  const detail = () => prDetail(props.full, props.n);
  const review = () => prReview(props.full, props.n);
  const status = () => (review() === undefined ? "unreviewed" : review()!.headSha === record()?.headSha ? "fresh" : "STALE");

  // The detail is fetched once the page opens (lazy: never before).
  // `onMount` runs once per page: nsh/base's lifecycle is not React's.
  let fetched = false;
  const fetchOnce = () => {
    if (fetched) return;
    fetched = true;
    void ensureDetail(props.full, props.n);
  };
  fetchOnce();

  // The form's drafts; the saved review comes from the store.
  const verdict = signal<Review["verdict"]>("comment");
  const summary = signal("");
  const annotationBody = signal("");
  // The annotation's path and line come from the DiffView's selection.
  const save = () => {
    const headSel = getHead();
    const annotations = headSel && annotationBody().trim()
      ? [{ path: `${props.full}#${props.n}`, line: headSel.start + 1, body: annotationBody().trim() }]
      : [];
    saveReview(props.full, props.n, verdict(), summary(), annotations);
    annotationBody.set("");
    setHead(null);
  };

  // The lines selected on the diff's numbers (the annotation's place).
  const onSelection = ({ range }: { range: { side: string; start: number; end: number } | null }) => {
    setHead(range ? { side: range.side, start: range.start, end: range.end } : null);
  };

  return (
    <NavPage title={`PR ${props.n}`} header={<Header title={record()?.title ?? `PR ${props.n}`} />}>
      <View class="flex-1">
        <View class="gap-2 border-b border-border px-4 py-3">
          <Text class="text-base font-semibold text-foreground">{record()?.title ?? `#${props.n}`}</Text>
          <View class="flex-row items-center gap-2">
            <Text class="text-xs text-muted-foreground">
              {`${record()?.author ?? ""} · +${record()?.additions ?? 0} −${record()?.deletions ?? 0} · ${record()?.changedFiles ?? 0} files`}
            </Text>
            <Badge
              label={record()?.merged ? "merged" : (record()?.state ?? "—")}
              tone={record()?.merged ? "merged" : (record()?.state ?? "unreviewed")}
            />
            <Badge label={status()} tone={status() === "fresh" ? "fresh" : status() === "STALE" ? "stale" : "unreviewed"} />
          </View>
          <If when={status() === "STALE"}>
            <Text class="text-xs text-destructive">The PR changed since this review was saved — review it again to clear STALE.</Text>
          </If>
          <If when={syncState().error}>
            {(error) => (
              <Text class="text-xs text-destructive">{`Detail fetch failed: ${error()}`}</Text>
            )}
          </If>
        </View>

        <View class="gap-1 border-b border-border px-4 py-2">
          <Text class="text-xs font-semibold text-muted-foreground">Files</Text>
          <If when={detail()} else={<Text class="text-xs text-muted-foreground">Loading files…</Text>}>
            {(d) => (
              <View class="gap-1">
                <Each of={d().files}>
                  {(file) => (
                    <Text class="text-xs text-foreground">
                      {`${file().filename} (+${file().additions} −${file().deletions}, ${file().status})`}
                    </Text>
                  )}
                </Each>
                <If when={d().files.length === 0}>
                  <Text class="text-xs text-muted-foreground">No file changes.</Text>
                </If>
              </View>
            )}
          </If>
        </View>

        <View class="flex-1">
          <If when={detail()} else={<View class="items-center py-6"><Text class="text-sm text-muted-foreground">Loading diff…</Text></View>}>
            {(d) => (
              <DiffView
                patch={d().diff}
                layout="unified"
                onLineSelectionChange={onSelection}
                class="flex-1"
              />
            )}
          </If>
        </View>

        <View class="gap-2 border-t border-border px-4 py-3">
          <Text class="text-xs font-semibold text-muted-foreground">
            <If when={getHead()} else={<Text class="text-xs text-muted-foreground">Select a diff line to annotate it</Text>}>
              {(sel) => <Text class="text-xs text-foreground">{`Annotating lines ${sel().start + 1}–${sel().end + 1}`}</Text>}
            </If>
          </Text>
          <Input
            value={annotationBody()}
            onChange={({ value }) => annotationBody.set(value)}
            placeholder="Annotation (for the selected line)"
            accessibilityLabel="Annotation"
            class="rounded-(--radius) border border-input px-3 py-2 text-sm text-foreground"
          />
          <Input
            value={summary()}
            onChange={({ value }) => summary.set(value)}
            placeholder="Review summary"
            accessibilityLabel="Review summary"
            class="rounded-(--radius) border border-input px-3 py-2 text-sm text-foreground"
          />
          <View class="flex-row items-center gap-2">
            <Button
              onPress={() => verdict.set("approve")}
              class={`rounded-(--radius) border px-3 py-1.5 active:opacity-60 ${verdict() === "approve" ? "border-success" : "border-border"}`}
            >
              <Text class="text-sm text-foreground">Approve</Text>
            </Button>
            <Button
              onPress={() => verdict.set("request_changes")}
              class={`rounded-(--radius) border px-3 py-1.5 active:opacity-60 ${verdict() === "request_changes" ? "border-destructive" : "border-border"}`}
            >
              <Text class="text-sm text-foreground">Request changes</Text>
            </Button>
            <Button
              onPress={() => verdict.set("comment")}
              class={`rounded-(--radius) border px-3 py-1.5 active:opacity-60 ${verdict() === "comment" ? "border-accent" : "border-border"}`}
            >
              <Text class="text-sm text-foreground">Comment</Text>
            </Button>
            <View class="flex-1" />
            <Button
              onPress={save}
              disabled={!record()}
              class="rounded-(--radius) bg-primary px-4 py-1.5 active:opacity-60 disabled:opacity-40"
            >
              <Text class="text-sm text-primary-foreground">Save review</Text>
            </Button>
          </View>
          <If when={review()}>
            {(r) => (
              <Text class="text-xs text-muted-foreground">
                {`Review saved: ${r().verdict} at ${r().savedAt} on ${r().headSha.slice(0, 7)}${r().annotations.length ? ` · ${r().annotations.length} annotation(s)` : ""}`}
              </Text>
            )}
          </If>
        </View>
      </View>
    </NavPage>
  );
}
