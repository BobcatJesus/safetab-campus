import { useState, useEffect, useRef } from "react";
import { MapPin, Bell, Check, X, ChevronDown, Radio } from "lucide-react";
import { ref, onValue, set } from "firebase/database";
import { db } from "./firebase";

// ---------------------------------------------
// Venue-type config — swaps location presets, reason
// categories, and terminology per deployment context.
// Add a new venue type here and the whole app (patron
// picker, staff labels) adapts without touching component code.
// ---------------------------------------------
const VENUE_TYPES = {
  bar: {
    label: "Bar / Nightlife",
    staffTerm: "staff",
    locationGroups: [
      { label: "Bar", options: ["Main Bar", "Service Bar", "Bar Seating"] },
      {
        label: "Seating",
        options: [
          "Booth",
          "Table",
          "High-Top",
          "Lounge / Couch Area",
          "Patio",
          "Rooftop",
          "Private Room",
        ],
      },
      {
        label: "Dance & Stage",
        options: ["Dance Floor", "Stage / DJ Area", "VIP / Bottle Service"],
      },
      {
        label: "Facilities",
        options: [
          "Restroom Hallway",
          "Restroom Line",
          "Coat Check",
          "Smoking Area",
        ],
      },
      {
        label: "Entry & Exit",
        options: ["Front Entrance", "Back Entrance", "Queue Outside"],
      },
    ],
    numberedOptions: ["Booth", "Table", "High-Top"],
    reasons: [
      "Uncomfortable situation",
      "Being followed / watched",
      "Unwanted contact",
      "Just want a check-in",
    ],
  },

  campus: {
    label: "College Campus",
    staffTerm: "campus safety",
    locationGroups: [
      {
        label: "Library",
        options: ["Study Room", "Main Floor", "Stacks", "Quiet Zone"],
      },
      {
        label: "Academic Buildings",
        options: ["Lecture Hall", "Classroom", "Hallway", "Lab"],
      },
      {
        label: "Residence",
        options: ["Dorm Room", "Dorm Hallway", "Common Room", "Laundry Room"],
      },
      {
        label: "Outdoors",
        options: ["Quad", "Parking Lot", "Parking Garage", "Bus Stop", "Path / Walkway"],
      },
      {
        label: "Facilities",
        options: ["Restroom", "Gym / Rec Center", "Dining Hall"],
      },
    ],
    numberedOptions: ["Study Room", "Classroom", "Lecture Hall", "Dorm Room"],
    reasons: [
      "Feel unsafe / being followed",
      "Need a walking escort",
      "Medical concern",
      "Unwanted contact",
      "Just want a check-in",
    ],
  },

  cafe: {
    label: "Coffee Shop / Café",
    staffTerm: "staff",
    locationGroups: [
      {
        label: "Seating",
        options: ["Window Seat", "Table", "Counter Seating", "Outdoor Patio"],
      },
      {
        label: "Counter",
        options: ["Ordering Line", "Pickup Counter"],
      },
      {
        label: "Facilities",
        options: ["Restroom", "Restroom Line"],
      },
      {
        label: "Entry",
        options: ["Front Entrance", "Parking Area"],
      },
    ],
    numberedOptions: ["Table"],
    reasons: [
      "Uncomfortable situation",
      "Unwanted contact",
      "Need a manager",
      "Just want a check-in",
    ],
  },
};

const DEFAULT_VENUE_TYPE = "bar";

function LocationPicker({ value, onChange, venueConfig }) {
  const [open, setOpen] = useState(false);
  const [numberInput, setNumberInput] = useState("");
  const [otherInput, setOtherInput] = useState("");
  const [showOther, setShowOther] = useState(false);

  const displayLabel = value || "Select your location";
  const needsNumber = new Set(venueConfig.numberedOptions);

  const choose = (opt) => {
    if (needsNumber.has(opt)) {
      setNumberInput("");
      onChange(opt); // temp, awaiting number
      setShowOther(false);
      return;
    }
    onChange(opt);
    setOpen(false);
    setShowOther(false);
  };

  const confirmNumber = (base) => {
    if (numberInput.trim()) {
      onChange(`${base} ${numberInput.trim()}`);
    } else {
      onChange(base);
    }
    setOpen(false);
  };

  const confirmOther = () => {
    if (otherInput.trim()) {
      onChange(otherInput.trim());
      setOpen(false);
    }
  };

  const pendingNumberBase = needsNumber.has(value) ? value : null;

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-left text-neutral-100"
      >
        <span className="flex items-center gap-2 truncate">
          <MapPin size={16} className="text-amber-400 shrink-0" />
          <span className={value ? "text-neutral-100" : "text-neutral-500"}>
            {displayLabel}
          </span>
        </span>
        <ChevronDown
          size={16}
          className={`text-neutral-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute z-20 mt-2 w-full max-h-80 overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 shadow-xl">
          {pendingNumberBase && (
            <div className="p-3 border-b border-neutral-800">
              <p className="text-xs text-neutral-400 mb-2">
                {pendingNumberBase} number (optional)
              </p>
              <div className="flex gap-2">
                <input
                  autoFocus
                  inputMode="numeric"
                  value={numberInput}
                  onChange={(e) => setNumberInput(e.target.value)}
                  placeholder="e.g. 12"
                  className="flex-1 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
                />
                <button
                  onClick={() => confirmNumber(pendingNumberBase)}
                  className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-neutral-900"
                >
                  Set
                </button>
              </div>
            </div>
          )}

          {venueConfig.locationGroups.map((group) => (
            <div key={group.label} className="py-1">
              <p className="px-4 pt-2 pb-1 text-[11px] uppercase tracking-wide text-neutral-500">
                {group.label}
              </p>
              {group.options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => choose(opt)}
                  className="w-full text-left px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
                >
                  {opt}
                </button>
              ))}
            </div>
          ))}

          <div className="py-1 border-t border-neutral-800">
            <p className="px-4 pt-2 pb-1 text-[11px] uppercase tracking-wide text-neutral-500">
              Other
            </p>
            {!showOther ? (
              <button
                onClick={() => setShowOther(true)}
                className="w-full text-left px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
              >
                Other / describe location
              </button>
            ) : (
              <div className="px-4 pb-3 flex gap-2">
                <input
                  autoFocus
                  value={otherInput}
                  onChange={(e) => setOtherInput(e.target.value)}
                  placeholder="Describe briefly"
                  className="flex-1 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
                />
                <button
                  onClick={confirmOther}
                  className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-neutral-900"
                >
                  Set
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------
// Patron view
// ---------------------------------------------
function PatronView({ onSend, venueConfig }) {
  const [location, setLocation] = useState("");
  const [reason, setReason] = useState(venueConfig.reasons[0]);
  const [sent, setSent] = useState(false);
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const holdTimer = useRef(null);
  const progressTimer = useRef(null);

  // reset the default reason selection whenever the venue type changes
  useEffect(() => {
    setReason(venueConfig.reasons[0]);
  }, [venueConfig]);

  const HOLD_MS = 1200;

  const startHold = () => {
    if (!location) return;
    setHolding(true);
    setProgress(0);
    const start = Date.now();
    progressTimer.current = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - start) / HOLD_MS) * 100);
      setProgress(pct);
    }, 30);
    holdTimer.current = setTimeout(() => {
      setSent(true);
      setHolding(false);
      clearInterval(progressTimer.current);
      onSend?.({ location, reason });
    }, HOLD_MS);
  };

  const cancelHold = () => {
    clearTimeout(holdTimer.current);
    clearInterval(progressTimer.current);
    setHolding(false);
    setProgress(0);
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-6">
        <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <Check className="text-emerald-400" size={28} />
        </div>
        <p className="text-neutral-100 font-medium">
          {venueConfig.staffTerm[0].toUpperCase() + venueConfig.staffTerm.slice(1)}{" "}
          have been alerted
        </p>
        <p className="text-neutral-500 text-sm">
          Someone will check on you at {location} shortly.
        </p>
        <button
          onClick={() => {
            setSent(false);
            setLocation("");
          }}
          className="mt-4 text-xs text-neutral-500 underline"
        >
          Send another signal
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full px-5 pt-6 pb-8 gap-5">
      <div>
        <p className="text-neutral-500 text-xs uppercase tracking-wide mb-1">
          Step 1
        </p>
        <p className="text-neutral-200 text-sm mb-2">Where are you?</p>
        <LocationPicker
          value={location}
          onChange={setLocation}
          venueConfig={venueConfig}
        />
      </div>

      <div>
        <p className="text-neutral-500 text-xs uppercase tracking-wide mb-1">
          Step 2
        </p>
        <p className="text-neutral-200 text-sm mb-2">What's going on?</p>
        <div className="grid grid-cols-1 gap-2">
          {venueConfig.reasons.map((r) => (
            <button
              key={r}
              onClick={() => setReason(r)}
              className={`text-left px-4 py-2.5 rounded-xl border text-sm ${
                reason === r
                  ? "border-amber-400 bg-amber-400/10 text-amber-200"
                  : "border-neutral-800 bg-neutral-900 text-neutral-300"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-auto flex flex-col items-center gap-2">
        <button
          onMouseDown={startHold}
          onMouseUp={cancelHold}
          onMouseLeave={cancelHold}
          onTouchStart={startHold}
          onTouchEnd={cancelHold}
          disabled={!location}
          className={`relative w-full overflow-hidden rounded-2xl py-4 font-medium text-center select-none ${
            !location
              ? "bg-neutral-800 text-neutral-600"
              : "bg-amber-500 text-neutral-900"
          }`}
        >
          <span
            className="absolute inset-0 bg-amber-300"
            style={{ width: `${progress}%`, transition: "width 30ms linear" }}
          />
          <span className="relative">
            {holding ? "Hold to confirm..." : "Press and hold to signal staff"}
          </span>
        </button>
        {!location && (
          <p className="text-xs text-neutral-600">Select a location first</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------
// Staff auth — simple name + PIN gate (no backend yet;
// swap MOCK_STAFF for a real roster lookup later)
// ---------------------------------------------
const MOCK_STAFF = [
  { name: "Jordan", pin: "1234", role: "Bartender" },
  { name: "Priya", pin: "5678", role: "Floor Manager" },
  { name: "Marcus", pin: "0000", role: "Security" },
];

function StaffLogin({ onAuth }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    const match = MOCK_STAFF.find(
      (s) => s.name.toLowerCase() === name.trim().toLowerCase() && s.pin === pin
    );
    if (match) {
      setError("");
      // this click is a user gesture — use it to unlock audio playback
      try {
        getAudioCtx();
      } catch {
        // ignore; StaffView will surface a warning if chimes fail later
      }
      onAuth(match);
    } else {
      setError("Name or PIN not recognized");
      setPin("");
    }
  };

  return (
    <div className="flex flex-col h-full px-6 justify-center gap-4">
      <div className="text-center mb-2">
        <p className="text-amber-400 text-xs font-semibold tracking-wide mb-1">
          SAFETAB
        </p>
        <p className="text-neutral-100 font-medium">Staff sign-in</p>
        <p className="text-neutral-500 text-xs mt-1">
          Required to view and acknowledge signals
        </p>
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        className="rounded-xl bg-neutral-900 border border-neutral-700 px-4 py-3 text-sm text-neutral-100"
      />
      <input
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        inputMode="numeric"
        type="password"
        placeholder="PIN"
        maxLength={4}
        className="rounded-xl bg-neutral-900 border border-neutral-700 px-4 py-3 text-sm text-neutral-100 tracking-widest"
      />
      {error && <p className="text-red-400 text-xs text-center">{error}</p>}
      <button
        onClick={submit}
        disabled={!name || pin.length < 4}
        className={`rounded-xl py-3 text-sm font-medium ${
          !name || pin.length < 4
            ? "bg-neutral-800 text-neutral-600"
            : "bg-amber-500 text-neutral-900"
        }`}
      >
        Sign in
      </button>
      <p className="text-neutral-700 text-[11px] text-center">
        Demo roster — Jordan / 1234, Priya / 5678, Marcus / 0000
      </p>
    </div>
  );
}

// ---------------------------------------------
// Alert engine — synthesized chime (no external audio
// file needed) + vibration. Browsers require a user
// gesture before audio can play, so audioCtx is created
// lazily on the staff sign-in tap.
// ---------------------------------------------
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playChime(intensity = 1) {
  try {
    const ctx = getAudioCtx();
    const notes = intensity > 1 ? [880, 988, 1175] : [880, 1175];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const startAt = ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(0.25, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + 0.4);
    });
    return true;
  } catch {
    return false;
  }
}

function vibrate(pattern) {
  if (navigator.vibrate) {
    navigator.vibrate(pattern);
    return true;
  }
  return false;
}

function fireAlert(intensity = 1) {
  const audioOk = playChime(intensity);
  const vibrateOk = vibrate(intensity > 1 ? [200, 100, 200, 100, 200] : [200]);
  return { audioOk, vibrateOk };
}

// ---------------------------------------------
// Staff view
// ---------------------------------------------
function StaffView({
  signals,
  onAck,
  onClaim,
  onUnclaim,
  staffMember,
  onSignOut,
  soundReady,
}) {
  const alertedIds = useRef(new Set());
  const lastEscalation = useRef({});
  const [alertStatus, setAlertStatus] = useState(null);

  // Chime + vibrate on every brand-new unclaimed signal
  useEffect(() => {
    signals.forEach((s) => {
      if (!s.ack && !s.claimedBy && !alertedIds.current.has(s.id)) {
        alertedIds.current.add(s.id);
        const result = fireAlert(1);
        setAlertStatus(result);
      }
    });
  }, [signals]);

  // Escalation: re-chime every 30s only while a signal is BOTH unclaimed
  // and unacknowledged. Once someone claims it, escalation stops — the
  // point of re-alerting is to catch signals nobody has picked up yet.
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      signals.forEach((s) => {
        if (s.ack || s.claimedBy) return;
        const ageSec = (now - s.time) / 1000;
        const lastFired = lastEscalation.current[s.id] || 0;
        if (ageSec >= 30 && now - lastFired >= 30000) {
          lastEscalation.current[s.id] = now;
          const intensity = ageSec >= 90 ? 2 : 1;
          const result = fireAlert(intensity);
          setAlertStatus(result);
        }
      });
    }, 2000);
    return () => clearInterval(t);
  }, [signals]);

  const unclaimedCount = signals.filter((s) => !s.ack && !s.claimedBy).length;

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-6 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio size={16} className="text-amber-400" />
          <p className="text-neutral-200 text-sm font-medium">
            {unclaimedCount} unclaimed ·{" "}
            {signals.filter((s) => !s.ack).length} active
          </p>
        </div>
        <button
          onClick={onSignOut}
          className="text-neutral-600 text-xs underline"
        >
          {staffMember.name} · Sign out
        </button>
      </div>

      {!soundReady && (
        <div className="mx-4 mb-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          Sound may not fire until you interact with the screen once — tap
          anywhere to arm alerts.
        </div>
      )}
      {alertStatus && !alertStatus.audioOk && (
        <div className="mx-4 mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          Audio failed to play — check device volume/silent mode. Vibration{" "}
          {alertStatus.vibrateOk ? "did" : "also did not"} fire.
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 space-y-3 pb-6">
        {signals.length === 0 && (
          <p className="text-neutral-600 text-sm px-2 pt-8 text-center">
            No active signals
          </p>
        )}
        {signals.map((s) => {
          const ageSec = Math.floor((Date.now() - s.time) / 1000);
          const stale = ageSec > 30 && !s.ack && !s.claimedBy;
          const critical = ageSec > 90 && !s.ack && !s.claimedBy;
          const isMine = s.claimedBy === staffMember.name;
          const claimedAgeSec = s.claimedAt
            ? Math.floor((Date.now() - s.claimedAt) / 1000)
            : null;

          return (
            <div
              key={s.id}
              className={`rounded-xl border p-4 ${
                s.ack
                  ? "border-neutral-800 bg-neutral-900 opacity-50"
                  : s.claimedBy
                    ? "border-sky-500 bg-sky-500/10"
                    : critical
                      ? "border-red-500 bg-red-500/20"
                      : stale
                        ? "border-red-500 bg-red-500/10"
                        : "border-amber-500 bg-amber-500/10"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-neutral-100 font-medium flex items-center gap-2">
                    <MapPin size={14} className="text-amber-400" />
                    {s.location}
                  </p>
                  <p className="text-neutral-400 text-xs mt-1">{s.reason}</p>
                  <p
                    className={`text-xs mt-1 ${critical ? "text-red-400 font-medium" : "text-neutral-600"}`}
                  >
                    {ageSec}s ago
                    {critical ? " · unclaimed, re-alerting" : ""}
                  </p>
                  {s.claimedBy && !s.ack && (
                    <p className="text-sky-400 text-xs mt-1 font-medium">
                      {s.claimedBy} responding · {claimedAgeSec}s
                    </p>
                  )}
                </div>

                <div className="shrink-0 flex flex-col gap-1.5 items-end">
                  {!s.ack && !s.claimedBy && (
                    <button
                      onClick={() => onClaim(s.id, staffMember.name)}
                      className="rounded-lg bg-sky-500 text-neutral-900 text-xs font-medium px-3 py-1.5"
                    >
                      Claim
                    </button>
                  )}
                  {!s.ack && s.claimedBy && isMine && (
                    <>
                      <button
                        onClick={() => onAck(s.id)}
                        className="flex items-center gap-1 rounded-lg bg-neutral-100 text-neutral-900 text-xs font-medium px-3 py-1.5"
                      >
                        <Check size={14} /> Resolved
                      </button>
                      <button
                        onClick={() => onUnclaim(s.id)}
                        className="text-neutral-500 text-[11px] underline"
                      >
                        Can't get there
                      </button>
                    </>
                  )}
                  {!s.ack && s.claimedBy && !isMine && (
                    <span className="text-neutral-600 text-[11px]">
                      being handled
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------
// Root
// ---------------------------------------------
export default function SafeTab() {
  const [view, setView] = useState("patron");
  const [signals, setSignals] = useState([]);
  const [, forceTick] = useState(0);
  const [staffMember, setStaffMember] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [venueType, setVenueType] = useState(DEFAULT_VENUE_TYPE);
  const venueConfig = VENUE_TYPES[venueType];
  const SIGNALS_PATH = "signals";

  // Signals now live in Firebase Realtime Database instead of localStorage,
  // so a patron's phone and a staff phone both read/write the same node
  // and see each other's activity live. Requires src/firebase.js to have
  // your real project config (see README) before this works.
  const persist = (next) => {
    set(ref(db, SIGNALS_PATH), next).catch(() => {
      // write failed (offline, bad config, etc.) — local state still
      // holds the value for this session, but it won't reach other devices
    });
  };

  useEffect(() => {
    const signalsRef = ref(db, SIGNALS_PATH);
    const unsubscribe = onValue(
      signalsRef,
      (snapshot) => {
        const val = snapshot.val();
        setSignals(Array.isArray(val) ? val : []);
        setLoaded(true);
      },
      () => {
        // read failed — likely bad/missing Firebase config
        setLoaded(true);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const handleSend = ({ location, reason }) => {
    setSignals((prev) => {
      const next = [
        {
          id: Date.now(),
          location,
          reason,
          time: Date.now(),
          ack: false,
          claimedBy: null,
          claimedAt: null,
        },
        ...prev,
      ];
      persist(next);
      return next;
    });
  };

  const handleAck = (id) => {
    setSignals((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ack: true } : s));
      persist(next);
      return next;
    });
  };

  const handleClaim = (id, staffName) => {
    setSignals((prev) => {
      const next = prev.map((s) =>
        s.id === id
          ? { ...s, claimedBy: staffName, claimedAt: Date.now() }
          : s
      );
      persist(next);
      return next;
    });
  };

  const handleUnclaim = (id) => {
    setSignals((prev) => {
      const next = prev.map((s) =>
        s.id === id ? { ...s, claimedBy: null, claimedAt: null } : s
      );
      persist(next);
      return next;
    });
  };

  // Prune acknowledged signals older than 1 hour so storage doesn't grow forever
  useEffect(() => {
    if (!loaded) return;
    const cutoff = Date.now() - 60 * 60 * 1000;
    const trimmed = signals.filter((s) => !s.ack || s.time > cutoff);
    if (trimmed.length !== signals.length) {
      setSignals(trimmed);
      persist(trimmed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);


  return (
    <div className="w-full max-w-sm mx-auto h-[700px] bg-black rounded-3xl border border-neutral-800 flex flex-col overflow-hidden font-sans">
      <div className="px-5 pt-4 pb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-amber-500 flex items-center justify-center">
            <span className="text-neutral-900 text-xs font-bold">S</span>
          </div>
          <p className="text-neutral-100 text-sm font-semibold tracking-tight">
            SafeTab
          </p>
        </div>
        {/* demo-only venue-type switcher — a real deployment would set
            this once at setup, not expose it as a toggle to patrons */}
        <select
          value={venueType}
          onChange={(e) => setVenueType(e.target.value)}
          className="bg-neutral-900 border border-neutral-800 rounded-lg text-[11px] text-neutral-400 px-2 py-1"
        >
          {Object.entries(VENUE_TYPES).map(([key, cfg]) => (
            <option key={key} value={key}>
              {cfg.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex border-b border-neutral-800">
        <button
          onClick={() => setView("patron")}
          className={`flex-1 py-3 text-sm font-medium ${
            view === "patron"
              ? "text-amber-400 border-b-2 border-amber-400"
              : "text-neutral-600"
          }`}
        >
          Patron
        </button>
        <button
          onClick={() => setView("staff")}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-1.5 ${
            view === "staff"
              ? "text-amber-400 border-b-2 border-amber-400"
              : "text-neutral-600"
          }`}
        >
          Staff
          {signals.some((s) => !s.ack) && (
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          )}
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        {view === "patron" ? (
          <PatronView onSend={handleSend} venueConfig={venueConfig} />
        ) : staffMember ? (
          <StaffView
            signals={signals}
            onAck={handleAck}
            onClaim={handleClaim}
            onUnclaim={handleUnclaim}
            staffMember={staffMember}
            onSignOut={() => setStaffMember(null)}
            soundReady={!!staffMember}
          />
        ) : (
          <StaffLogin onAuth={setStaffMember} />
        )}
      </div>
    </div>
  );
}
