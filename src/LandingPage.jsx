import { useState } from "react";
import { MapPin, Navigation, ShieldCheck, Zap, RefreshCw } from "lucide-react";

// ---------------------------------------------------------------
// Landing page: marketing hero + business directory
// Routes: / -> LandingPage, /app -> patron signal screen, /staff -> staff view
// ---------------------------------------------------------------

const BUSINESSES = [
  { name: "Barnes & Noble (West Gray)", category: "Specialty Store / Retail", address: "2030 West Gray St, River Oaks Shopping Center, Houston, TX 77019", service: "Bookstore & Cafe Safety Monitoring", lat: 29.7518, lng: -95.4205, verified: true },
  { name: "Common Bond Bakery & Cafe", category: "Coffee Shop / Café", address: "1706 Westheimer Rd, Houston, TX 77006", service: "Cafe Floor & Service Staff", lat: 29.7436, lng: -95.4048, verified: true },
  { name: "Harbor Grocery Market", category: "Specialty Store / Retail", address: "3201 Montrose Blvd, Houston, TX 77006", service: "Grocery Store Safety & Service", lat: 29.7321, lng: -95.3895, verified: true },
  { name: "Katz's (Houston Heights)", category: "Coffee Shop / Café", address: "2200 North Shepherd Dr, Houston, TX 77008", service: "Restaurant Staff Response", lat: 29.7852, lng: -95.4011, verified: true },
  { name: "Katz's (Montrose)", category: "Coffee Shop / Café", address: "616 Westheimer Rd, Houston, TX 77006", service: "Restaurant Staff Response", lat: 29.7458, lng: -95.3901, verified: true },
  { name: "Lotus Gift & Home", category: "Specialty Store / Retail", address: "1461 Heights Blvd, Houston, TX 77008", service: "Retail Floor & Checkout Monitoring", lat: 29.7834, lng: -95.3978, verified: true },
  { name: "MD Anderson Library", category: "University of Houston", address: "4333 University Dr, Houston, TX", service: "Campus Safety & RA Dispatch", lat: 29.7212, lng: -95.3483, verified: true },
  { name: "Midtown Bar and Grill", category: "Bar / Nightlife", address: "415 West Gray St, Houston, TX 77019", service: "Active Security & Bar Staff Response", lat: 29.7532, lng: -95.3898, verified: true },
  { name: "Reeve's Bookstore", category: "Specialty Store / Retail", address: "2420 Westheimer Rd, Houston, TX 77098", service: "Bookstore Customer Support", lat: 29.7421, lng: -95.4125, verified: true },
  { name: "River Oaks Theater", category: "Bar / Nightlife", address: "2009 West Gray St, River Oaks Shopping Center, Houston, TX 77019", service: "Cinema Staff & Security Desk", lat: 29.7515, lng: -95.4198, verified: true },
  { name: "Starbucks (River Oaks)", category: "Coffee Shop / Café", address: "1971 West Gray St, Houston, TX 77019", service: "Barista & Floor Staff Monitoring", lat: 29.7512, lng: -95.4185, verified: true },
  { name: "Student Center South", category: "University of Houston", address: "4465 University Dr, Houston, TX", service: "24/7 Security Desk & Escort Service", lat: 29.7208, lng: -95.3421, verified: true },
  { name: "The Copper Owl Lounge", category: "Bar / Nightlife", address: "4800 Calhoun Rd, Houston, TX", service: "Active Security & Bar Staff Response", lat: 29.7195, lng: -95.3389, verified: true },
  { name: "Urban Sporting Goods", category: "Specialty Store / Retail", address: "5400 Memorial Dr, Houston, TX 77007", service: "Department & Sporting Goods Response", lat: 29.7642, lng: -95.4521, verified: true },
  { name: "Vine & Thread Boutique", category: "Specialty Store / Retail", address: "1801 Westheimer Rd, Houston, TX 77098", service: "Boutique Floor & Checkout Monitoring", lat: 29.7432, lng: -95.4062, verified: true },
];

function distanceMiles(lat1, lng1, lat2, lng2) {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDist(mi) {
  if (mi < 0.1) return "< 0.1 mi away";
  return `${mi.toFixed(1)} mi away`;
}

export default function LandingPage() {
  const [userLoc, setUserLoc] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [locError, setLocError] = useState(false);
  const [locating, setLocating] = useState(false);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocError(true);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setAccuracy(Math.round(pos.coords.accuracy));
        setLocError(false);
        setLocating(false);
      },
      () => {
        setLocError(true);
        setLocating(false);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const sorted = [...BUSINESSES]
    .map((b) => ({
      ...b,
      dist: userLoc ? distanceMiles(userLoc.lat, userLoc.lng, b.lat, b.lng) : null,
    }))
    .sort((a, b) => (a.dist == null ? 1 : b.dist == null ? -1 : a.dist - b.dist));

  const proximityMatch = userLoc && sorted[0] && sorted[0].dist < 0.5 ? sorted[0] : null;
  const rest = proximityMatch ? sorted.slice(1) : sorted;

  const enterBusiness = (name) => {
    window.location.href = `/app?business=${encodeURIComponent(name)}`;
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans">
      {/* Hero */}
      <div className="relative overflow-hidden bg-white border-b border-neutral-200">
        <div className="max-w-4xl mx-auto px-6 py-16 md:py-24 text-center">
          <p className="text-xs tracking-[0.3em] text-neutral-500 mb-4">
            SAFETAB &middot; SAFETY SUPPORT
          </p>
          <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-none mb-6">
            STAY SAFER
            <br />
            WHEREVER
            <br />
            YOU ARE
          </h1>
          <p className="text-xl md:text-2xl text-neutral-700 mb-2">
            Quiet help when someone needs it most.
          </p>
          <p className="text-xl md:text-2xl font-semibold text-neutral-900">
            Fast. Clear. Ready.
          </p>
        </div>
      </div>

      {/* Campus safety card */}
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="bg-white rounded-3xl border border-neutral-200 p-8 md:p-10 shadow-sm">
          <p className="text-xs tracking-[0.3em] text-neutral-500 mb-3">
            CAMPUS SAFETY
          </p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Quick, quiet support for campus communities
          </h2>
          <p className="text-neutral-600 mb-8 max-w-xl">
            Help people request assistance immediately and route them to the
            right campus staff without confusion or delay.
          </p>
          <a
            href="/app"
            className="inline-block w-full md:w-auto text-center bg-emerald-700 hover:bg-emerald-600 text-white font-semibold rounded-2xl px-10 py-4 transition"
          >
            Enter campus safety
          </a>
        </div>
      </div>

      {/* Business directory */}
      <div className="max-w-4xl mx-auto px-6 pb-16">
        <h2 className="text-2xl md:text-3xl font-bold mb-2">
          Enter a Nearby Business
        </h2>
        <p className="text-neutral-600 mb-4">
          Allow precise location to sort businesses by your live GPS proximity.
        </p>

        {/* GPS status bar */}
        {userLoc ? (
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-emerald-700 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              GPS active &middot; Sorted by live distance
              {accuracy != null && ` (${accuracy} m accuracy)`}
            </p>
            <button
              onClick={requestLocation}
              disabled={locating}
              className="flex items-center gap-1.5 text-sm font-medium text-amber-800 hover:text-amber-700 transition disabled:opacity-50"
            >
              <RefreshCw size={14} className={locating ? "animate-spin" : ""} />
              Refresh GPS
            </button>
          </div>
        ) : (
          <div className="mb-6">
            {!locError ? (
              <button
                onClick={requestLocation}
                disabled={locating}
                className="flex items-center gap-2 px-5 py-3 rounded-xl border border-neutral-300 bg-white hover:bg-neutral-100 text-sm font-medium transition disabled:opacity-50"
              >
                <Navigation size={16} />
                {locating ? "Locating…" : "Enable precise location for proximity sorting"}
              </button>
            ) : (
              <p className="text-sm text-neutral-500 flex items-center gap-2">
                <MapPin size={14} />
                Location access off &middot; Enable precise location for proximity sorting
              </p>
            )}
          </div>
        )}

        {/* Proximity match highlight */}
        {proximityMatch && (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-3xl p-6 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold tracking-wide bg-amber-200/70 text-amber-900 rounded-full px-3 py-1">
                📍 GPS PROXIMITY MATCH
              </span>
              <span className="text-sm font-semibold text-amber-900">
                {formatDist(proximityMatch.dist)}
              </span>
            </div>
            <p className="text-xl font-bold mb-1">{proximityMatch.name}</p>
            <p className="text-sm text-neutral-600 mb-4">
              {proximityMatch.category} &middot; {proximityMatch.address}
            </p>
            <button
              onClick={() => enterBusiness(proximityMatch.name)}
              className="w-full bg-neutral-900 hover:bg-neutral-800 text-amber-300 font-semibold rounded-2xl py-4 transition"
            >
              Enter {proximityMatch.name} &rarr;
            </button>
          </div>
        )}

        {/* Business cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rest.map((b) => (
            <div
              key={b.name}
              className="bg-white rounded-3xl border border-neutral-200 p-6"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="font-bold text-lg leading-tight">{b.name}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs text-neutral-600 bg-neutral-100 rounded-full px-2.5 py-1">
                  {b.category}
                </span>
                {b.verified && (
                  <span className="text-xs font-medium text-emerald-700 bg-emerald-100 rounded-full px-2.5 py-1 flex items-center gap-1">
                    <ShieldCheck size={12} />
                    Verified
                  </span>
                )}
              </div>
              <p className="text-sm text-neutral-500 mb-2">{b.address}</p>
              <p className="text-sm text-neutral-700 mb-2">{b.service}</p>
              <p className="text-sm font-medium text-amber-800 flex items-center gap-1.5 mb-4">
                <Zap size={14} />
                Instant Safety Team Signal
              </p>
              <div className="flex items-center justify-between">
                {b.dist != null ? (
                  <span className="text-sm font-medium text-amber-900 bg-amber-100 rounded-full px-3 py-1.5">
                    {formatDist(b.dist)}
                  </span>
                ) : (
                  <span />
                )}
                <button
                  onClick={() => enterBusiness(b.name)}
                  className="px-6 py-2.5 rounded-full bg-neutral-100 hover:bg-neutral-200 text-sm font-semibold transition"
                >
                  Select
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Register CTA */}
        <button className="w-full mt-6 py-4 rounded-2xl border-2 border-dashed border-neutral-300 text-neutral-600 text-sm font-bold tracking-wide hover:border-neutral-400 hover:text-neutral-800 transition">
          OWN A BUSINESS? REGISTER IT HERE
        </button>
      </div>

      {/* Footer */}
      <div className="border-t border-neutral-200 bg-white">
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between">
          <p className="text-xs text-neutral-400">SafeTab &middot; Safety support</p>
          <a href="/staff" className="text-xs text-neutral-400 hover:text-neutral-600">
            Staff login
          </a>
        </div>
      </div>
    </div>
  );
}
