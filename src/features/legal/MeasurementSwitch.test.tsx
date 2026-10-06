import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MeasurementSwitch, type MeasurementControls } from "./MeasurementSwitch";

function browserMeasurement({ available = true, on = true } = {}) {
  let isOn = on;
  const controls: MeasurementControls = {
    available: () => available,
    isOn: () => isOn,
    turnOff: vi.fn(() => {
      isOn = false;
    }),
    turnOn: vi.fn(() => {
      isOn = true;
    }),
  };
  return controls;
}

describe("MeasurementSwitch", () => {
  it("shows nothing in a build without usage measurement", () => {
    const { container } = render(
      <MeasurementSwitch controls={browserMeasurement({ available: false })} />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("turns usage measurement off in this browser, and back on", async () => {
    const controls = browserMeasurement();
    render(<MeasurementSwitch controls={controls} />);
    expect(screen.getByText("Usage measurement is on in this browser.")).toBeTruthy();

    await userEvent.click(
      screen.getByRole("button", { name: "Turn off usage measurement in this browser" }),
    );

    expect(controls.turnOff).toHaveBeenCalledOnce();
    expect(screen.getByText("Usage measurement is off in this browser.")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Turn it back on" }));

    expect(controls.turnOn).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: "Turn off usage measurement in this browser" }),
    ).toBeTruthy();
  });

  it("remembers that this browser turned it off", () => {
    render(<MeasurementSwitch controls={browserMeasurement({ on: false })} />);

    expect(screen.getByRole("button", { name: "Turn it back on" })).toBeTruthy();
  });
});
