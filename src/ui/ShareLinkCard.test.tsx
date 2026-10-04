import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareLinkCard } from "./ShareLinkCard";

const url = "https://next-session.link/s/k3Qx9Lm2aB";
const message = `Help me find our next game night. Tap the days you can play, it takes 30 seconds: ${url}`;

describe("ShareLinkCard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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

  it("falls back to a long-press hint when the clipboard is blocked", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: () => Promise.reject(new Error("blocked")) },
    });
    render(<ShareLinkCard url={url} />);
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByText("Long-press the link to copy it.")).toBeTruthy();
  });

  it("shows the long-press hint when the browser has no clipboard API at all", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    render(<ShareLinkCard url={url} />);
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByText("Long-press the link to copy it.")).toBeTruthy();
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

  it("hides the share row when compact and offers Rotate when asked", async () => {
    const onRotate = vi.fn();
    render(<ShareLinkCard url={url} compact onRotate={onRotate} />);
    expect(screen.queryByRole("link", { name: "Share via WhatsApp" })).toBeNull();
    expect(screen.queryByText("Anyone with the link can answer. Keep it in the group.")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Rotate" }));
    expect(onRotate).toHaveBeenCalledOnce();
  });
});
