import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { downloadGroupCalendar, serveAccountFeed } from "./calendarFiles";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({ pathPrefix: "/cal/s/", method: "GET", handler: downloadGroupCalendar });
http.route({ pathPrefix: "/cal/a/", method: "GET", handler: serveAccountFeed });

export default http;
