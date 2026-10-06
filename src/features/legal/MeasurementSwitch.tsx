import { useState } from "react";
import {
  measurementAvailable,
  measurementIsOn,
  turnMeasurementOff,
  turnMeasurementOn,
} from "../../lib/telemetry";
import { Button } from "../../ui/Button";

export function MeasurementSwitch() {
  const [on, setOn] = useState(() => measurementIsOn());
  if (!measurementAvailable()) return null;

  function toggle() {
    if (on) turnMeasurementOff();
    else void turnMeasurementOn();
    setOn(measurementIsOn());
  }

  return (
    <section
      aria-labelledby="usage-measurement"
      className="mt-8 flex flex-col items-start gap-3 rounded-lg border border-line p-4"
    >
      <h2 id="usage-measurement" className="font-display text-xl font-bold">
        Usage measurement
      </h2>
      <p role="status" className="leading-relaxed text-ink-2">
        Usage measurement is {on ? "on" : "off"} in this browser.
      </p>
      <Button variant="secondary" className="h-auto! min-h-10 py-2 text-balance" onClick={toggle}>
        {on ? "Turn off usage measurement in this browser" : "Turn it back on"}
      </Button>
    </section>
  );
}
