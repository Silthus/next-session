import { useState } from "react";
import {
  measurementAvailable,
  measurementIsOn,
  turnMeasurementOff,
  turnMeasurementOn,
} from "../../lib/telemetry";
import { Button } from "../../ui/Button";

export type MeasurementControls = {
  available: () => boolean;
  isOn: () => boolean;
  turnOff: () => void;
  turnOn: () => void;
};

const thisBrowser: MeasurementControls = {
  available: () => measurementAvailable(),
  isOn: () => measurementIsOn(),
  turnOff: () => turnMeasurementOff(),
  turnOn: () => void turnMeasurementOn(),
};

export function MeasurementSwitch({ controls = thisBrowser }: { controls?: MeasurementControls }) {
  const [on, setOn] = useState(controls.isOn);
  if (!controls.available()) return null;

  function toggle() {
    if (on) controls.turnOff();
    else controls.turnOn();
    setOn(!on);
  }

  return (
    <section
      aria-labelledby="usage-measurement"
      className="mt-8 flex flex-col items-start gap-3 rounded-lg border border-line p-4"
    >
      <h2 id="usage-measurement" className="font-display text-xl font-bold">
        Usage measurement
      </h2>
      <p className="leading-relaxed text-ink-2">
        Usage measurement is {on ? "on" : "off"} in this browser.
      </p>
      <Button variant="secondary" onClick={toggle}>
        {on ? "Turn off usage measurement in this browser" : "Turn it back on"}
      </Button>
    </section>
  );
}
