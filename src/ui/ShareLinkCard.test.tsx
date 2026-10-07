import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { log, track } from "../lib/telemetry";
import { ShareLinkCard } from "./ShareLinkCard";

vi.mock(import("../lib/telemetry"), async (original) => ({
  ...(await original()),
  track: vi.fn(),
  log: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(track).mockReset();
  vi.mocked(log).mockReset();
});

const url = "https://next-session.link/s/k3Qx9Lm2aB";
const message = `Help me find our next game night. Tap the days you can play, it takes 30 seconds: ${url}`;

function stubClipboard(writeText: (text: string) => Promise<void>) {
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
}

function stubLegacyCopy(succeeds: boolean) {
  const copied: string[] = [];
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: (command: string) => {
      const field = document.querySelector("textarea");
      if (command === "copy" && succeeds && field) {
        copied.push(field.value.slice(field.selectionStart, field.selectionEnd));
      }
      return succeeds;
    },
  });
  return copied;
}

describe("ShareLinkCard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, "execCommand");
  });

  it("shows the link without its scheme and copies the full URL", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

    render(<ShareLinkCard url={url} />);
    expect(screen.getByText("next-session.link/s/k3Qx9Lm2aB")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(url);
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Copy" }, { timeout: 2500 })).toBeTruthy();
  });

  it("forgets Copied when the link changes, keeping focus on Rotate", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: () => Promise.resolve() } });
    const { rerender } = render(<ShareLinkCard url={url} onRotate={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    await screen.findByRole("button", { name: "Copied" });
    const rotate = screen.getByRole("button", { name: "Rotate" });
    rotate.focus();

    rerender(<ShareLinkCard url="https://next-session.link/s/Zz9yX8wV7u" onRotate={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
    expect(document.activeElement).toBe(rotate);
  });

  it("copies the selected link when the clipboard API refuses, keeping focus on the button", async () => {
    stubClipboard(() =>
      Promise.reject(new DOMException("Write permission denied.", "NotAllowedError")),
    );
    const copied = stubLegacyCopy(true);
    render(<ShareLinkCard url={url} />);

    await userEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(await screen.findByRole("button", { name: "Copied" })).toBe(document.activeElement);
    expect(copied).toEqual([url]);
    expect(document.querySelector("textarea")).toBeNull();
    expect(screen.queryByText("Long-press the link to copy it.")).toBeNull();
  });

  it("copies the selected link when the browser has no clipboard API at all", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    const copied = stubLegacyCopy(true);
    render(<ShareLinkCard url={url} />);

    await userEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
    expect(copied).toEqual([url]);
  });

  it("falls back to a long-press hint when the browser refuses every way to copy", async () => {
    stubClipboard(() => Promise.reject(new Error("blocked")));
    stubLegacyCopy(false);
    render(<ShareLinkCard url={url} />);

    await userEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(await screen.findByText("Long-press the link to copy it.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("prefills the share message for WhatsApp, Telegram and Mail", () => {
    render(<ShareLinkCard url={url} />);
    expect(screen.getByText("Anyone with the link can answer. Keep it in the group.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Share via WhatsApp" })).toHaveProperty(
      "href",
      `https://wa.me/?text=${encodeURIComponent(message)}`,
    );
    expect(screen.getByRole("link", { name: "Share via Telegram" })).toHaveProperty(
      "href",
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent("Help me find our next game night. Tap the days you can play, it takes 30 seconds.")}`,
    );
    const mail = screen.getByRole("link", { name: "Share via Mail" });
    expect(mail).toHaveProperty(
      "href",
      `mailto:?subject=${encodeURIComponent("Our next game night")}&body=${encodeURIComponent(message)}`,
    );
    expect(mail).toHaveProperty("target", "");
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
  });

  it("offers the native share sheet only where the browser has one", async () => {
    const share = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { ...navigator, share });
    render(<ShareLinkCard url={url} />);
    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(share).toHaveBeenCalledWith({ text: message });
  });

  it.each(["Share via WhatsApp", "Share via Telegram", "Share via Mail", "Share"])(
    "draws %s as an icon, not a stand-in letter",
    (name) => {
      vi.stubGlobal("navigator", { ...navigator, share: () => Promise.resolve() });
      render(<ShareLinkCard url={url} />);
      const target = screen.getByRole(name === "Share" ? "button" : "link", { name });
      expect(target.textContent).toBe("");
      expect(target.querySelector("svg")).not.toBeNull();
    },
  );

  it("keeps the share targets but drops the hint when compact, and offers Rotate when asked", async () => {
    vi.stubGlobal("navigator", { ...navigator, share: () => Promise.resolve() });
    const onRotate = vi.fn();
    render(<ShareLinkCard url={url} compact onRotate={onRotate} />);
    expect(screen.getByRole("link", { name: "Share via WhatsApp" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Share via Telegram" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share" })).toBeTruthy();
    expect(screen.queryByText("Anyone with the link can answer. Keep it in the group.")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Rotate" }));
    expect(onRotate).toHaveBeenCalledOnce();
  });

  describe("telemetry", () => {
    it("tracks a copy through the clipboard once, with its surface", async () => {
      stubClipboard(() => Promise.resolve());
      render(<ShareLinkCard url={url} surface="landing" />);

      await userEvent.click(screen.getByRole("button", { name: "Copy" }));
      await screen.findByRole("button", { name: "Copied" });

      expect(track).toHaveBeenCalledOnce();
      expect(track).toHaveBeenCalledWith({
        name: "share_link_copied",
        surface: "landing",
        method: "clipboard",
      });
      expect(log).not.toHaveBeenCalled();
    });

    it("tracks and logs a copy through the selection when the clipboard refuses", async () => {
      stubClipboard(() =>
        Promise.reject(new DOMException("Write permission denied.", "NotAllowedError")),
      );
      stubLegacyCopy(true);
      render(<ShareLinkCard url={url} />);

      await userEvent.click(screen.getByRole("button", { name: "Copy" }));
      await screen.findByRole("button", { name: "Copied" });

      expect(track).toHaveBeenCalledOnce();
      expect(track).toHaveBeenCalledWith({
        name: "share_link_copied",
        surface: "rail",
        method: "fallback",
      });
      expect(log).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledWith("warn", "Copy fell back to the selection", {
        surface: "rail",
        reason: "NotAllowedError",
      });
    });

    it("tracks and logs a copy the browser refused every way", async () => {
      stubClipboard(() => Promise.reject(new Error("blocked")));
      stubLegacyCopy(false);
      render(<ShareLinkCard url={url} compact />);

      await userEvent.click(screen.getByRole("button", { name: "Copy" }));
      await screen.findByText("Long-press the link to copy it.");

      expect(track).toHaveBeenCalledOnce();
      expect(track).toHaveBeenCalledWith({
        name: "share_link_copied",
        surface: "compact",
        method: "failed",
      });
      expect(log).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledWith("error", "Copy failed", {
        surface: "compact",
        reason: "Error",
      });
    });

    it.each([
      ["Share via WhatsApp", "whatsapp"],
      ["Share via Telegram", "telegram"],
      ["Share via Mail", "mail"],
    ] as const)("tracks %s by its channel", async (label, channel) => {
      render(<ShareLinkCard url={url} surface="landing" />);
      const target = screen.getByRole("link", { name: label });
      target.addEventListener("click", (event) => event.preventDefault());

      await userEvent.click(target);

      expect(track).toHaveBeenCalledExactlyOnceWith({
        name: "share_link_shared",
        surface: "landing",
        channel,
      });
    });

    it("tracks the native share sheet only once it shared", async () => {
      let finish: (shared: boolean) => void = () => undefined;
      const share = vi.fn(
        () =>
          new Promise<void>((resolve, reject) => {
            finish = (shared) => (shared ? resolve() : reject(new DOMException("", "AbortError")));
          }),
      );
      vi.stubGlobal("navigator", { ...navigator, share });
      render(<ShareLinkCard url={url} />);

      await userEvent.click(screen.getByRole("button", { name: "Share" }));
      finish(false);
      await Promise.resolve();
      expect(track).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole("button", { name: "Share" }));
      finish(true);
      await vi.waitFor(() =>
        expect(track).toHaveBeenCalledExactlyOnceWith({
          name: "share_link_shared",
          surface: "rail",
          channel: "native",
        }),
      );
    });
  });
});
