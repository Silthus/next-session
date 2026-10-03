import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Dot } from "./Dot";

describe("Dot", () => {
  it("names the answer it stands for", () => {
    render(<Dot answer="free" />);
    render(<Dot answer={null} />);
    expect(screen.getByLabelText("free")).toBeTruthy();
    expect(screen.getByLabelText("unanswered")).toBeTruthy();
  });
});
