export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong";

export const pressable = `${focusRing} transition-[background-color,color,border-color,transform,opacity,filter] duration-150 ease-(--ease-snap) active:scale-[0.98]`;

export const hoverRow = `${pressable} hover:bg-surface-hover`;
