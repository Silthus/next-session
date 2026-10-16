# Free address autocomplete for the Group location (ticket #123)

Researched 2026-10-16 for map [#120](https://github.com/Silthus/next-session/issues/120). This branch is never merged.

## Answer

**Use Geoapify's Free plan, called from the browser with an origin-restricted API key, and keep the field a plain text input that works without it.** Photon's public server is the free runner-up but its own maintainers say not to build a product on it. Nominatim forbids this use. Google and Mapbox both need terms we do not want (card on file; Google logo; Mapbox "temporary" results that may not be stored).

What a Group location needs is small: a string the GM picks or types, shown in a calendar entry. We do not need coordinates, a map, or stored provider data. That makes the storage and map-display clauses of the big providers the deciding factor, more than quality.

## Comparison

| | Free tier | Card needed | Past the free tier | Autocomplete allowed | Attribution | Storing the picked address |
|---|---|---|---|---|---|---|
| **Geoapify** | 3,000 credits/day, 5 req/s; 1 autocomplete request = 1 credit; commercial use allowed within limits ([pricing](https://www.geoapify.com/pricing), [details](https://www.geoapify.com/pricing-details)) | No ("No credit card required") | "Soft" limits: Geoapify emails, may block if ignored; no automatic charge | Yes, it is a product ([docs](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/)) | Required on Free: link to Geoapify and OpenStreetMap ([terms](https://www.geoapify.com/terms-and-conditions)) | Terms and pricing pages are silent |
| **Photon (komoot public)** | No stated number; "reasonable limit" ([README](https://github.com/komoot/photon)) | No key, no account | "Throttled or completely banned"; no availability guarantee | Search-as-you-type is the product's headline feature; the demo's rules never forbid or allow it ([photon.komoot.io](https://photon.komoot.io/)) | No requirement stated; OSM credit is expected under the ODbL | Silent |
| **Nominatim (OSMF public)** | 1 req/s absolute maximum, per app | No | Ban | **Forbidden**: autocomplete is "strictly forbidden and will get you banned"; "you must not implement such a service on the client side" ([policy](https://operations.osmfoundation.org/policies/nominatim/)) | Required | Allowed, cache on your side |
| **Google Places (New)** | Autocomplete Requests: 10,000 free/month, then $2.83 per 1,000 ([pricing](https://developers.google.com/maps/billing-and-pricing/pricing)); Session Usage SKU shows no charge | **Yes**: billing must be enabled on the project ([usage and billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)) | Billed per event | Yes | Google Maps logo (or the text "Google Maps") next to Places content shown without a Google map ([policies](https://developers.google.com/maps/documentation/places/web-service/policies)) | Place IDs may be stored indefinitely ([place IDs](https://developers.google.com/maps/documentation/places/web-service/place-id)); storing other content is restricted (see gaps) |
| **Mapbox** | Search Box: first 2,500 sessions/month ([pricing](https://www.mapbox.com/pricing)) | Pricing page silent; "Permanent" geocoding needs a card or enterprise contract | Billed per session | Yes | Response carries an `attribution` string | **No**: temporary results "are not allowed to be cached", and responses may only be used "in conjunction with a Mapbox map" ([Geocoding docs](https://docs.mapbox.com/api/search/geocoding/)); Search Box says storing needs sales ([Search Box docs](https://docs.mapbox.com/api/search/search-box/)) |
| **LocationIQ** | 5,000 requests/day, 2 req/s, 60/min ([pricing](https://locationiq.com/pricing)) | Pricing page silent | Not stated | Probably (FAQ lists Autocomplete among metered calls; not confirmed) | Required link for commercial use | Pricing FAQ: 48-hour caching on free, and "You can store response data forever" (contradictory on one page) |
| **OpenCage** | Trial: 2,500/day, "testing only" ([pricing](https://opencagedata.com/pricing)) | No | Pay to use in production | Not in the geocoding API; "Geosearch" is a separate paid product, cities and regions only, no street addresses | Not stated | Permanent storage allowed |
| **MapTiler** | 1,000 search sessions/month, "No credit card needed" ([pricing](https://www.maptiler.com/cloud/pricing/)) | No | Pauses until next month | Yes | MapTiler logo on the map | Not stated |

Not evaluated: HERE, TomTom, Geocode Earth, Stadia. The HERE and Geocode Earth pricing pages did not load; the TomTom page redirected and was not followed. They need a card or a trial in the usual way, but I have no primary source, so I leave them out.

## Per-provider findings

### Geoapify

- **Free plan.** 3,000 credits/day, up to 5 requests/s, "best effort" support, no card ([pricing](https://www.geoapify.com/pricing)). One Address Autocomplete request costs one credit ([pricing details](https://www.geoapify.com/pricing-details)).
- **Past the limit.** The limits are "soft": Geoapify contacts you to upgrade and "may block the account if you ignore those emails." No automatic charge, because there is no card on file.
- **Production use.** The terms say commercial use of Free is allowed "in the development and, with some limitations, in the production phase" and do not name the limitations ([terms](https://www.geoapify.com/terms-and-conditions)). The pricing page says commercial and production use is fine within the limits with attribution. Treat this as a question to put to Geoapify only if volume ever approaches the cap.
- **Attribution.** Mandatory on Free: OpenStreetMap, and a link to Geoapify (`Powered by Geoapify`) near the data ([terms](https://www.geoapify.com/terms-and-conditions), [pricing](https://www.geoapify.com/pricing)).
- **Caching and storing.** Terms, pricing and the autocomplete page are silent. Storing the one picked string in our own database is the ordinary use of a geocoder and nothing there forbids it; the silence is a gap, not a permission.
- **Key in the browser.** The key can be locked to HTTP referrers, origins and CORS ([docs](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/)). The docs ship JS and React autocomplete packages; they never say outright that browser use is allowed.
- **Parameters useful for us.** `text` (partial address or place name), `lang`, `filter=countrycode:de,...` (hard), `bias=proximity:lon,lat` (soft), `limit`, `type`. Result field `formatted` is a ready display string; `housenumber`, `street`, `postcode`, `city` come separately.
- **Privacy.** Per its [privacy policy](https://www.geoapify.com/privacy-policy): stores request body, headers, IP and timestamp for each API call; keeps successful requests "no longer than 24 hours"; EU data centers on Hetzner; Cloudflare and Bunny CDN (for the .eu API) in the path; DPAs exist with its providers; a customer DPA can be requested by email and "may be subject to additional costs". It does not say whether Geoapify is controller or processor for API data, does not name the data center country, and gives no retention for failed requests. Operator is registered in Cyprus (EU), law of Cyprus applies.
- **Availability.** "As is"; the 99.5% SLA is for paid plans only ([terms](https://www.geoapify.com/terms-and-conditions)).

### Photon (komoot public API)

- **Terms.** The README: "You are welcome to use the API for your project as long as the number of requests stay in a reasonable limit. Extensive usage will be throttled or completely banned." No numbers, no guarantee of availability, changes without notice ([README](https://github.com/komoot/photon)). No attribution, privacy or logging statement at [photon.komoot.io](https://photon.komoot.io/).
- **Maintainer.** In [Discussion #598](https://github.com/komoot/photon/discussions/598): it is "a demo site for the Photon software"; "it is not a good idea to send your business clients over there"; "if you have to ask about the usage limits, you are likely better off running your own instance"; "Neither Komoot nor the maintainers of Photon provide a commercial API."
- **Browser use.** Probed on 2026-10-16: `GET https://photon.komoot.io/api` answers with `Access-Control-Allow-Origin: *`, so the browser can call it directly.
- **Languages.** `lang` accepts only `default`, `de`, `en`, `fr`; others return HTTP 400 (probed 2026-10-16; the [API doc](https://github.com/komoot/photon/blob/master/docs/api-v1.md) does not list them).
- **Bias and filters.** `lat`/`lon`, `zoom`, `location_bias_scale`, `bbox`, `layer`, `countrycode`, `osm_tag` ([API doc](https://github.com/komoot/photon/blob/master/docs/api-v1.md)).
- **Licence.** Data is OpenStreetMap, under the ODbL. The OSMF's [attribution guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines) say a set of geocoding results does not need the credit attached unless it forms a derivative database; storing the data as a database does. One picked string per Group is not a database, but the guideline defers to a separate Geocoding guideline that I did not read.
- **Verdict.** Works today, free, no key, no card. It has no contract at all, and the people who run it advise against depending on it. Fine as a fallback to Geoapify; not as the one provider.

### Nominatim

Ruled out. The public instance forbids autocomplete and client-side use of search-as-you-type outright, caps the whole app at 1 request/s, and requires an identifying User-Agent or Referer ([policy](https://operations.osmfoundation.org/policies/nominatim/)). Self-hosting would lift this but is out of scope for a free-tier pet project.

### Google Places Autocomplete (New)

- **Free tier.** Autocomplete Requests: 10,000 free events/month (Essentials), then $2.83 per 1,000; Autocomplete Session Usage is listed with no charge ([pricing](https://developers.google.com/maps/billing-and-pricing/pricing)). Volume is totalled per billing account.
- **Card.** Billing must be enabled on the project and an API key or OAuth token sent with every request ([usage and billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)). The page does not say what happens at the cap if a card is on file but no budget alert is set; the pricing page implies it is charged.
- **Display.** Without a Google map, show the Google Maps logo (or the text "Google Maps") with the content ([policies](https://developers.google.com/maps/documentation/places/web-service/policies)).
- **Storage.** Place IDs: "store place ID values indefinitely". The policy page says an address a user picks through Autocomplete is outside the content restrictions only for that user's transaction, and that the exception does not cover the list of suggestions. The governing clause is Section 3.2.3(b) of the Maps Platform Terms; I could not retrieve its text, so I make no claim about whether storing the picked address in our database is allowed.
- **Verdict.** Best-known quality, but needs a card, a logo in the Group form, and unclear storage of the address text we would keep. Does not fit "free, no card, tiny PR".

### Mapbox

Search Box gives 2,500 free sessions/month; sessions end after one `/retrieve`, 180 seconds idle, or 50 `/suggest` calls ([Search Box docs](https://docs.mapbox.com/api/search/search-box/)). The Geocoding docs say temporary results "are not allowed to be cached" and that Geocoding responses may only be used "in conjunction with a Mapbox map"; permanent results need a card on file and have no free tier ([Geocoding docs](https://docs.mapbox.com/api/search/geocoding/), [pricing](https://www.mapbox.com/pricing)). Storing a picked address in Convex and showing it in a form with no Mapbox map is outside those terms. Ruled out. I did not read the Product Terms PDF.

### Others

- **LocationIQ** is the closest Geoapify alternative: 5,000 requests/day, 2 req/s, attribution required, response storage allowed ([pricing](https://locationiq.com/pricing)). I found no primary source for hosting location, retention or a DPA, and the pricing page says nothing about a card. Keep it as the second paid-free alternative if Geoapify fails the quality test below.
- **OpenCage** has no free autocomplete (Geosearch is paid, cities only) and its trial is "testing only" ([pricing](https://opencagedata.com/pricing)).
- **MapTiler** Free is sold for "testing, PoC, prototyping, personal, or non-commercial use" and its commercial-use row did not render ([pricing](https://www.maptiler.com/cloud/pricing/)).

## GDPR and privacy

Applies to whichever provider is chosen.

- **What leaves the browser.** Every keystroke request carries the typed text (which may be a home address: "Max's place" is a person's place) and the visitor's IP address, to the provider and, for Geoapify, through Cloudflare and Bunny CDN. A debounce and a minimum length cut how many requests go out; they do not change what is in them.
- **Convex proxy.** Not needed and not forbidden by anything I read. Only Geoapify's and Photon's own terms were checked, and neither says anything about proxying. A Convex action would replace the visitor's IP with Convex's egress IP at the provider, but the typed text still goes, a Convex function would run per keystroke against the Free plan's function-call cap (ADR-0001 names 1M calls/month), and for Photon a single shared egress IP is more likely to be throttled than many browsers. Convex's docs do not say whether action IPs are fixed or shared ([regions](https://docs.convex.dev/production/regions)). Recommendation: no proxy.
- **Privacy Policy.** Needs a new row and a version bump, like the other provider rows: *Text typed into the Group location field and the visitor's IP address, sent to Geoapify (EU data centers, via Cloudflare/Bunny CDN) to suggest addresses; sent only when typing in that field; legitimate interest, Art. 6(1)(f)* (or contract, 6(1)(b), if the GM treats the suggestion as part of the service they asked for; this is a call for Michael and the lawyer). Name Geoapify as a recipient, state the 24-hour retention it publishes, and say the field works without it.
- **Open items for a lawyer or for Geoapify.** Controller/processor role, whether a DPA is needed and what it costs, transfers via Cloudflare and Bunny CDN, retention of failed requests. Geoapify's privacy page is silent on all four.
- **For Photon, there is nothing to cite.** The README and site say nothing about logging or privacy, so the Privacy Policy would have to name a recipient whose handling we cannot describe.
- **For Google,** the data goes to a US provider; the Cloud Data Processing Addendum would need review. I did not retrieve it.
- **Mapbox's** [privacy FAQ](https://www.mapbox.com/legal/tos) retains IP addresses for 30 days (from the page's FAQ).

## Quality

Primary sources describe features, not accuracy, so there is no provider-published German-address benchmark to cite. What I could test myself is Photon, live, on 2026-10-16 (`lang=de`, `limit=4`):

| Query | Result |
|---|---|
| `Hauptstraße 5 Berlin` | Four house-number hits in different Berlin postcodes (13127, 13158, 13159, 13591): correct and ambiguous, because Berlin has many Hauptstraßen |
| `Marienplatz 1 München` | Four hits at the right address (postcode 80331), including the building, a café and a kiosk |
| `Rue de Rivoli 10 Paris` | Right house number and postcode 75004, then an unrelated shop |
| `Bahnhofstr 12 Köln` | Two house hits, abbreviation `Bahnhofstr` resolved |
| `Max's place` | Four places named "Max's Place" in the US and Canada, none in Germany |

Two conclusions that hold for any provider: German and French house-level addresses resolve well from OpenStreetMap data (Geoapify uses OSM as well, per its attribution terms), and **a free-text name like "Max's place" cannot be resolved by any geocoder**, because it is a private person's place. The form must therefore offer the typed text itself as an option ("Use 'Max's place'") and never force a pick. I did not test Geoapify (it needs an API key I do not have), nor Google or Mapbox, so I make no quality claim about them.

## Fallback when the provider is down

Plain free text, by construction: the location field is a normal text input whose value is a string. Autocomplete only proposes strings.

- Fire nothing until the GM focuses the field and types at least three characters; debounce.
- Timeout, network error, HTTP 429, 401 or 5xx: show no suggestions and no error; the typed text stays valid. After the first failure in a visit, stop calling.
- Store only the string. No coordinates, no provider IDs, so no provider is ever a dependency of reading a Group or building a calendar entry, and switching provider later costs nothing.
- A kill switch (env var on the build) that removes the provider call entirely makes the Privacy Policy row conditional.

## Sizing

Free plan is 3,000 credits/day. Assuming a debounce of about 300 ms and a few requests per typed address (my assumption, not a measured figure), that is several hundred address entries per day. A Group sets its location rarely.

## Questions for the decision tickets

1. Is Geoapify's required attribution ("Powered by Geoapify" plus OpenStreetMap) acceptable in the Group form, and where does it sit?
2. Legal basis for the new Privacy Policy row, 6(1)(b) or 6(1)(f), and whether the lawyer wants a Geoapify DPA before launch (it may cost money).
3. Key in the browser (origin-restricted) as recommended, or a Convex proxy? The cost of the proxy is function calls on the Free plan and a more complex PR; its benefit is hiding the visitor's IP.
4. Does the location need coordinates for anything (maps link, travel time)? The map's Out of scope says calendar apps compute travel time from the address, so the recommendation stores the string only.
5. Run a quick Geoapify quality check (a dozen German and European addresses) before building, with a key. If it fails, LocationIQ is the next candidate.

## Gaps

- Google Maps Platform Terms 3.2.3(b) and the Maps Service Specific Terms text were not retrievable; the Google storage conclusions rest on the Places policy page and the Place ID page.
- Mapbox Product Terms PDF not read; Mapbox conclusions rest on its API docs and pricing page.
- Geoapify: no stated caching or storage rule; no statement of its GDPR role or data-center country; the "limitations" on production use are not spelled out.
- Photon: no privacy or logging statement; no numeric limit.
- HERE, TomTom, Geocode Earth, Stadia not assessed.
- Page contents were extracted with a summarising fetch tool, so quotes are as the tool returned them; the pricing figures for Google and Geoapify and the Nominatim, Photon and Mapbox quotes should be spot-checked against the live pages before they go into a spec.
