import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "../../../lib/telemetry";
import { HeaderShareLink } from "./HeaderShareLink";

vi.mock(import("../../../lib/telemetry"), async (original) => ({
  ...(await original()),
  track: vi.fn(),
  log: vi.fn(),
}));

const url = "https://next-session.link/s/k3Qx9Lm2aB";

function stubClipboard(writeText: (text: string) => Promise<void>) {
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
}

describe("HeaderShareLink", () => {
  beforeEach(() => vi.mocked(track).mockReset());
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, "execCommand");
  });

  it("copies the player link in one tap and confirms it with a toast", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);
    const showToast = vi.fn();
    render(<HeaderShareLink url={url} onRotate={vi.fn()} showToast={showToast} />);

    await userEvent.click(screen.getByRole("button", { name: "Copy player link" }));

    expect(writeText).toHaveBeenCalledWith(url);
    expect(showToast).toHaveBeenCalledExactlyOnceWith("Link copied. Send it to your players.");
    expect(track).toHaveBeenCalledExactlyOnceWith({
      name: "share_link_copied",
      surface: "header",
      method: "clipboard",
    });
  });

  it("sends the GM to the share menu when the browser refuses every way to copy", async () => {
    stubClipboard(() => Promise.reject(new Error("blocked")));
    Object.defineProperty(document, "execCommand", { configurable: true, value: () => false });
    const showToast = vi.fn();
    render(<HeaderShareLink url={url} onRotate={vi.fn()} showToast={showToast} />);

    await userEvent.click(screen.getByRole("button", { name: "Copy player link" }));

    expect(showToast).toHaveBeenCalledExactlyOnceWith(
      "Copying didn't work. Open Share and long-press the link.",
    );
  });

  it("keeps the link, every share target and Rotate one tap away in the share menu", async () => {
    vi.stubGlobal("navigator", { ...navigator, share: () => Promise.resolve() });
    const onRotate = vi.fn();
    render(<HeaderShareLink url={url} onRotate={onRotate} showToast={vi.fn()} />);
    expect(screen.queryByText("next-session.link/s/k3Qx9Lm2aB")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Share player link" }));

    expect(screen.getByText("next-session.link/s/k3Qx9Lm2aB")).toBeTruthy();
    for (const name of ["Share via WhatsApp", "Share via Telegram", "Share via Mail"]) {
      expect(screen.getByRole("link", { name })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "Share" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Rotate" }));
    expect(onRotate).toHaveBeenCalledOnce();
  });

  it("shows the link itself beside Copy on wide screens", async () => {
    stubClipboard(() => Promise.resolve());
    render(<HeaderShareLink url={url} wide onRotate={vi.fn()} showToast={vi.fn()} />);
    expect(screen.getByText("next-session.link/s/k3Qx9Lm2aB")).toBeTruthy();
    const copyButton = screen.getByRole("button", { name: "Copy player link" });
    expect(copyButton.textContent).toBe("Copy");

    await userEvent.click(copyButton);

    expect(copyButton.textContent).toBe("Copied");
  });
});
