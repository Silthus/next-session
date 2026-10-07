import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "../../lib/telemetry";
import { KEEP_NUDGE, KeepGroup, type KeepState } from "./KeepGroup";

vi.mock(import("../../lib/telemetry"), async (original) => ({
  ...(await original()),
  track: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(track).mockReset();
});

type Props = ComponentProps<typeof KeepGroup>;

function renderInRouter(node: () => ReactNode) {
  const router = createRouter({
    routeTree: createRootRoute({ component: node }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

function renderKeep(overrides: Partial<Props> = {}) {
  const handlers = {
    onKeep: vi.fn<Props["onKeep"]>(),
    onContinueWithGoogle: vi.fn<NonNullable<Props["onContinueWithGoogle"]>>(),
    onDismissNudge: vi.fn<NonNullable<Props["onDismissNudge"]>>(),
    onRemove: vi.fn<NonNullable<Props["onRemove"]>>(),
  };
  const props: Props = {
    groupId: "group-keep",
    state: "offer",
    invite: "line",
    refusal: null,
    ...handlers,
    ...overrides,
  };
  renderInRouter(() => <KeepGroup {...props} />);
  return handlers;
}

function Keeping({ initial, ...props }: Partial<Props> & { initial: KeepState }) {
  const [state, setState] = useState(initial);
  return (
    <>
      <KeepGroup
        groupId="group-keep"
        invite="line"
        refusal={null}
        state={state}
        onKeep={() => setState("kept")}
        onRemove={() => setState("offer")}
        {...props}
      />
      <button type="button" onClick={() => setState("kept")}>
        Kept elsewhere
      </button>
    </>
  );
}

describe("KeepGroup for a visitor", () => {
  it("invites with a card: Create account first, then Continue with Google", async () => {
    const { onKeep, onContinueWithGoogle } = renderKeep({ invite: "nudge" });

    const nudge = await screen.findByRole("region", { name: KEEP_NUDGE.title });
    expect(within(nudge).getByText("Find it and your answers on all your devices.")).toBeTruthy();
    expect(within(nudge).getByText("Get notified when the next session is set.")).toBeTruthy();
    const actions = within(nudge)
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(actions).toEqual(["Create account", "Continue with Google", "Not now"]);
    expect(within(nudge).getByRole("link", { name: "Terms" })).toBeTruthy();

    await userEvent.click(within(nudge).getByRole("button", { name: "Create account" }));
    await userEvent.click(within(nudge).getByRole("button", { name: "Continue with Google" }));

    expect(onKeep).toHaveBeenCalledOnce();
    expect(onContinueWithGoogle).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenCalledWith({ name: "keep_group_started", group_id: "group-keep" });
  });

  it("leaves Google out until it is switched on", async () => {
    renderKeep({ invite: "nudge", onContinueWithGoogle: undefined });

    const nudge = await screen.findByRole("region", { name: KEEP_NUDGE.title });
    expect(within(nudge).queryByRole("button", { name: "Continue with Google" })).toBeNull();
    expect(within(nudge).queryByRole("link", { name: "Terms" })).toBeNull();
  });

  it("moves focus to the quiet Keep button when the visitor dismisses the nudge", async () => {
    function Visit() {
      const [invite, setInvite] = useState<"nudge" | "line">("nudge");
      return (
        <KeepGroup
          groupId="group-keep"
          state="offer"
          invite={invite}
          refusal={null}
          onKeep={() => undefined}
          onDismissNudge={() => setInvite("line")}
        />
      );
    }
    renderInRouter(Visit);

    await userEvent.click(await screen.findByRole("button", { name: "Not now" }));

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep this group" }));
  });

  it("hands Not now to the page", async () => {
    const { onDismissNudge } = renderKeep({ invite: "nudge" });

    await userEvent.click(await screen.findByRole("button", { name: "Not now" }));

    expect(onDismissNudge).toHaveBeenCalledOnce();
  });
});

describe("KeepGroup as a quiet line", () => {
  it("offers Keep this group on all your devices", async () => {
    const { onKeep } = renderKeep();

    const keep = await screen.findByRole("button", { name: "Keep this group" });
    expect(keep.closest("p")?.textContent).toBe("Keep this group on all your devices.");
    await userEvent.click(keep);

    expect(onKeep).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledExactlyOnceWith({
      name: "keep_group_started",
      group_id: "group-keep",
    });
  });

  it("holds the line while keeping", async () => {
    renderKeep({ state: "keeping" });

    expect(await screen.findByRole("button", { name: "Keeping…" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("explains a refused keep", async () => {
    renderKeep({ refusal: "Another account keeps this name." });

    expect((await screen.findByRole("alert")).textContent).toBe("Another account keeps this name.");
  });
});

describe("KeepGroup once kept", () => {
  it("reads Kept in My groups with Remove from my groups beside it", async () => {
    const { onRemove } = renderKeep({ state: "kept" });

    const line = (await screen.findByText("Kept in My groups")).closest("p");
    expect(line?.textContent).toBe("Kept in My groups · Remove from my groups");
    expect(screen.queryByRole("button", { name: "Keep this group" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Remove from my groups" }));

    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("explains a refusal under the kept line too", async () => {
    renderKeep({ state: "kept", refusal: "Your own groups didn't move: the save expired." });

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Your own groups didn't move: the save expired.",
    );
    expect(screen.getByText("Kept in My groups")).toBeTruthy();
  });

  it("moves focus to the kept line once a tapped keep goes through", async () => {
    renderInRouter(() => <Keeping initial="offer" />);

    await userEvent.click(await screen.findByRole("button", { name: "Keep this group" }));

    expect(document.activeElement?.textContent).toBe("Kept in My groups");
  });

  it("leaves focus where it is when an answer kept the Group", async () => {
    renderInRouter(() => <Keeping initial="offer" />);
    const answer = await screen.findByRole("button", { name: "Kept elsewhere" });

    await userEvent.click(answer);

    expect(await screen.findByText("Kept in My groups")).toBeTruthy();
    expect(document.activeElement).toBe(answer);
  });

  it("moves focus to the kept line once the sheet the keep went through closes", async () => {
    const sheet = document.body.appendChild(document.createElement("dialog"));
    sheet.setAttribute("open", "");
    renderInRouter(() => <Keeping initial="offer" />);
    await userEvent.click(await screen.findByRole("button", { name: "Keep this group" }));
    expect(document.activeElement?.textContent).not.toBe("Kept in My groups");

    sheet.removeAttribute("open");
    sheet.dispatchEvent(new Event("close"));

    expect(document.activeElement?.textContent).toBe("Kept in My groups");
    sheet.remove();
  });

  it("moves focus to Keep this group after Remove, so the keyboard stays on the line", async () => {
    renderInRouter(() => <Keeping initial="kept" />);

    await userEvent.click(await screen.findByRole("button", { name: "Remove from my groups" }));

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep this group" }));
  });
});
