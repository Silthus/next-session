import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { downloadGroupCalendar } from "./calendarFiles";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({ pathPrefix: "/cal/s/", method: "GET", handler: downloadGroupCalendar });

export default http;
