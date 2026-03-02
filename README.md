# Weather Routing Planner Prototype

A lightweight web prototype for planning route alternatives and comparing wind conditions along each route.

## Features
- Interactive map (Leaflet + OpenStreetMap)
- Click-to-set origin and destination
- Generates multiple curved route alternatives
- Pulls live wind speed from Open-Meteo for sampled route points
- Scores routes using distance + wind heuristic to recommend a route

## Run locally
Because this app uses `fetch`, run it from a local web server:

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

## Next backend step ideas
- Move routing/weather scoring logic to a backend service (Node/Java)
- Store vessel profiles and constraints (max wind/wave limits)
- Add departure-time optimization and forecast timelines
