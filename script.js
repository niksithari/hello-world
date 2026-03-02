const state = {
  start: null,
  end: null,
  startMarker: null,
  endMarker: null,
  routeLayers: [],
};

const map = L.map('map').setView([37.7749, -122.4194], 5);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);

const routeCount = document.getElementById('routeCount');
const routeCountValue = document.getElementById('routeCountValue');
const resetBtn = document.getElementById('resetBtn');
const planBtn = document.getElementById('planBtn');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');

routeCount.addEventListener('input', () => {
  routeCountValue.textContent = routeCount.value;
});

map.on('click', (e) => {
  if (!state.start) {
    state.start = e.latlng;
    state.startMarker = L.marker(e.latlng, { title: 'Start' }).addTo(map).bindPopup('Start');
    state.startMarker.openPopup();
    status('Start point selected. Now choose destination.');
    return;
  }

  if (!state.end) {
    state.end = e.latlng;
    state.endMarker = L.marker(e.latlng, { title: 'Destination' })
      .addTo(map)
      .bindPopup('Destination');
    planBtn.disabled = false;
    status('Destination selected. Click "Plan routes".');
    return;
  }

  status('Both points are set. Use reset to choose again.');
});

resetBtn.addEventListener('click', resetPlanner);
planBtn.addEventListener('click', planRoutes);

function resetPlanner() {
  state.start = null;
  state.end = null;
  if (state.startMarker) map.removeLayer(state.startMarker);
  if (state.endMarker) map.removeLayer(state.endMarker);
  state.startMarker = null;
  state.endMarker = null;
  state.routeLayers.forEach((layer) => map.removeLayer(layer));
  state.routeLayers = [];
  planBtn.disabled = true;
  resultsEl.innerHTML = '';
  status('Choose start and end points.');
}

async function planRoutes() {
  if (!state.start || !state.end) return;

  status('Fetching weather and building route options...');
  resultsEl.innerHTML = '';
  state.routeLayers.forEach((layer) => map.removeLayer(layer));
  state.routeLayers = [];

  const routes = buildRouteAlternatives(state.start, state.end, Number(routeCount.value));

  try {
    const evaluated = [];
    for (const route of routes) {
      const weather = await sampleWindAlongRoute(route.points);
      const avgWind = weather.reduce((sum, item) => sum + item.windSpeed, 0) / weather.length;
      const maxWind = Math.max(...weather.map((item) => item.windSpeed));
      const score = route.distanceKm + avgWind * 3 + maxWind * 1.5;
      evaluated.push({ ...route, avgWind, maxWind, score });
    }

    evaluated.sort((a, b) => a.score - b.score);
    drawRoutes(evaluated);
    renderResults(evaluated);
    status('Done. Lower score is generally safer/faster with this simple heuristic.');
  } catch (error) {
    console.error(error);
    status('Could not fetch weather data. Please try another area or retry shortly.');
  }
}

function buildRouteAlternatives(start, end, count) {
  const routes = [];
  const centerLat = (start.lat + end.lat) / 2;
  const centerLng = (start.lng + end.lng) / 2;

  for (let i = 0; i < count; i += 1) {
    const offsetScale = (i - (count - 1) / 2) * 0.9;
    const control = {
      lat: centerLat + offsetScale,
      lng: centerLng - offsetScale,
    };

    const points = [];
    const steps = 14;
    for (let t = 0; t <= steps; t += 1) {
      const pct = t / steps;
      points.push(quadraticBezier(start, control, end, pct));
    }

    routes.push({
      id: i + 1,
      points,
      distanceKm: computeDistanceKm(points),
    });
  }

  return routes;
}

function quadraticBezier(p0, p1, p2, t) {
  const lat = (1 - t) ** 2 * p0.lat + 2 * (1 - t) * t * p1.lat + t ** 2 * p2.lat;
  const lng = (1 - t) ** 2 * p0.lng + 2 * (1 - t) * t * p1.lng + t ** 2 * p2.lng;
  return { lat, lng };
}

function computeDistanceKm(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineKm(points[i - 1], points[i]);
  }
  return total;
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

async function sampleWindAlongRoute(points) {
  const sampleStep = Math.max(1, Math.floor(points.length / 5));
  const samples = [];

  for (let i = 0; i < points.length; i += sampleStep) {
    const point = points[i];
    const windSpeed = await fetchWind(point.lat, point.lng);
    samples.push({ ...point, windSpeed });
  }

  return samples;
}

async function fetchWind(lat, lon) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lat.toFixed(3));
  url.searchParams.set('longitude', lon.toFixed(3));
  url.searchParams.set('current', 'wind_speed_10m');

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`weather request failed: ${res.status}`);
  }

  const data = await res.json();
  return data?.current?.wind_speed_10m ?? 0;
}

function drawRoutes(routes) {
  const colors = ['#1b7cff', '#00a67d', '#ff8b00', '#b400d6', '#d62323'];
  routes.forEach((route, idx) => {
    const layer = L.polyline(route.points, {
      color: colors[idx % colors.length],
      weight: idx === 0 ? 5 : 3,
      opacity: idx === 0 ? 0.95 : 0.7,
      dashArray: idx === 0 ? null : '8 6',
    }).addTo(map);
    layer.bindPopup(`Route ${route.id}<br/>Score: ${route.score.toFixed(1)}`);
    state.routeLayers.push(layer);
  });

  const group = L.featureGroup([...state.routeLayers, state.startMarker, state.endMarker]);
  map.fitBounds(group.getBounds().pad(0.18));
}

function renderResults(routes) {
  resultsEl.innerHTML = routes
    .map(
      (route, idx) => `
      <li>
        <strong>${idx === 0 ? 'Recommended' : `Alternative ${idx}`}: Route ${route.id}</strong><br>
        Distance: ${route.distanceKm.toFixed(1)} km<br>
        Avg wind: ${route.avgWind.toFixed(1)} km/h<br>
        Max wind: ${route.maxWind.toFixed(1)} km/h<br>
        Score: ${route.score.toFixed(1)}
      </li>`
    )
    .join('');
}

function status(message) {
  statusEl.textContent = message;
}
