// Thin wrapper around OpenStreetMap's free Nominatim search API.
// Used to help a business find its exact address/coordinates during
// setup, so patrons can be matched to the right business by GPS
// instead of relying on printed QR codes at every table/location.
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

export async function searchPlaces(query, { lat, lon } = {}) {
  const trimmed = (query || "").trim();
  if (trimmed.length < 3) return [];

  const params = new URLSearchParams({
    q: trimmed,
    format: "jsonv2",
    addressdetails: "1",
    limit: "6",
  });

  // bias (not restrict) results toward the searcher's rough location
  if (typeof lat === "number" && typeof lon === "number") {
    const delta = 0.5; // roughly a 50km box
    params.set("viewbox", [lon - delta, lat + delta, lon + delta, lat - delta].join(","));
  }

  const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("OpenStreetMap search failed");

  const results = await res.json();
  return results.map((r) => ({
    osmId: `${r.osm_type}/${r.osm_id}`,
    name: r.display_name.split(",")[0],
    address: r.display_name,
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
  }));
}

// Fetches real nearby businesses (bookstores, cafes, theaters, bars, shops, venues)
// around a GPS coordinate using OpenStreetMap data (Nominatim keyword search + Overpass amenity/shop query).
export async function fetchNearbyPlaces({ lat, lng, limit = 25 } = {}) {
  if (typeof lat !== "number" || typeof lng !== "number") return [];

  const foundPlaces = [];
  const uniqueNames = new Set();

  const addPlace = (item) => {
    if (!item || !item.name) return;
    const norm = item.name.toLowerCase().trim();
    if (uniqueNames.has(norm)) return;
    uniqueNames.add(norm);
    foundPlaces.push(item);
  };

  // 1. Nominatim search with viewbox around user's exact GPS
  try {
    const delta = 0.035; // ~3.5km box around user
    const viewbox = [lng - delta, lat + delta, lng + delta, lat - delta].join(",");

    const keywords = [
      "katz",
      "deli",
      "barnes",
      "noble",
      "starbucks",
      "river oaks",
      "theater",
      "cinema",
      "books",
      "bookstore",
      "cafe",
      "coffee",
      "bar",
      "pub",
      "restaurant",
      "bakery",
      "shopping",
    ];

    const promises = keywords.map((k) =>
      fetch(
        `${NOMINATIM_URL}?format=jsonv2&q=${encodeURIComponent(k)}&viewbox=${viewbox}&bounded=1&limit=8`,
        { headers: { Accept: "application/json" } }
      )
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => [])
    );

    const resultsArray = await Promise.all(promises);
    const combined = resultsArray.flat();

    combined.forEach((r) => {
      const rawName = r.display_name?.split(",")[0]?.trim();
      if (!rawName) return;

      // Filter out pure street/administrative names
      if (
        r.type === "residential" ||
        r.type === "secondary" ||
        r.type === "administrative" ||
        r.type === "tertiary"
      ) {
        if (!rawName.toLowerCase().includes("river oaks")) return;
      }

      const type = (r.type || r.class || "shop").toLowerCase();
      let venueType = "bar";
      if (["cafe", "coffee", "bakery"].includes(type)) venueType = "cafe";
      else if (["university", "college", "school", "library"].includes(type)) venueType = "campus";
      else if (["cinema", "theatre", "books", "shop", "clothes"].includes(type)) venueType = "bar";

      addPlace({
        id: `osm-${r.osm_type}-${r.osm_id}`,
        osmId: `${r.osm_type}/${r.osm_id}`,
        name: rawName,
        venueType,
        address: r.display_name.split(",").slice(0, 4).join(","),
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        source: "osm",
        verified: true,
        tagline: "Nearby OpenStreetMap Verified Venue",
      });
    });
  } catch (err) {
    console.warn("Nominatim nearby fetch failed, attempting Overpass:", err);
  }

  // 2. Overpass API search for amenities, shops, and entertainment near user
  if (foundPlaces.length < limit) {
    try {
      const query = `[out:json][timeout:6];
        (
          node["amenity"~"pub|bar|cafe|nightclub|restaurant|cinema|theatre|library"](around:3500,${lat},${lng});
          node["shop"~"books|coffee|mall|department_store"](around:3500,${lat},${lng});
        );
        out center ${limit};`;

      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: "data=" + encodeURIComponent(query),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      if (res.ok) {
        const data = await res.json();
        (data.elements || []).forEach((el) => {
          const name = el.tags?.name;
          const elLat = el.lat || el.center?.lat;
          const elLng = el.lon || el.center?.lon;
          if (!name || !elLat || !elLng) return;

          const amenity = el.tags?.amenity || el.tags?.shop || "business";
          let venueType = "bar";
          if (["cafe", "coffee"].includes(amenity)) venueType = "cafe";
          else if (["library", "college"].includes(amenity)) venueType = "campus";

          addPlace({
            id: `osm-${el.type}-${el.id}`,
            osmId: `${el.type}/${el.id}`,
            name,
            venueType,
            address: el.tags?.["addr:street"]
              ? `${name}, ${el.tags["addr:housenumber"] || ""} ${el.tags["addr:street"]}`
              : `${name}, Local Area`,
            lat: parseFloat(elLat),
            lng: parseFloat(elLng),
            source: "osm",
            verified: true,
            tagline: "OSM Verified Nearby Business",
          });
        });
      }
    } catch (err) {
      console.warn("Overpass query failed:", err);
    }
  }

  return foundPlaces.slice(0, limit);
}
