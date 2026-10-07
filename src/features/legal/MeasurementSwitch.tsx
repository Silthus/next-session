import { useState } from "react";
import {
  measurementAvailable,
  measurementIsOn,
  turnMeasurementOff,
  turnMeasurementOn,
} from "../../lib/telemetry";
import { Button } from "../../ui/Button";

type MeasurementState = "on" | "off" | "offForThisVisit";

const statusLines: Record<MeasurementState, string> = {
  on: "Usage measurement is on in this browser.",
  off: "Usage measurement is off in this browser.",
  offForThisVisit:
    "Usage measurement is off for this visit. This browser doesn't let Next Session remember the choice.",
};

export function MeasurementSwitch() {
  const [state, setState] = useState<MeasurementState>(() => (measurementIsOn() ? "on" : "off"));
  if (!measurementAvailable()) return null;

  function toggle() {
    if (state === "on") {
      setState(turnMeasurementOff().remembered ? "off" : "offForThisVisit");
    } else {
      void turnMeasurementOn();
      setState("on");
    }
  }

  return (
    <section
      aria-labelledby="usage-measurement"
      className="mt-8 flex flex-col items-start gap-3 rounded-xl border border-line p-4"
    >
      <h2 id="usage-measurement" className="font-display text-xl font-semibold">
        Usage measurement
      </h2>
      <p role="status" className="leading-relaxed text-ink-2">
        {statusLines[state]}
      </p>
      <Button variant="secondary" className="h-auto! min-h-10 py-2 text-balance" onClick={toggle}>
        {state === "on" ? "Turn off usage measurement in this browser" : "Turn it back on"}
      </Button>
    </section>
  );
}
