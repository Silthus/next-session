// PROTOTYPE for #128, throwaway. Fake data only; nothing here talks to Convex or Geoapify.

export type Suggestion = { line1: string; line2: string };

export type UsualNight = {
  start: string;
  hours: number;
  timeZone: string;
  location: string;
};

export const groupName = "Tuesday Crew";

export const emptyNight: UsualNight = {
  start: "",
  hours: 4,
  timeZone: "Europe/Berlin",
  location: "",
};

export const filledNight: UsualNight = {
  start: "19:00",
  hours: 4,
  timeZone: "Europe/Berlin",
  location: "Alexanderplatz 1, 10178 Berlin, Germany",
};

const addresses: Suggestion[] = [
  { line1: "Alexanderplatz 1", line2: "10178 Berlin, Germany" },
  { line1: "Alexanderplatz", line2: "Mitte, 10178 Berlin, Germany" },
  { line1: "Alexanderstraße 7", line2: "10178 Berlin, Germany" },
  { line1: "Alexanderufer 2", line2: "10117 Berlin, Germany" },
  { line1: "Alexanderstraße 12", line2: "64283 Darmstadt, Germany" },
  { line1: "Marienplatz 1", line2: "80331 München, Germany" },
  { line1: "Marienstraße 4", line2: "10117 Berlin, Germany" },
  { line1: "Spielwarenmesse, Messezentrum 1", line2: "90471 Nürnberg, Germany" },
  { line1: "Rue de Rivoli 99", line2: "75001 Paris, France" },
  { line1: "Main Street 12", line2: "Dublin 4, Ireland" },
];

export function fakeGeoapify(query: string): Suggestion[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return addresses
    .filter((address) => {
      const text = `${address.line1} ${address.line2}`.toLowerCase();
      return words.every((word) => text.includes(word));
    })
    .slice(0, 5);
}

export function endTime(start: string, hours: number) {
  const [h = 0, m = 0] = start.split(":").map(Number);
  const minutes = (h * 60 + m + hours * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function zoneLabel(timeZone: string) {
  const city = timeZone.split("/").pop()?.replaceAll("_", " ") ?? timeZone;
  return `${city} time`;
}

export function timeLine(night: UsualNight) {
  if (!night.start) return "All day";
  return `${night.start}–${endTime(night.start, night.hours)}`;
}
