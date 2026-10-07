import { useState, useEffect, useRef } from "react";
import {
  MapPin,
  Bell,
  Check,
  X,
  ChevronDown,
  Radio,
  PhoneCall,
  ArrowLeft,
  UserPlus,
  Trash2,
  Save,
  Search,
  Loader2,
  Compass,
  ShieldCheck,
  Zap,
  Building2,
  Coffee,
  Beer,
  FileText,
  Download,
} from "lucide-react";
import { ref, onValue, set, update, remove, runTransaction } from "firebase/database";
import { auth, authReady, db } from "./firebase";
import { searchPlaces, fetchNearbyPlaces } from "./osm";

// ---------------------------------------------
// Distance between two GPS points, in miles — used both to verify a
// patron is actually at the business they picked, and to sort the
// business directory by "nearest to me" so patrons can find the right
// business without needing a QR code posted at every table.
// ---------------------------------------------
function distanceMiles(a, b) {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(b.lat - a.lat);
  const longitudeDelta = toRadians(b.lng - a.lng);
  const latitude = toRadians(a.lat);
  return 3959 * 2 * Math.asin(Math.sqrt(
    Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(latitude) * Math.cos(toRadians(b.lat))
      * Math.sin(longitudeDelta / 2) ** 2
  ));
}

function formatDistance(miles) {
  if (miles == null) return null;
  if (miles < 0.1) return "< 0.1 mi away";
  return `${miles.toFixed(1)} mi away`;
}

// Turns a business name into a stable, readable Firebase key, e.g.
// "The Copper Owl" -> "the-copper-owl-4f2a"
function slugifyBusinessId(name) {
  const base = (name || "business")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "business";
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

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
    staffRoles: ["Staff", "Manager"],
    staffAreas: [
      "All areas",
      "Bar",
      "Seating",
      "Dance & Stage",
      "Facilities",
      "Entry & Exit",
    ],
    staffView: {
      tabLabel: "Staff",
      title: "Staff response",
      emptyLabel: "No active signals",
      claimLabel: "Claim",
      resolveLabel: "Resolved",
    },
    teamRoster: [
      { name: "Jamie", role: "Bartender", area: "Bar" },
      { name: "Casey", role: "Server", area: "Seating" },
      { name: "Riley", role: "Security", area: "Entry & Exit" },
      { name: "Devon", role: "DJ / Floor Host", area: "Dance & Stage" },
    ],
    adminResponsibilities: [
      {
        label: "Floor operations",
        items: ["Table & bar seating flow", "Line management", "VIP / bottle service coordination"],
      },
      {
        label: "Bar & inventory",
        items: ["Liquor & stock levels", "Vendor orders", "Waste & spillage tracking"],
      },
      {
        label: "Staff scheduling",
        items: ["Shift coverage", "Bartender & security assignments", "Break rotation"],
      },
      {
        label: "Guest safety & compliance",
        items: ["ID checks", "Overservice monitoring", "Incident documentation"],
      },
    ],
    adminCompetencies: [
      "Staff supervision",
      "Conflict de-escalation",
      "Inventory management",
      "Regulatory compliance",
    ],
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
    reasonGroups: [
      {
        label: "Personal Safety & Harassment",
        options: [
          "Feeling unsafe or uncomfortable",
          "Being followed or watched",
          "Unwanted contact or touching",
          "Harassment or inappropriate comments",
          "Threats, intimidation, or coercion",
          "Stalking behavior",
          "Person will not leave me alone",
          "Concern about someone in my group",
          "Need a discreet check-in",
          "Need a safe place to wait",
        ],
      },
      {
        label: "Medical & Wellness",
        options: [
          "Feeling unwell or dizzy",
          "Panic attack or mental health concern",
          "Possible drink tampering",
          "Too intoxicated to get home safely",
          "Someone appears over-intoxicated",
          "Possible overdose",
          "Person unconscious or unresponsive",
          "Injury or severe bleeding",
          "Allergic reaction or breathing difficulty",
          "Need medical assistance",
        ],
      },
      {
        label: "Security & Emergency",
        options: [
          "Fight or physical altercation",
          "Person has a weapon",
          "Suspicious person or package",
          "Theft or stolen property",
          "Robbery or attempted robbery",
          "Property damage or vandalism",
          "Unauthorized person in a restricted area",
          "Fire, smoke, or burning smell",
          "Emergency exit is blocked",
          "Immediate danger",
        ],
      },
      {
        label: "Venue Conditions & Policies",
        options: [
          "Spill or slip hazard",
          "Broken glass or sharp object",
          "Unsafe furniture or damaged flooring",
          "Restroom needs attention",
          "Restroom feels unsafe",
          "Crowding or blocked walkway",
          "Smoking or vaping in a restricted area",
          "Underage drinking concern",
          "Overservice concern",
          "ID or entry policy concern",
          "Need a manager",
          "Staff assistance requested",
        ],
      },
      {
        label: "Transportation & Departure",
        options: [
          "Need help getting a ride",
          "Need an escort to my car",
          "Unsafe situation in the parking area",
          "Person is waiting outside for me",
          "Ride-share pickup issue",
          "Lost or separated from my group",
          "Need help contacting a friend",
        ],
      },
    ],
    reasons: [
      "Feeling unsafe or uncomfortable",
      "Being followed or watched",
      "Unwanted contact or touching",
      "Harassment or inappropriate comments",
      "Threats, intimidation, or coercion",
      "Stalking behavior",
      "Person will not leave me alone",
      "Concern about someone in my group",
      "Need a discreet check-in",
      "Need a safe place to wait",
      "Feeling unwell or dizzy",
      "Panic attack or mental health concern",
      "Possible drink tampering",
      "Too intoxicated to get home safely",
      "Someone appears over-intoxicated",
      "Possible overdose",
      "Person unconscious or unresponsive",
      "Injury or severe bleeding",
      "Allergic reaction or breathing difficulty",
      "Need medical assistance",
      "Fight or physical altercation",
      "Person has a weapon",
      "Suspicious person or package",
      "Theft or stolen property",
      "Robbery or attempted robbery",
      "Property damage or vandalism",
      "Unauthorized person in a restricted area",
      "Fire, smoke, or burning smell",
      "Emergency exit is blocked",
      "Immediate danger",
      "Spill or slip hazard",
      "Broken glass or sharp object",
      "Unsafe furniture or damaged flooring",
      "Restroom needs attention",
      "Restroom feels unsafe",
      "Crowding or blocked walkway",
      "Smoking or vaping in a restricted area",
      "Underage drinking concern",
      "Overservice concern",
      "ID or entry policy concern",
      "Need a manager",
      "Staff assistance requested",
      "Need help getting a ride",
      "Need an escort to my car",
      "Unsafe situation in the parking area",
      "Person is waiting outside for me",
      "Ride-share pickup issue",
      "Lost or separated from my group",
      "Need help contacting a friend",
    ],
  },

  campus: {
    label: "Campus Safety",
    staffTerm: "campus safety",
    staffRoles: [
      "👨‍🎓 Student",
      "🏠 Resident Assistant (RA)",
      "🎓 Teaching Assistant (TA)",
      "👮 Campus Security",
      "💼 Student Employee",
      "👩‍🏫 Faculty & Staff",
      "👨‍👩‍👧 Family Member",
      "🗂️ Administrator",
    ],
    staffAreas: [
      "All campus",
      "Library",
      "Academic Buildings",
      "Residence",
      "Outdoors",
      "Facilities",
    ],
    adminResponsibilities: [
      {
        label: "Office administration",
        items: ["Daily operations", "Supplies and equipment", "Maintenance and vendors", "Office policies"],
      },
      {
        label: "Calendar and meetings",
        items: ["Schedules and events", "Agendas and materials", "Minutes and action items"],
      },
      {
        label: "Communication",
        items: ["Internal and external contact", "Calls, email, and correspondence", "Documents and communication records"],
      },
      {
        label: "Documents and records",
        items: ["File organization", "Document control", "Confidential information", "Retention compliance"],
      },
      {
        label: "Reporting and data",
        items: ["Reports and spreadsheets", "Administrative analysis", "Databases and records", "Data accuracy"],
      },
      {
        label: "Finance and procurement",
        items: ["Purchase requests", "Invoices and expenses", "Vendor payments", "Budgets and spending"],
      },
      {
        label: "Employee and visitor support",
        items: ["Onboarding", "Travel arrangements", "Staff resources", "Customer service"],
      },
      {
        label: "Compliance and improvement",
        items: ["Policy compliance", "Workflow improvements", "Audits and reviews", "Administrative best practices"],
      },
    ],
    adminCompetencies: [
      "Organization and time management",
      "Communication",
      "Attention to detail",
      "Problem-solving",
      "Confidentiality",
      "Microsoft Office proficiency",
      "Prioritization",
      "Customer service",
    ],
    staffView: {
      tabLabel: "Campus Safety",
      title: "Campus safety dispatch",
      emptyLabel: "No active campus requests",
      claimLabel: "Respond",
      resolveLabel: "Close request",
    },
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
    reasonGroups: [
      {
        label: "Safety & Security",
        options: [
          "Being followed",
          "Unwanted touching",
          "Someone has a weapon",
          "Intimidation or threats",
          "Harassment concerns",
          "Restroom feels unsafe",
          "Need a safe space",
          "Someone has walked away with something of yours (theft)",
          "Locked out of a residence hall or room",
        ],
      },
      {
        label: "Health & Medical",
        options: [
          "Feeling unwell",
          "Medical concern",
          "Intoxication",
          "Suspected overdose",
          "Unresponsive student",
        ],
      },
      {
        label: "Behavioral & Conduct Issues",
        options: [
          "Someone is rude",
          "Classroom disruptions",
          "Noise complaints",
          "Roommate conflicts",
          "Someone is damaging or breaking property",
        ],
      },
      {
        label: "Facilities & Maintenance",
        options: [
          "There's a mess",
          "Residence hall maintenance concerns",
          "Unsafe or unsanitary conditions",
        ],
      },
      {
        label: "Support & Assistance",
        options: [
          "Ask for a manager",
          "Request staff assistance",
          "Report a concern or incident",
        ],
      },
    ],
    reasons: [
      "Being followed",
      "Unwanted touching",
      "Someone has a weapon",
      "Intimidation or threats",
      "Harassment concerns",
      "Restroom feels unsafe",
      "Need a safe space",
      "Someone has walked away with something of yours (theft)",
      "Locked out of a residence hall or room",
      "Feeling unwell",
      "Medical concern",
      "Intoxication",
      "Suspected overdose",
      "Unresponsive student",
      "Someone is rude",
      "Classroom disruptions",
      "Noise complaints",
      "Roommate conflicts",
      "Someone is damaging or breaking property",
      "There's a mess",
      "Residence hall maintenance concerns",
      "Unsafe or unsanitary conditions",
      "Ask for a manager",
      "Request staff assistance",
      "Report a concern or incident",
    ],
  },

  specialty_store: {
    label: "Specialty Store / Retail",
    staffTerm: "staff",
    staffRoles: ["Staff", "Manager"],
    staffAreas: ["All areas", "Sales floor", "Checkout", "Front entrance", "Restrooms", "Back room"],
    staffView: {
      tabLabel: "Staff",
      title: "Store response",
      emptyLabel: "No active store requests",
      claimLabel: "Claim",
      resolveLabel: "Resolved",
    },
    teamRoster: [
      { name: "Morgan", role: "Sales associate", area: "Sales floor" },
      { name: "Jules", role: "Cashier", area: "Checkout" },
      { name: "Taylor", role: "Manager", area: "Front entrance" },
      { name: "Renee", role: "Inventory support", area: "Back room" },
    ],
    adminResponsibilities: [
      {
        label: "Floor operations",
        items: ["Customer flow", "Line management", "Display and merchandising", "Store traffic monitoring"],
      },
      {
        label: "Staff support",
        items: ["Schedule coverage", "Register support", "On-duty staffing", "Customer escalations"],
      },
      {
        label: "Inventory & logistics",
        items: ["Back-room organization", "Restock coordination", "Vendor handoff", "Loss prevention follow-up"],
      },
      {
        label: "Guest safety & compliance",
        items: ["Customer incidents", "Policy issues", "Incident documentation", "Manager escalation"],
      },
    ],
    adminCompetencies: [
      "Customer service",
      "Staff coordination",
      "Loss prevention awareness",
      "Incident documentation",
      "Operational oversight",
    ],
    locationGroups: [
      {
        label: "Sales floor",
        options: ["Aisle", "Display table", "Feature wall", "Checkout line", "Customer service desk", "Book / media section", "Kids area", "Home goods area"],
      },
      {
        label: "Entry & front of store",
        options: ["Front entrance", "Storefront", "Window display", "Doorway", "Lobby / waiting area"],
      },
      {
        label: "Restrooms & support",
        options: ["Restroom", "Family restroom", "Customer service counter"],
      },
      {
        label: "Back of house",
        options: ["Stock room", "Back room", "Loading area", "Break room"],
      },
    ],
    numberedOptions: ["Aisle", "Display table"],
    reasonGroups: [
      {
        label: "Customer & personal safety",
        options: [
          "Someone is making me feel unsafe",
          "Being followed in the store",
          "Unwanted attention or harassment",
          "Customer confrontation",
          "Intimidation or threats",
          "Shoplifting concern",
          "Concern about someone in my group",
          "Need a safe place to wait",
        ],
      },
      {
        label: "Medical & help",
        options: [
          "Feeling unwell",
          "Medical concern",
          "Guest needs assistance",
          "Someone appears disoriented",
          "Need help finding an item",
          "Need a manager",
        ],
      },
      {
        label: "Security & concerns",
        options: [
          "Suspicious person nearby",
          "Theft or attempted theft",
          "Property damage",
          "Unauthorized person in restricted area",
          "Lost child or vulnerable guest",
          "Found a suspicious package",
          "Security support requested",
        ],
      },
      {
        label: "Operations & facilities",
        options: [
          "Spill or trip hazard",
          "Broken display or damaged merchandise",
          "Restroom needs attention",
          "Checkout line issue",
          "Crowding or blocked aisle",
          "Hazard in the store",
        ],
      },
    ],
    reasons: [
      "Someone is making me feel unsafe",
      "Being followed in the store",
      "Unwanted attention or harassment",
      "Customer confrontation",
      "Intimidation or threats",
      "Shoplifting concern",
      "Concern about someone in my group",
      "Need a safe place to wait",
      "Feeling unwell",
      "Medical concern",
      "Guest needs assistance",
      "Someone appears disoriented",
      "Need help finding an item",
      "Need a manager",
      "Suspicious person nearby",
      "Theft or attempted theft",
      "Property damage",
      "Unauthorized person in restricted area",
      "Lost child or vulnerable guest",
      "Found a suspicious package",
      "Security support requested",
      "Spill or trip hazard",
      "Broken display or damaged merchandise",
      "Restroom needs attention",
      "Checkout line issue",
      "Crowding or blocked aisle",
      "Hazard in the store",
    ],
  },

  cafe: {
    label: "Coffee Shop / Café",
    staffTerm: "staff",
    staffRoles: ["Staff", "Manager"],
    staffAreas: ["All areas", "Seating", "Counter", "Facilities", "Entry"],
    staffView: {
      tabLabel: "Staff",
      title: "Staff response",
      emptyLabel: "No active signals",
      claimLabel: "Claim",
      resolveLabel: "Resolved",
    },
    teamRoster: [
      { name: "Morgan", role: "Barista", area: "Counter" },
      { name: "Drew", role: "Server", area: "Seating" },
      { name: "Skyler", role: "Cashier", area: "Entry" },
    ],
    adminResponsibilities: [
      {
        label: "Floor operations",
        items: ["Seating & table turnover", "Line & pickup flow", "Patio management"],
      },
      {
        label: "Inventory & supplies",
        items: ["Coffee & food stock", "Vendor orders", "Waste tracking"],
      },
      {
        label: "Staff scheduling",
        items: ["Shift coverage", "Barista assignments", "Break rotation"],
      },
      {
        label: "Guest safety & compliance",
        items: ["Food safety checks", "Spill/hazard response", "Incident documentation"],
      },
    ],
    adminCompetencies: [
      "Staff supervision",
      "Customer service",
      "Food safety compliance",
      "Inventory management",
    ],
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
    reasonGroups: [
      {
        label: "Personal Safety",
        options: [
          "Feeling threatened by someone",
          "Being followed",
          "Harassment",
          "Verbal abuse",
          "Intimidation",
          "Stalking behavior",
          "Unwanted attention",
          "Suspicious person nearby",
          "Aggressive customer",
          "Aggressive employee",
          "Physical altercation occurring",
          "Fear of violence",
        ],
      },
      {
        label: "Medical & Health Emergencies",
        options: [
          "Person unconscious",
          "Person having a seizure",
          "Breathing difficulty",
          "Chest pain",
          "Severe bleeding",
          "Serious injury",
          "Allergic reaction",
          "Fainting",
          "Medical emergency requiring ambulance",
          "Mental health crisis",
          "Panic attack",
        ],
      },
      {
        label: "Environmental Hazards",
        options: [
          "Wet floor",
          "Spill creating slip hazard",
          "Broken flooring",
          "Obstructed walkway",
          "Poor lighting",
          "Falling object risk",
          "Broken furniture",
          "Sharp object exposed",
          "Excessive heat",
          "Excessive cold",
          "Unsafe outdoor conditions",
        ],
      },
      {
        label: "Fire & Electrical Hazards",
        options: [
          "Smoke detected",
          "Fire detected",
          "Burning smell",
          "Exposed wiring",
          "Damaged electrical equipment",
          "Sparking outlet",
          "Overloaded extension cords",
          "Emergency exit blocked",
          "Fire extinguisher inaccessible",
        ],
      },
      {
        label: "Food & Drink Safety",
        options: [
          "Suspected food poisoning",
          "Allergen concern",
          "Incorrect allergen labeling",
          "Food contamination",
          "Foreign object in food",
          "Food stored improperly",
          "Expired food served",
          "Unsafe food handling observed",
        ],
      },
      {
        label: "Security Incidents",
        options: [
          "Theft occurring",
          "Theft suspected",
          "Robbery",
          "Vandalism",
          "Property damage",
          "Unauthorized access",
          "Suspicious package",
          "Lost child",
          "Missing person",
          "Security breach",
        ],
      },
      {
        label: "Vulnerable Person Concerns",
        options: [
          "Child appears unsafe",
          "Child left unattended",
          "Elderly person needing assistance",
          "Distressed individual",
          "Person appearing vulnerable",
          "Person under influence needing help",
          "Welfare concern",
          "Safeguarding concern",
        ],
      },
      {
        label: "Staff Safety",
        options: [
          "Working alone feels unsafe",
          "Threat from customer",
          "Workplace violence",
          "Unsafe lifting activity",
          "Fatigue concern",
          "Lack of safety equipment",
          "Unsafe work practice observed",
          "Injury at work",
        ],
      },
      {
        label: "Transportation & External Area Risks",
        options: [
          "Dangerous driving nearby",
          "Vehicle collision",
          "Pedestrian hazard",
          "Unsafe parking area",
          "Poor visibility outside",
          "Ice or weather hazard",
          "Unsafe public transport situation",
        ],
      },
      {
        label: "General Risk Categories",
        options: [
          "Immediate danger",
          "High risk",
          "Moderate risk",
          "Low risk",
          "Near miss",
          "Hazard observed",
          "Incident occurred",
          "Request for assistance",
          "Welfare check needed",
        ],
      },
    ],
    reasons: [
      "Feeling threatened by someone",
      "Person unconscious",
      "Wet floor",
      "Smoke detected",
      "Suspected food poisoning",
      "Theft occurring",
      "Child appears unsafe",
      "Working alone feels unsafe",
      "Dangerous driving nearby",
      "Immediate danger",
    ],
  },
};

const DEFAULT_VENUE_TYPE = "bar";
const INCIDENT_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

const HERO_PORTRAITS = [
  {
    src: "https://i.pravatar.cc/200?img=11",
    alt: "Portrait 1",
    className: "-left-8 top-16 h-24 w-24 sm:h-28 sm:w-28",
  },
  {
    src: "https://i.pravatar.cc/200?img=16",
    alt: "Portrait 2",
    className: "left-10 bottom-20 h-24 w-24 sm:h-28 sm:w-28",
  },
  {
    src: "https://i.pravatar.cc/200?img=32",
    alt: "Portrait 3",
    className: "left-1/4 top-6 hidden h-28 w-28 md:block",
  },
  {
    src: "https://i.pravatar.cc/200?img=48",
    alt: "Portrait 4",
    className: "left-1/4 bottom-10 h-20 w-20 sm:h-24 sm:w-24",
  },
  {
    src: "https://i.pravatar.cc/200?img=52",
    alt: "Portrait 5",
    className: "right-10 top-10 h-24 w-24 sm:h-28 sm:w-28",
  },
  {
    src: "https://i.pravatar.cc/200?img=37",
    alt: "Portrait 6",
    className: "right-3 top-40 hidden h-24 w-24 sm:block",
  },
  {
    src: "https://i.pravatar.cc/200?img=22",
    alt: "Portrait 7",
    className: "right-1/4 bottom-10 h-24 w-24 sm:h-28 sm:w-28",
  },
  {
    src: "https://i.pravatar.cc/200?img=59",
    alt: "Portrait 8",
    className: "right-0 bottom-28 hidden h-24 w-24 sm:block",
  },
];

const DEFAULT_SEED_BUSINESSES = [
  {
    id: "seed-katzs-montrose",
    name: "Katz's (Montrose)",
    venueType: "cafe",
    address: "616 Westheimer Rd, Houston, TX 77006",
    lat: 29.7448011,
    lng: -95.3895138,
    verified: true,
    tagline: "Restaurant Staff Response",
  },
  {
    id: "seed-katzs-heights",
    name: "Katz's (Houston Heights)",
    venueType: "cafe",
    address: "2200 North Shepherd Dr, Houston, TX 77008",
    lat: 29.8060743,
    lng: -95.4099940,
    verified: true,
    tagline: "Restaurant Staff Response",
  },
  {
    id: "seed-barnes-noble-west-gray",
    name: "Barnes & Noble (West Gray)",
    venueType: "specialty_store",
    address: "2030 West Gray St, River Oaks Shopping Center, Houston, TX 77019",
    lat: 29.7533356,
    lng: -95.4098522,
    verified: true,
    tagline: "Bookstore & Cafe Safety Monitoring",
  },
  {
    id: "seed-river-oaks-theater",
    name: "River Oaks Theater",
    venueType: "bar",
    address: "2009 West Gray St, River Oaks Shopping Center, Houston, TX 77019",
    lat: 29.7526802,
    lng: -95.4091407,
    verified: true,
    tagline: "Cinema Staff & Security Desk",
  },
  {
    id: "seed-starbucks-west-gray",
    name: "Starbucks (River Oaks)",
    venueType: "cafe",
    address: "1971 West Gray St, Houston, TX 77019",
    lat: 29.7534000,
    lng: -95.4085000,
    verified: true,
    tagline: "Barista & Floor Staff Monitoring",
  },
  {
    id: "seed-midtown-bar-gray",
    name: "Midtown Bar and Grill",
    venueType: "bar",
    address: "415 West Gray St, Houston, TX 77019",
    lat: 29.7532004,
    lng: -95.3871872,
    verified: true,
    tagline: "Active Security & Bar Staff Response",
  },
  {
    id: "seed-common-bond-cafe",
    name: "Common Bond Bakery & Cafe",
    venueType: "cafe",
    address: "1706 Westheimer Rd, Houston, TX 77006",
    lat: 29.7429673,
    lng: -95.4022952,
    verified: true,
    tagline: "Cafe Floor & Service Staff",
  },
  {
    id: "seed-reeves-bookstore",
    name: "Reeve's Bookstore",
    venueType: "specialty_store",
    address: "2420 Westheimer Rd, Houston, TX 77098",
    lat: 29.7442151,
    lng: -95.4182745,
    verified: true,
    tagline: "Bookstore Customer Support",
  },
  {
    id: "seed-lotus-gift-shop",
    name: "Lotus Gift & Home",
    venueType: "specialty_store",
    address: "1461 Heights Blvd, Houston, TX 77008",
    lat: 29.8011397,
    lng: -95.3945688,
    verified: true,
    tagline: "Retail Floor & Checkout Monitoring",
  },
  {
    id: "seed-urban-sporting-goods",
    name: "Urban Sporting Goods",
    venueType: "specialty_store",
    address: "5400 Memorial Dr, Houston, TX 77007",
    lat: 29.7582312,
    lng: -95.3915388,
    verified: true,
    tagline: "Department & Sporting Goods Response",
  },
  {
    id: "seed-vine-and-thread",
    name: "Vine & Thread Boutique",
    venueType: "specialty_store",
    address: "1801 Westheimer Rd, Houston, TX 77098",
    lat: 29.7447492,
    lng: -95.4149221,
    verified: true,
    tagline: "Boutique Floor & Checkout Monitoring",
  },
  {
    id: "seed-harbor-grocery",
    name: "Harbor Grocery Market",
    venueType: "specialty_store",
    address: "3201 Montrose Blvd, Houston, TX 77006",
    lat: 29.7443508,
    lng: -95.3902151,
    verified: true,
    tagline: "Grocery Store Safety & Service",
  },
  {
    id: "seed-copper-owl",
    name: "The Copper Owl Lounge",
    venueType: "bar",
    address: "4800 Calhoun Rd, Houston, TX",
    lat: 29.7185,
    lng: -95.3410,
    verified: true,
    tagline: "Active Security & Bar Staff Response",
  },
  {
    id: "seed-uh-library",
    name: "MD Anderson Library",
    venueType: "campus",
    address: "4333 University Dr, Houston, TX",
    lat: 29.7199,
    lng: -95.3422,
    verified: true,
    tagline: "Campus Safety & RA Dispatch",
  },
  {
    id: "seed-student-center",
    name: "Student Center South",
    venueType: "campus",
    address: "4465 University Dr, Houston, TX",
    lat: 29.7180,
    lng: -95.3405,
    verified: true,
    tagline: "24/7 Security Desk & Escort Service",
  },
];

const CAMPUS_OPTIONS = [
  {
    id: "campus-university-of-houston",
    name: "University of Houston",
    shortName: "UH Cougars",
    color: "#C8102E",
    darkColor: "#9e0b23",
    lightBg: "#fdf2f4",
    borderColor: "#f2b3bc",
    badgeBg: "#C8102E",
    badgeText: "#ffffff",
    venueType: "campus",
    lat: 29.7199,
    lng: -95.3422,
    locationGroups: [
      {
        label: "Student Centers & Library",
        options: [
          "Student Center South · Main Lounge",
          "Student Center South · Plaza",
          "Student Center North",
          "MD Anderson Library · Main Floor",
          "MD Anderson Library · Study Room",
        ],
      },
      {
        label: "Residence Halls",
        options: [
          "Cougar Village I · Entrance",
          "Cougar Village II",
          "Cougar Place",
          "Moody Towers",
          "The Quad",
          "Bayou Oaks",
        ],
      },
      {
        label: "Academic Buildings",
        options: [
          "Classroom Business Building",
          "Science & Research 1",
          "Agnes Arnold Hall",
          "Fine Arts Building",
        ],
      },
      {
        label: "Outdoors & Parking",
        options: [
          "Lynn Eusan Park",
          "University Gateway",
          "Elgin Street Garage",
          "Stadium Garage",
          "Campus Walkway",
        ],
      },
      {
        label: "Rec & Dining",
        options: [
          "Campus Recreation Center",
          "Cougar Woods Dining Commons",
          "Moody Dining Commons",
        ],
      },
    ],
  },
  {
    id: "campus-rice-university",
    name: "Rice University",
    shortName: "Rice Owls",
    color: "#00205B",
    darkColor: "#00133d",
    lightBg: "#f0f4fa",
    borderColor: "#99afd0",
    badgeBg: "#00205B",
    badgeText: "#ffffff",
    venueType: "campus",
    lat: 29.7174,
    lng: -95.4018,
    locationGroups: [
      {
        label: "Library & Student Center",
        options: [
          "Fondren Library · Main Floor",
          "Fondren Library · Study Room",
          "Rice Memorial Center (RMC) · Ley Student Center",
          "Brochstein Pavilion",
          "Willy's Pub",
        ],
      },
      {
        label: "Residential Colleges",
        options: [
          "Baker College",
          "Will Rice College",
          "Hanszen College",
          "Wiess College",
          "Jones College",
          "Brown College",
          "Lovett College",
          "Sid Richardson College",
          "Martel College",
          "McMurtry College",
          "Duncan College",
        ],
      },
      {
        label: "Academic Buildings",
        options: [
          "Herzstein Hall",
          "Anderson Hall",
          "Duncan Hall",
          "Keck Hall",
          "Rayzor Hall",
          "Sewall Hall",
        ],
      },
      {
        label: "Outdoors & Athletics",
        options: [
          "Academic Quad · Willy's Statue",
          "Rice Stadium",
          "Tudor Fieldhouse",
          "West Lot",
          "Inner Loop Walkway",
        ],
      },
      {
        label: "Dining & Facilities",
        options: [
          "Seibel Servery",
          "West Servery",
          "North Servery",
          "Gibbs Recreation Center",
        ],
      },
    ],
  },
];

// ---------------------------------------------
// Business finder — patrons get their device location once, we sort
// registered and nearby OSM businesses by distance, providing a rich
// marketplace of proximity options.
// ---------------------------------------------
function VenueFinder({ businesses, onSelect, onRegister }) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [coords, setCoords] = useState(null);
  const [locationAccuracy, setLocationAccuracy] = useState(null);
  const [geoStatus, setGeoStatus] = useState(navigator.geolocation ? "checking" : "unavailable");
  const [osmPlaces, setOsmPlaces] = useState([]);
  const [loadingOsm, setLoadingOsm] = useState(false);

  const fetchOsmForCoords = (userLat, userLng) => {
    setLoadingOsm(true);
    fetchNearbyPlaces({ lat: userLat, lng: userLng })
      .then((places) => setOsmPlaces(places || []))
      .catch(() => setOsmPlaces([]))
      .finally(() => setLoadingOsm(false));
  };

  const acquireLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus("unavailable");
      return;
    }
    setGeoStatus("checking");

    const onPosSuccess = (position) => {
      const userLat = position.coords.latitude;
      const userLng = position.coords.longitude;
      const accuracy = position.coords.accuracy;
      setCoords({ lat: userLat, lng: userLng });
      setLocationAccuracy(accuracy);
      setGeoStatus(accuracy <= 1000 ? "ready" : "imprecise");
      fetchOsmForCoords(userLat, userLng);
    };

    // Request a fresh device position: proximity sorting is misleading when using a cached/IP estimate.
    navigator.geolocation.getCurrentPosition(
      onPosSuccess,
      () => {
        navigator.geolocation.getCurrentPosition(
          onPosSuccess,
          (err) => {
            console.warn("Location error:", err);
            setGeoStatus("denied");
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    acquireLocation();
  }, []);

  // Combine Firebase registered businesses, default seed businesses, and fetched OSM places
  const allRaw = [
    ...Object.entries(businesses || {})
      .filter(([id]) => !id.startsWith("demo-"))
      .map(([id, b]) => ({ id, ...b, source: b.source || "registered" })),
    ...DEFAULT_SEED_BUSINESSES,
    ...osmPlaces,
  ];

  // Deduplicate by name/id
  const seenNames = new Set();
  const uniqueEntries = [];
  for (const item of allRaw) {
    if (!item || !item.name) continue;
    const norm = item.name.toLowerCase().trim();
    if (seenNames.has(norm)) continue;
    seenNames.add(norm);
    uniqueEntries.push(item);
  }

  // Calculate distance & filter
  const processed = uniqueEntries
    .map((b) => {
      const dist = coords ? distanceMiles(coords, b) : null;
      return {
        ...b,
        distance: dist,
      };
    })
    .filter((b) => {
      if (categoryFilter !== "all" && b.venueType !== categoryFilter) return false;
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      return (
        b.name?.toLowerCase().includes(q) ||
        b.address?.toLowerCase().includes(q) ||
        b.venueType?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (a.distance == null && b.distance == null) return (a.name || "").localeCompare(b.name || "");
      if (a.distance == null) return 1;
      if (b.distance == null) return -1;
      return a.distance - b.distance;
    });

  const closestBusiness = coords && geoStatus === "ready" ? processed[0] : null;

  const dynamicHeading = closestBusiness
    ? `Enter ${closestBusiness.name}`
    : geoStatus === "checking"
    ? "Detecting Nearby Businesses..."
    : "Enter a Nearby Business";

  const dynamicSubtext = closestBusiness
    ? `GPS location suggests you are closest to ${closestBusiness.name} (${formatDistance(closestBusiness.distance)}). Select it below or pick another nearby option.`
    : geoStatus === "imprecise"
    ? "Your device location is too broad for business-level proximity. Turn on Precise Location, then refresh GPS."
    : "Allow precise location to sort businesses by your live GPS proximity.";

  return (
    <div className="mt-8 w-full max-w-2xl rounded-3xl border border-black/15 bg-white/95 p-5 text-left shadow-2xl backdrop-blur">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-black/80 flex items-center gap-1.5">
            <Compass size={16} className="text-amber-600" /> {dynamicHeading}
          </h2>
          <p className="text-xs text-black/60 mt-0.5">
            {dynamicSubtext}
          </p>
        </div>
        <span className="mt-1 sm:mt-0 self-start sm:self-auto rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-[11px] font-semibold text-amber-900 flex items-center gap-1">
          <Zap size={12} className="text-amber-600 shrink-0" />
          {processed.length} GPS Proximity Options
        </span>
      </div>

      {/* Category filter pills */}
      <div className="mt-4 flex flex-wrap gap-1.5 border-b border-black/10 pb-3">
        {[
          { id: "all", label: "All Proximity", icon: Compass },
          { id: "bar", label: "Bars & Nightlife", icon: Beer },
          { id: "campus", label: "Campus & Safety", icon: Building2 },
          { id: "cafe", label: "Cafes & Dining", icon: Coffee },
          { id: "specialty_store", label: "Specialty Stores", icon: Building2 },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = categoryFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setCategoryFilter(tab.id)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? "bg-[#0f172a] text-[#ffd44f] shadow-sm"
                  : "bg-black/5 text-black/70 hover:bg-black/10"
              }`}
            >
              <Icon size={13} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Search Input */}
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-black/15 bg-white px-3 py-2.5 shadow-inner">
        <Search size={16} className="shrink-0 text-black/40" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search options by business name, type, or address..."
          aria-label="Search for a business by name or location"
          className="w-full bg-transparent text-sm text-black placeholder:text-black/40 focus:outline-none"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="text-xs text-black/40 hover:text-black shrink-0 px-1"
          >
            Clear
          </button>
        )}
      </div>

      {/* Status banner */}
      <div className="mt-2.5 flex items-center justify-between text-[11px] text-black/60 px-1">
        {geoStatus === "ready" && (
          <span className="flex items-center gap-1 text-emerald-700 font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            GPS active · Sorted by live distance ({Math.round(locationAccuracy)} m accuracy)
          </span>
        )}
        {geoStatus === "checking" && (
          <span className="flex items-center gap-1 text-amber-700">
            <Loader2 size={12} className="animate-spin" /> Detecting device location...
          </span>
        )}
        {geoStatus === "denied" && (
          <span className="text-black/50">
            Location access off · Enable precise location for proximity sorting
          </span>
        )}
        {geoStatus === "imprecise" && (
          <span className="text-amber-800">
            Location accuracy is about {Math.round(locationAccuracy)} m · turn on Precise Location
          </span>
        )}
        {loadingOsm && (
          <span className="flex items-center gap-1 text-blue-700">
            <Loader2 size={12} className="animate-spin" /> Loading OpenStreetMap venues...
          </span>
        )}
        <button
          onClick={acquireLocation}
          className="ml-auto text-[11px] font-semibold text-amber-900 hover:text-black hover:underline cursor-pointer"
        >
          {geoStatus === "denied" ? "📍 Enable Location" : "🔄 Refresh GPS"}
        </button>
      </div>

      {/* Closest Business Spotlight Card */}
      {closestBusiness && !query.trim() && categoryFilter === "all" && (
        <div className="mt-3.5 rounded-2xl border-2 border-amber-500/50 bg-gradient-to-r from-amber-500/15 via-amber-400/10 to-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/25 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-950">
              📍 GPS Proximity Match
            </span>
            <span className="text-[11px] font-bold text-amber-950">
              {formatDistance(closestBusiness.distance)}
            </span>
          </div>
          <div className="mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-extrabold text-black leading-tight">
                {closestBusiness.name}
              </h3>
              <p className="text-xs text-black/70 mt-0.5">
                {VENUE_TYPES[closestBusiness.venueType]?.label || closestBusiness.venueType} · {closestBusiness.address}
              </p>
            </div>
            <button
              onClick={() => onSelect(closestBusiness)}
              className="shrink-0 rounded-xl bg-[#0f172a] px-4 py-2.5 text-xs font-extrabold text-[#ffd44f] transition hover:bg-[#1e293b]"
            >
              Enter {closestBusiness.name} →
            </button>
          </div>
        </div>
      )}

      {/* Options Directory Grid */}
      <div className="mt-3 max-h-80 overflow-y-auto pr-1">
        {processed.length === 0 ? (
          <div className="rounded-2xl bg-black/5 px-4 py-6 text-center text-xs text-black/60">
            <p className="font-semibold text-black/80">No businesses found matching "{query}"</p>
            <p className="mt-1 text-black/50">Try clearing your search or registering a new business below.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            {processed.map((b) => (
              <div
                key={b.id || b.osmId || b.name}
                onClick={() => onSelect(b)}
                className="group flex cursor-pointer flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white p-3.5 shadow-sm transition hover:border-black/30 hover:shadow-md"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="truncate text-sm font-bold text-black group-hover:text-amber-900 transition">
                      {b.name}
                    </span>
                    <span className="rounded-md bg-black/5 px-2 py-0.5 text-[10px] font-semibold text-black/60">
                      {VENUE_TYPES[b.venueType]?.label || b.venueType}
                    </span>
                    {b.verified && (
                      <span className="flex items-center gap-0.5 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                        <ShieldCheck size={11} /> Verified
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-black/60">
                    {b.address || "Address on file"}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-black/50 flex-wrap">
                    {b.tagline && (
                      <span className="font-medium text-black/70">
                        {b.tagline}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-amber-800 font-semibold">
                      <Zap size={11} /> Instant Safety Team Signal
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:flex-col sm:items-end gap-2 shrink-0 border-t sm:border-t-0 border-black/5 pt-2 sm:pt-0">
                  {b.distance != null && (
                    <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-900">
                      {formatDistance(b.distance)}
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(b);
                    }}
                    className="rounded-xl bg-black/5 px-3 py-1.5 text-xs font-bold text-black transition group-hover:bg-[#0f172a] group-hover:text-[#ffd44f]"
                  >
                    Select
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {onRegister && (
        <button
          onClick={onRegister}
          className="mt-4 w-full rounded-2xl border border-dashed border-black/25 bg-black/5 px-3 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-black/70 transition hover:border-black/50 hover:bg-black/10 hover:text-black"
        >
          Own a business? Register it here
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------
// Business registration — a manager searches OpenStreetMap for their
// business (or drops a GPS pin / types the address) once, and every
// patron afterward finds them automatically via VenueFinder above.
// ---------------------------------------------
function BusinessOnboarding({ onCreate, onCancel }) {
  const [name, setName] = useState("");
  const [venueType, setVenueType] = useState(DEFAULT_VENUE_TYPE);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [picked, setPicked] = useState(null);
  const [manualAddress, setManualAddress] = useState("");

  const runSearch = async () => {
    if (!name.trim()) return;
    setSearching(true);
    setSearchError("");
    setPicked(null);
    try {
      let coords = null;
      if (navigator.geolocation) {
        coords = await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (position) => resolve({ lat: position.coords.latitude, lon: position.coords.longitude }),
            () => resolve(null),
            { timeout: 6000 }
          );
        });
      }
      const found = await searchPlaces(name, coords || {});
      setResults(found);
      if (found.length === 0) setSearchError("No matches found on OpenStreetMap — enter the address manually below.");
    } catch {
      setSearchError("Search failed — enter the address manually below.");
    } finally {
      setSearching(false);
    }
  };

  const useMyGps = () => {
    if (!navigator.geolocation) {
      setSearchError("Location services aren't available on this device");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPicked({
          name: name.trim() || "My business",
          address: manualAddress.trim() || "GPS location",
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          source: "gps",
        });
      },
      () => setSearchError("Couldn't get your location — check location permissions"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const submit = () => {
    if (!name.trim() || !picked) return;
    onCreate({
      name: name.trim(),
      venueType,
      address: picked.address,
      lat: picked.lat,
      lng: picked.lng,
      source: picked.source || "osm",
    });
  };

  return (
    <div className="mt-10 w-full max-w-xl rounded-3xl border border-black/15 bg-white/95 p-5 text-left shadow-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/60">Register your business</p>
      <p className="mt-1 text-[11px] text-black/50">
        This makes you findable to patrons by name and distance — no per-table QR codes needed.
      </p>

      <label className="mt-4 block text-[11px] font-medium text-black/60">
        Business name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. The Copper Owl"
          className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-black"
        />
      </label>

      <label className="mt-3 block text-[11px] font-medium text-black/60">
        Venue type
        <select
          value={venueType}
          onChange={(e) => setVenueType(e.target.value)}
          className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-black"
        >
          {Object.entries(VENUE_TYPES).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.label}</option>
          ))}
        </select>
      </label>

      <button
        onClick={runSearch}
        disabled={!name.trim() || searching}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#0f172a] px-3 py-2 text-xs font-semibold text-[#ffd44f] disabled:opacity-40"
      >
        {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
        Search OpenStreetMap for this business
      </button>

      {results.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {results.map((r) => (
            <button
              key={r.osmId}
              onClick={() => setPicked({ ...r, source: "osm" })}
              className={`block w-full rounded-lg border px-3 py-2 text-left text-[11px] ${
                picked?.osmId === r.osmId ? "border-black bg-black/5" : "border-black/15"
              }`}
            >
              <span className="block font-semibold text-black">{r.name}</span>
              <span className="block text-black/50">{r.address}</span>
            </button>
          ))}
        </div>
      )}

      {searchError && <p className="mt-2 text-[11px] text-red-600">{searchError}</p>}

      <div className="mt-3 border-t border-black/10 pt-3">
        <p className="text-[11px] font-medium text-black/60">Can't find it? Use your GPS location instead</p>
        <input
          value={manualAddress}
          onChange={(e) => setManualAddress(e.target.value)}
          placeholder="Address (optional)"
          className="mt-1.5 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-black"
        />
        <button
          onClick={useMyGps}
          className="mt-1.5 w-full rounded-lg border border-black/20 px-3 py-2 text-xs font-medium text-black/70 hover:border-black/40"
        >
          Use my current GPS location
        </button>
      </div>

      {picked && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
          Selected: {picked.name} — {picked.address}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-lg border border-black/15 px-3 py-2 text-xs font-medium text-black/60">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={!name.trim() || !picked}
          className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-neutral-950 disabled:opacity-40"
        >
          Create business
        </button>
      </div>
    </div>
  );
}

function CampusLanding({ businesses, onEnter }) {
  const [showRegister, setShowRegister] = useState(false);
  const [showCampusChoice, setShowCampusChoice] = useState(false);

  return (
    <section className="relative min-h-screen overflow-hidden bg-[#f5f8f5] text-[#21322b]">
      <a
        href="tel:911"
        aria-label="Call 911 for a serious emergency"
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl border border-red-400/40 bg-red-600 px-3 py-2.5 text-white shadow-lg shadow-red-950/30 transition hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-300"
      >
        <PhoneCall size={18} aria-hidden="true" />
        <span className="text-sm font-semibold">Call 911</span>
      </a>
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(47,143,107,0.18) 1px, transparent 0)",
          backgroundSize: "10px 10px",
        }}
      />

      {HERO_PORTRAITS.map((portrait, index) => (
        <div
          key={portrait.src}
          className={`absolute z-10 animate-pulse rounded-full border-4 border-white bg-neutral-200 p-1 shadow-[0_16px_36px_rgba(0,0,0,0.28)] ${portrait.className}`}
          style={{ animationDuration: `${6 + index * 0.7}s` }}
        >
          <img
            src={portrait.src}
            alt={portrait.alt}
            className="h-full w-full rounded-full object-cover"
            loading="lazy"
          />
        </div>
      ))}

      <div className="relative z-20 mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-6 py-16 text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.35em] text-black/70">
          SafeTab · safety support
        </p>
        <h1
          className="text-5xl font-black uppercase leading-[0.92] sm:text-7xl"
          style={{ fontFamily: "'Archivo Black', Impact, sans-serif" }}
        >
          Stay safer
          <br />
          wherever
          <br />
          you are
        </h1>
        <p className="mt-5 text-2xl font-semibold leading-tight text-black/90 sm:text-4xl">
          Quiet help when someone needs it most.
          <br />
          Fast. Clear. Ready.
        </p>

        {!showCampusChoice ? (
          <div className="mt-8 w-full max-w-2xl rounded-3xl border border-black/15 bg-white/95 p-6 text-left shadow-2xl backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-black/70">
              Campus safety
            </p>
            <h2 className="mt-2 text-2xl font-black text-black sm:text-3xl">
              Quick, quiet support for campus communities
            </h2>
            <p className="mt-3 text-sm leading-6 text-black/70">
              Help people request assistance immediately and route them to the right campus staff without confusion or delay.
            </p>
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-left text-[11px] leading-5 text-red-900">
              <p className="font-bold">For emergencies, call 911.</p>
              <p className="mt-0.5">SafeTab is a support and dispatch tool, not an emergency replacement. Share only the information needed to help responders.</p>
            </div>

            <button
              type="button"
              onClick={() => setShowCampusChoice(true)}
              className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-[#1f7d58] px-5 py-4 text-base font-bold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-[#1a6d4d]"
            >
              Enter campus safety
            </button>
          </div>
        ) : (
          <div className="mt-8 w-full max-w-2xl rounded-3xl border border-black/15 bg-white/95 p-5 text-left shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-black/70">
                  Campus safety
                </p>
                <h2 className="mt-2 text-2xl font-black text-black sm:text-3xl">
                  Choose your campus
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowCampusChoice(false)}
                className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-black/70 transition hover:bg-black/5"
              >
                Back
              </button>
            </div>
            <p className="mt-2 text-sm text-black/70">
              Select the campus where you need support so the app can route you to the right safety response flow.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {CAMPUS_OPTIONS.map((campus) => (
                <button
                  key={campus.id}
                  type="button"
                  onClick={() => onEnter({ business: { ...campus, name: campus.name, venueType: "campus", id: campus.id } })}
                  className="group rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 shadow-sm hover:shadow-md"
                  style={{
                    borderColor: campus.borderColor,
                    backgroundColor: campus.lightBg,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em]"
                      style={{ backgroundColor: campus.badgeBg, color: campus.badgeText }}
                    >
                      {campus.shortName}
                    </span>
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: campus.color }}
                    />
                  </div>
                  <p className="mt-3 text-xl font-black" style={{ color: campus.darkColor }}>
                    {campus.name}
                  </p>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => onEnter({ demoVenue: "campus", location: "Student Center South · Main Lounge" })}
              className="mt-4 flex w-full items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-left transition hover:bg-amber-500/20"
            >
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-800">
                  ⚡ 1-Click Client Demo Mode
                </p>
                <p className="text-xs font-semibold text-neutral-900 mt-0.5">
                  Launch pre-configured UH campus safety session
                </p>
              </div>
              <span className="rounded-lg bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-neutral-950 shrink-0">
                Launch Demo
              </span>
            </button>

            <div className="mt-6 grid gap-4 border-t border-black/10 pt-5 text-sm text-black/75 sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">
                  Why SafeTab
                </p>
                <p className="mt-2 leading-6">
                  SafeTab helps students, staff, and families request help quickly and connect with the right campus responders.
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">
                  How it works
                </p>
                <ul className="mt-2 space-y-1.5 leading-6 text-black/75">
                  <li>• Select your campus</li>
                  <li>• Choose the reason for support</li>
                  <li>• Alert campus staff in real time</li>
                </ul>
              </div>
            </div>

            <div className="mt-5 grid gap-4 border-t border-black/10 pt-5 text-sm text-black/75 sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">
                  Staff roles
                </p>
                <p className="mt-2 leading-6">
                  Resident Advisors, teaching assistants, faculty, family members, security, and campus administrators.
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">
                  Pilot program
                </p>
                <p className="mt-2 leading-6">
                  Try SafeTab for 60 days free, then decide if it fits your campus needs.
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-[#dfece4] bg-[#f7faf8] px-4 py-3 text-sm text-black/75">
              <p className="font-semibold text-black">Contact</p>
              <p className="mt-1">Email: tfkelleher3@gmail.com</p>
            </div>
          </div>
        )}

        {showRegister && !showCampusChoice ? (
          <BusinessOnboarding
            onCreate={(newBusiness) => {
              setShowRegister(false);
              onEnter({ newBusiness });
            }}
            onCancel={() => setShowRegister(false)}
          />
        ) : null}

        {!showCampusChoice && !showRegister ? (
          <VenueFinder
            businesses={businesses}
            onSelect={(business) => onEnter({ business })}
            onRegister={() => setShowRegister(true)}
          />
        ) : null}
      </div>
    </section>
  );
}

function LocationPicker({ value, onChange, venueConfig, businessLocation }) {
  const [open, setOpen] = useState(false);
  const [numberInput, setNumberInput] = useState("");
  const [otherInput, setOtherInput] = useState("");
  const [showOther, setShowOther] = useState(false);

  const displayLabel = value || "Select your location";
  const needsNumber = new Set(venueConfig.numberedOptions);
  const groups = businessLocation?.locationGroups || venueConfig.locationGroups;

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

          {groups.map((group) => (
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
function PatronView({ onSend, onCampusChange, venueConfig, initialLocation, businessLocation }) {
  const [location, setLocation] = useState(initialLocation || "");
  const [reason, setReason] = useState(venueConfig.reasons[0]);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [gpsStatus, setGpsStatus] = useState("checking");
  const [gpsMessage, setGpsMessage] = useState("Checking your location...");
  const holdTimer = useRef(null);
  const progressTimer = useRef(null);

  // reset selection whenever the active campus, initial location, or venue config changes
  useEffect(() => {
    setLocation(initialLocation || "");
    setSent(false);
    setMessage("");
    setReason(venueConfig.reasons[0]);
  }, [businessLocation?.id, initialLocation, venueConfig]);

  const checkGps = () => {
    if (!businessLocation?.lat || !businessLocation?.lng) {
      setGpsStatus("unavailable");
      setGpsMessage("Location verification optional.");
      return;
    }
    if (!navigator.geolocation) {
      setGpsStatus("unavailable");
      setGpsMessage("Location services not available on this device.");
      return;
    }
    setGpsStatus("checking");
    setGpsMessage("Verifying proximity...");

    const checkPos = (position) => {
      const toRadians = (degrees) => (degrees * Math.PI) / 180;
      const latitudeDelta = toRadians(position.coords.latitude - businessLocation.lat);
      const longitudeDelta = toRadians(position.coords.longitude - businessLocation.lng);
      const latitude = toRadians(businessLocation.lat);
      const distance = 3959 * 2 * Math.asin(Math.sqrt(
        Math.sin(latitudeDelta / 2) ** 2
          + Math.cos(latitude) * Math.cos(toRadians(position.coords.latitude))
          * Math.sin(longitudeDelta / 2) ** 2
      ));
      const withinRange = distance <= 0.35;
      setGpsStatus(withinRange ? "verified" : "outside");
      setGpsMessage(withinRange
        ? "✓ GPS Verified at venue"
        : `📍 Selected via proximity (${formatDistance(distance)})`);
    };

    navigator.geolocation.getCurrentPosition(
      checkPos,
      () => {
        navigator.geolocation.getCurrentPosition(
          checkPos,
          () => {
            setGpsStatus("unavailable");
            setGpsMessage("Location permission unverified");
          },
          { enableHighAccuracy: false, timeout: 5000 }
        );
      },
      { enableHighAccuracy: true, timeout: 3500 }
    );
  };

  useEffect(() => {
    checkGps();
  }, [businessLocation]);

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
      onSend?.({ location, reason, message: message.trim() });
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
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto px-5 pt-6 pb-8">
      {venueConfig === VENUE_TYPES.campus ? (
        <div>
          <p className="mb-2 text-xs font-medium text-neutral-500">Campus</p>
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-neutral-950 p-1">
            {CAMPUS_OPTIONS.map((campus) => {
              const selected = businessLocation?.id === campus.id;
              return (
                <button
                  key={campus.id}
                  type="button"
                  onClick={() => onCampusChange(campus)}
                  className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition ${
                    selected
                      ? "text-white shadow"
                      : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
                  }`}
                  style={selected ? { backgroundColor: campus.color } : {}}
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: selected ? "#ffffff" : campus.color }}
                  />
                  {campus.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onCampusChange(null)}
          className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-left transition hover:border-amber-400/60"
        >
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium text-neutral-200">
              {businessLocation?.name || "Selected business"}
            </span>
            <span className="block text-[11px] text-neutral-500">Change business</span>
          </span>
          <MapPin size={16} className="shrink-0 text-amber-400" aria-hidden="true" />
        </button>
      )}
      <div>
        <p className="text-neutral-500 text-xs uppercase tracking-wide mb-1">
          Step 1
        </p>
        <p className="text-neutral-200 text-sm mb-2">Where are you?</p>
        <LocationPicker
          value={location}
          onChange={setLocation}
          venueConfig={venueConfig}
          businessLocation={businessLocation}
        />
      </div>

      <div>
        <p className="text-neutral-500 text-xs uppercase tracking-wide mb-1">
          Step 2
        </p>
        <p className="text-neutral-200 text-sm mb-2">What's going on?</p>
        <div className="max-h-52 overflow-y-auto pr-1 grid grid-cols-1 gap-4">
          {(venueConfig.reasonGroups || [{ label: null, options: venueConfig.reasons }]).map(
            (group) => (
              <div key={group.label || "reasons"} className="grid grid-cols-1 gap-2">
                {group.label && (
                  <p className="text-[11px] uppercase tracking-wide text-neutral-500">
                    {group.label}
                  </p>
                )}
                {group.options.map((r) => (
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
            )
          )}
        </div>
      </div>

      <label className="block">
        <span className="mb-2 block text-sm text-neutral-200">Add a message <span className="text-neutral-500">(optional)</span></span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value.slice(0, 280))}
          maxLength={280}
          rows={3}
          placeholder="Share anything staff should know"
          className="w-full resize-none rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-amber-400 focus:outline-none"
        />
        <span className="mt-1 block text-right text-[11px] text-neutral-600">{message.length}/280</span>
      </label>

      <div className="flex flex-col items-center gap-2">
        {gpsMessage && (
          <p className={`text-[11px] font-medium ${
            gpsStatus === "verified" ? "text-emerald-400" : "text-amber-400/80"
          }`}>
            {gpsMessage}
          </p>
        )}
        <button
          onMouseDown={startHold}
          onMouseUp={cancelHold}
          onMouseLeave={cancelHold}
          onTouchStart={startHold}
          onTouchEnd={cancelHold}
          disabled={!location}
          className={`relative w-full overflow-hidden rounded-2xl py-4 font-medium text-center select-none ${
            !location
              ? "bg-neutral-800 text-neutral-600 cursor-not-allowed"
              : "bg-amber-500 text-neutral-900 cursor-pointer shadow-lg"
          }`}
        >
          <span
            className="absolute inset-0 bg-amber-300"
            style={{ width: `${progress}%`, transition: "width 30ms linear" }}
          />
          <span className="relative font-bold">
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
  { name: "Jordan", pin: "1234", role: "Campus Safety", area: "Library" },
  {
    name: "Priya",
    pin: "5678",
    role: "Resident Assistant (RA)",
    area: "Residence",
  },
  { name: "Marcus", pin: "0000", role: "Campus Security", area: "Outdoors" },
  { name: "Sam", pin: "1111", role: "Manager", area: "" },
];

function StaffLogin({ onAuth, onBootstrapAdmin, onSaveAdministrator, administratorAccount, staffSetupLoaded, venueConfig, staffRoster }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [signInMode, setSignInMode] = useState("staff");
  const [role, setRole] = useState(venueConfig.staffRoles?.[0] || "");
  const [area, setArea] = useState(venueConfig.staffAreas?.[0] || "");
  const [error, setError] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryName, setRecoveryName] = useState("");
  const [recoveryPin, setRecoveryPin] = useState("");
  const canRecover = administratorAccount?.ownerUid && auth.currentUser?.uid === administratorAccount.ownerUid;

  const submit = async () => {
    if (!staffSetupLoaded) return;
    const match = signInMode === "administrator"
      ? administratorAccount && name.trim().toLowerCase() === administratorAccount.name.toLowerCase() && pin === administratorAccount.pin
        ? { ...administratorAccount, role: "Administrator", area: venueConfig.staffAreas?.[0] || "All areas" }
        : null
      : staffRoster.find(
        (s) => s.name.toLowerCase() === name.trim().toLowerCase() && s.pin === pin
      );
    if (signInMode === "administrator" && !administratorAccount) {
      const claimed = await onBootstrapAdmin({ name: name.trim(), pin });
      if (claimed) onAuth(claimed);
      else {
        setError("This business has already been claimed by an administrator");
        setPin("");
      }
      return;
    }
    if (match) {
      setError("");
      // this click is a user gesture — use it to unlock audio playback
      try {
        getAudioCtx();
      } catch {
        // ignore; StaffView will surface a warning if chimes fail later
      }
      onAuth({ ...match, role: match.role, area: match.area });
    } else {
      setError(signInMode === "administrator" ? "Administrator name or PIN not recognized" : "Name or PIN not recognized");
      setPin("");
    }
  };

  const recoverAdministrator = () => {
    const nextName = recoveryName.trim();
    const nextPin = recoveryPin.replace(/\D/g, "").slice(0, 4);
    if (!canRecover || !nextName || nextPin.length !== 4) return;
    const account = { ...administratorAccount, name: nextName, pin: nextPin };
    onSaveAdministrator(account);
    onAuth({ ...account, role: "Administrator", area: venueConfig.staffAreas?.[0] || "All areas" });
  };

  return (
    <div className="flex flex-col h-full px-6 justify-center gap-4">
      <div className="text-center mb-2">
        <p className="text-amber-400 text-xs font-semibold tracking-wide mb-1">
          SAFETAB
        </p>
        <p className="text-neutral-100 font-medium">Staff sign-in</p>
        <p className="text-neutral-500 text-xs mt-1">
          Sign in to receive and respond to incoming requests
        </p>
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-neutral-950 p-1">
        <button
          type="button"
          onClick={() => { setSignInMode("staff"); setError(""); }}
          className={`rounded-md px-3 py-2 text-xs font-medium ${signInMode === "staff" ? "bg-neutral-800 text-neutral-100" : "text-neutral-500"}`}
        >
          Staff
        </button>
        <button
          type="button"
          onClick={() => { setSignInMode("administrator"); setError(""); }}
          className={`rounded-md px-3 py-2 text-xs font-medium ${signInMode === "administrator" ? "bg-amber-500 text-neutral-900" : "text-neutral-500"}`}
        >
          Administrator
        </button>
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={signInMode === "administrator" ? "Administrator name" : "Name"}
        className="rounded-xl bg-neutral-900 border border-neutral-700 px-4 py-3 text-sm text-neutral-100"
      />
      {signInMode === "staff" && venueConfig.staffRoles && (
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          aria-label="Staff role"
          className="rounded-xl bg-neutral-900 border border-neutral-700 px-4 py-3 text-sm text-neutral-100"
        >
          {venueConfig.staffRoles.map((staffRole) => (
            <option key={staffRole} value={staffRole}>
              {staffRole}
            </option>
          ))}
        </select>
      )}
      {signInMode === "staff" && venueConfig.staffAreas && (
        <select
          value={area}
          onChange={(e) => setArea(e.target.value)}
          aria-label="Assigned area"
          className="rounded-xl bg-neutral-900 border border-neutral-700 px-4 py-3 text-sm text-neutral-100"
        >
          {venueConfig.staffAreas.map((staffArea) => (
            <option key={staffArea} value={staffArea}>
              Assigned area: {staffArea}
            </option>
          ))}
        </select>
      )}
      {signInMode === "staff" && ["🗂️ Administrator", "Manager"].includes(role) && venueConfig.adminResponsibilities && (
        <div className="max-h-32 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-[11px] text-neutral-400">
          <p className="mb-2 text-neutral-200">
            {role === "Manager" ? "Manager scope" : "Administrator scope"}
          </p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {venueConfig.adminResponsibilities.map((responsibility) => (
              <p key={responsibility.label}>{responsibility.label}</p>
            ))}
          </div>
          <p className="mt-2 border-t border-neutral-800 pt-2 text-neutral-500">
            Competencies: {venueConfig.adminCompetencies.join(", ")}
          </p>
        </div>
      )}
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
        disabled={!staffSetupLoaded || !name || pin.length < 4}
        className={`rounded-xl py-3 text-sm font-medium ${
          !staffSetupLoaded || !name || pin.length < 4
            ? "bg-neutral-800 text-neutral-600"
            : "bg-amber-500 text-neutral-900"
        }`}
      >
        {!staffSetupLoaded
          ? "Loading sign-in..."
          : signInMode === "administrator" && !administratorAccount
            ? "Claim administrator access"
            : "Sign in"}
      </button>
      {signInMode === "administrator" && administratorAccount && (
        <div className="text-center">
          {!recoveryMode ? (
            <button type="button" onClick={() => { setRecoveryMode(true); setRecoveryName(administratorAccount.name || ""); setError(""); }} className="text-[11px] text-amber-400 hover:underline">
              Forgot username or PIN?
            </button>
          ) : canRecover ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-left">
              <p className="text-[11px] text-neutral-300">Set a new administrator name and four-digit PIN on this trusted device.</p>
              <input value={recoveryName} onChange={(event) => setRecoveryName(event.target.value)} placeholder="New administrator name" aria-label="New administrator name" className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-100" />
              <input value={recoveryPin} onChange={(event) => setRecoveryPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="New PIN" aria-label="New PIN" inputMode="numeric" type="password" maxLength={4} className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs tracking-widest text-neutral-100" />
              <button type="button" onClick={recoverAdministrator} disabled={!recoveryName.trim() || recoveryPin.length !== 4} className="mt-2 w-full rounded-md bg-amber-500 px-2 py-1.5 text-[11px] font-semibold text-neutral-950 disabled:bg-neutral-800 disabled:text-neutral-600">Save new administrator login</button>
            </div>
          ) : (
            <p className="text-[11px] text-neutral-500">Recovery is available on the browser that originally claimed this college. Contact the current college owner from another device.</p>
          )}
        </div>
      )}
      <p className="text-neutral-700 text-[11px] text-center">
        {!staffSetupLoaded
          ? "Checking this business's saved access."
          : signInMode === "administrator" && !administratorAccount
          ? "The first administrator claim controls this business."
          : "Administrator-managed roster"}
      </p>
    </div>
  );
}

function AdministratorSetup({ venueConfig, staffRoster, onSaveRoster, dispatchSettings, onSaveSettings, administratorAccount, onSaveAdministrator }) {
  const [draftRoster, setDraftRoster] = useState(staffRoster);
  const [draftSettings, setDraftSettings] = useState(dispatchSettings);
  const [administratorName, setAdministratorName] = useState(administratorAccount?.name || "");
  const [administratorPin, setAdministratorPin] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => setDraftRoster(staffRoster), [staffRoster]);
  useEffect(() => setDraftSettings(dispatchSettings), [dispatchSettings]);
  useEffect(() => setAdministratorName(administratorAccount?.name || ""), [administratorAccount]);

  const updateMember = (index, key, value) => {
    setDraftRoster((current) => current.map((member, memberIndex) => (
      memberIndex === index ? { ...member, [key]: value } : member
    )));
  };

  const addMember = () => {
    setDraftRoster((current) => [
      ...current,
      { name: "", pin: "", role: venueConfig.staffRoles?.[0] || "Staff", area: venueConfig.staffAreas?.[0] || "All areas" },
    ]);
  };

  const saveRoster = () => {
    const cleaned = draftRoster
      .filter((member) => member.name.trim())
      .map((member) => ({ ...member, name: member.name.trim(), pin: member.pin.replace(/\D/g, "").slice(0, 4) }));
    onSaveRoster(cleaned);
    setDraftRoster(cleaned);
    setSaved("Roster saved");
    window.setTimeout(() => setSaved(""), 2200);
  };

  const saveSettings = () => {
    onSaveSettings(draftSettings);
    setSaved("Dispatch settings saved");
    window.setTimeout(() => setSaved(""), 2200);
  };

  const saveMonitorAssignments = () => {
    onSaveSettings(draftSettings);
    setSaved("Monitor assignments saved");
    window.setTimeout(() => setSaved(""), 2200);
  };

  const saveAdministrator = () => {
    const name = administratorName.trim();
    const pin = administratorPin.replace(/\D/g, "").slice(0, 4);
    if (!name || pin.length !== 4) return;
    onSaveAdministrator({ name, pin });
    setAdministratorPin("");
    setSaved("Administrator updated");
    window.setTimeout(() => setSaved(""), 2200);
  };

  return (
    <div className="mx-4 mb-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-amber-200">Administrator setup</p>
          <p className="mt-0.5 text-[11px] text-neutral-500">Manage who receives signals and how quickly dispatch escalates.</p>
        </div>
        {saved && <span className="text-[11px] text-emerald-400">{saved}</span>}
      </div>

        <div className="mt-3 border-t border-neutral-800 pt-3">
          <p className="text-xs font-medium text-neutral-200">Change administrator</p>
          <p className="mt-0.5 text-[11px] text-neutral-500">Replace the current administrator without opening Firebase.</p>
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_58px] gap-2">
            <input value={administratorName} onChange={(event) => setAdministratorName(event.target.value)} placeholder="New administrator name" aria-label="New administrator name" className="min-w-0 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-100" />
            <input value={administratorPin} onChange={(event) => setAdministratorPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="PIN" inputMode="numeric" type="password" maxLength={4} aria-label="New administrator PIN" className="min-w-0 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs tracking-widest text-neutral-100" />
          </div>
          <button type="button" onClick={saveAdministrator} disabled={!administratorName.trim() || administratorPin.length !== 4} className="mt-2 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-semibold text-neutral-950 disabled:bg-neutral-800 disabled:text-neutral-600">
            Save new administrator
          </button>
        </div>

      <div className="mt-3 border-t border-neutral-800 pt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-neutral-200">Staff roster</p>
            <p className="mt-0.5 text-[11px] text-neutral-500">Create and update staff sign-ins with a name and four-digit PIN.</p>
          </div>
          <button type="button" onClick={addMember} className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300">
            <UserPlus size={13} /> Add staff
          </button>
        </div>
        <div className="space-y-2">
          {draftRoster.map((member, index) => (
            <div key={`${member.name}-${index}`} className="grid grid-cols-[minmax(0,1fr)_58px_28px] gap-2 rounded-lg bg-neutral-900 p-2">
              <input value={member.name} onChange={(event) => updateMember(index, "name", event.target.value)} placeholder="Name" aria-label={`Staff ${index + 1} name`} className="min-w-0 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-100" />
              <input value={member.pin} onChange={(event) => updateMember(index, "pin", event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="PIN" inputMode="numeric" maxLength={4} aria-label={`${member.name || "Staff"} PIN`} className="min-w-0 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs tracking-widest text-neutral-100" />
              <button type="button" onClick={() => setDraftRoster((current) => current.filter((_, memberIndex) => memberIndex !== index))} aria-label={`Remove ${member.name || "staff member"}`} title="Remove staff member" className="flex items-center justify-center text-neutral-500 hover:text-red-400">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={saveRoster} className="mt-2 flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-semibold text-neutral-950 hover:bg-amber-400">
          <Save size={13} /> Save roster
        </button>
      </div>

      <div className="mt-3 border-t border-neutral-800 pt-3">
        <p className="text-xs font-medium text-neutral-200">Monitor assignments</p>
        <p className="mt-0.5 text-[11px] text-neutral-500">Choose who watches incoming requests first and who takes over if needed.</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-[11px] text-neutral-500">Primary monitor
            <select value={draftSettings.primaryMonitor || ""} onChange={(event) => setDraftSettings({ ...draftSettings, primaryMonitor: event.target.value })} className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-100">
              <option value="">Select primary</option>
              {draftRoster.filter((member) => member.name.trim()).map((member) => <option key={`primary-${member.name}`} value={member.name}>{member.name}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-neutral-500">Backup monitor
            <select value={draftSettings.backupMonitor || ""} onChange={(event) => setDraftSettings({ ...draftSettings, backupMonitor: event.target.value })} className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-100">
              <option value="">Select backup</option>
              {draftRoster.filter((member) => member.name.trim()).map((member) => <option key={`backup-${member.name}`} value={member.name}>{member.name}</option>)}
            </select>
          </label>
        </div>
        <p className="mt-1 text-[11px] text-neutral-600">The primary watches the queue first; the backup takes over when the primary is unavailable.</p>
        <button type="button" onClick={saveMonitorAssignments} disabled={!draftSettings.primaryMonitor || !draftSettings.backupMonitor} className="mt-2 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-semibold text-neutral-950 disabled:bg-neutral-800 disabled:text-neutral-600">
          Save monitor assignments
        </button>
      </div>

      <div className="mt-4 border-t border-neutral-800 pt-3">
        <p className="text-xs font-medium text-neutral-200">{venueConfig === VENUE_TYPES.campus ? "Campus dispatch settings" : "Dispatch settings"}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-[11px] text-neutral-500">Escalate after (seconds)
            <input type="number" min="10" max="600" value={draftSettings.escalationSeconds} onChange={(event) => setDraftSettings({ ...draftSettings, escalationSeconds: Number(event.target.value) })} className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-100" />
          </label>
          <label className="text-[11px] text-neutral-500">Repeat alert every (seconds)
            <input type="number" min="10" max="600" value={draftSettings.repeatSeconds} onChange={(event) => setDraftSettings({ ...draftSettings, repeatSeconds: Number(event.target.value) })} className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-100" />
          </label>
        </div>
        <button type="button" onClick={saveSettings} className="mt-2 flex items-center gap-1 rounded-lg border border-neutral-700 px-3 py-1.5 text-[11px] font-medium text-neutral-300 hover:border-amber-400 hover:text-amber-300">
          <Save size={13} /> Save settings
        </button>
      </div>
    </div>
  );
}

function AdminView({
  staffMember,
  venueConfig,
  businessLocation,
  onClaimLocation,
  locationError,
  staffRoster,
  onSaveRoster,
  administratorAccount,
  onSaveAdministrator,
  dispatchSettings,
  onSaveSettings,
  allowBusinessClaim = true,
}) {
  const isAdministrator = ["🗂️ Administrator", "Administrator"].includes(staffMember.role);
  const hasBusinessCoordinates = businessLocation?.lat != null && businessLocation?.lng != null;
  const [claimMode, setClaimMode] = useState(businessLocation?.source === "manual" ? "manual" : "gps");
  const [businessName, setBusinessName] = useState(businessLocation?.businessName || "");
  const [businessAddress, setBusinessAddress] = useState(businessLocation?.address || "");
  const [claimMessage, setClaimMessage] = useState("");

  const submitManualClaim = () => {
    if (!businessName.trim() || !businessAddress.trim()) return;
    setClaimMessage("Saving business details...");
    onClaimLocation({
      mode: "manual",
      businessName,
      address: businessAddress,
      onSuccess: () => setClaimMessage("Business details saved."),
    });
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 pb-6">
      <div className="px-1 py-5">
        <p className="text-neutral-200 text-sm font-medium">{venueConfig === VENUE_TYPES.campus ? "Campus administrator workspace" : "Administrator workspace"}</p>
        <p className="mt-1 text-xs text-neutral-500">
          {venueConfig === VENUE_TYPES.campus
            ? "Manage campus staff access, assign response roles, and keep the university safety team organized."
            : "Manage access, verify the campus or business location, and organize the response team."}
        </p>
      </div>

      {allowBusinessClaim && (
        <div className="mb-3 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-200">Claim this business</p>
              {businessLocation ? (
                <p className="mt-1 text-[11px] text-neutral-400">
                  {businessLocation.source === "manual"
                    ? `${businessLocation.businessName} · ${businessLocation.address}`
                    : hasBusinessCoordinates
                      ? `GPS location selected at ${businessLocation.lat.toFixed(5)}, ${businessLocation.lng.toFixed(5)}`
                      : "Business location has not been verified yet."}
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-neutral-400">
                  Select the business from your GPS location or enter it manually.
                </p>
              )}
              <p className="mt-2 text-[11px] text-neutral-300">
                The first valid administrator claim becomes the owner for this business. After that, the staff roster can be managed here.
              </p>
            </div>
            <MapPin size={18} className="mt-0.5 shrink-0 text-amber-400" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-neutral-950/60 p-1">
            <button
              onClick={() => setClaimMode("gps")}
              className={`rounded-md px-2 py-2 text-[11px] font-medium ${claimMode === "gps" ? "bg-amber-500 text-neutral-900" : "text-neutral-400"}`}
            >
              Use GPS location
            </button>
            <button
              onClick={() => setClaimMode("manual")}
              className={`rounded-md px-2 py-2 text-[11px] font-medium ${claimMode === "manual" ? "bg-amber-500 text-neutral-900" : "text-neutral-400"}`}
            >
              Enter manually
            </button>
          </div>
          {claimMode === "gps" ? (
            <button
              onClick={() => {
                setClaimMessage("Requesting device location...");
                onClaimLocation({
                  mode: "gps",
                  onSuccess: () => setClaimMessage("GPS business location saved."),
                });
              }}
              className="mt-3 w-full rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-neutral-900"
            >
              {businessLocation ? "Update from my GPS location" : "Find business from my GPS location"}
            </button>
          ) : (
            <div className="mt-3 space-y-2">
              <input
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                placeholder="Business name"
                aria-label="Business name"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-neutral-100"
              />
              <input
                value={businessAddress}
                onChange={(event) => setBusinessAddress(event.target.value)}
                placeholder="Business address"
                aria-label="Business address"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-neutral-100"
              />
              <button
                onClick={submitManualClaim}
                disabled={!businessName.trim() || !businessAddress.trim()}
                className="w-full rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-neutral-900 disabled:bg-neutral-800 disabled:text-neutral-600"
              >
                {businessLocation ? "Update manual business details" : "Claim with these details"}
              </button>
            </div>
          )}
          {claimMessage && <p className="mt-1.5 text-[11px] text-emerald-400">{claimMessage}</p>}
          {locationError && <p className="mt-1.5 text-[11px] text-red-400">{locationError}</p>}
        </div>
      )}

      {isAdministrator && (
        <AdministratorSetup
          venueConfig={venueConfig}
          staffRoster={staffRoster}
          onSaveRoster={onSaveRoster}
          administratorAccount={administratorAccount}
          onSaveAdministrator={onSaveAdministrator}
          dispatchSettings={dispatchSettings}
          onSaveSettings={onSaveSettings}
        />
      )}

      <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3">
        <p className="text-sm font-medium text-neutral-200">{venueConfig === VENUE_TYPES.campus ? "Campus response roles" : "Team roles"}</p>
        <div className="mt-3 space-y-3 text-[11px]">
          <div>
            <p className="text-amber-300">{venueConfig === VENUE_TYPES.campus ? "Campus administrator" : "Administrator"}</p>
            <p className="mt-1 text-neutral-500">{venueConfig === VENUE_TYPES.campus ? "Owns the campus roster, manages staff PINs, and keeps the response team aligned across campus services." : "Owns the roster, controls staff PINs, and manages the verified location and response settings."}</p>
          </div>
          <div>
            <p className="text-sky-300">{venueConfig === VENUE_TYPES.campus ? "Campus manager" : "Manager"}</p>
            <p className="mt-1 text-neutral-500">{venueConfig === VENUE_TYPES.campus ? "Coordinates the campus response flow and helps route requests to the right service area." : "Claims or updates the location and helps coordinate staff response during the day."}</p>
          </div>
          <div>
            <p className="text-neutral-300">{venueConfig === VENUE_TYPES.campus ? "Safety staff" : "Staff"}</p>
            <p className="mt-1 text-neutral-500">{venueConfig === VENUE_TYPES.campus ? "Receives campus alerts, claims incoming concerns, and resolves incidents in real time." : "Receives alerts, claims incoming requests, and closes resolved incidents."}</p>
          </div>
        </div>
      </div>
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
  records,
  onAck,
  onSaveMemo,
  onSaveRecord,
  onSeedDemoRecords,
  onClaim,
  onUnclaim,
  staffMember,
  onSignOut,
  soundReady,
  venueConfig,
  onAreaChange,
  onOpenAdmin,
  dispatchSettings,
}) {
  const alertedIds = useRef(new Set());
  const lastEscalation = useRef({});
  const [alertStatus, setAlertStatus] = useState(null);
  const [staffPanel, setStaffPanel] = useState("queue");

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
  const areaMatches = (signal) => {
    if (!staffMember.area || staffMember.area === "All campus" || staffMember.area === "All areas") return true;
    const areaLocationMap = {
      Library: ["Study Room", "Main Floor", "Stacks", "Quiet Zone"],
      "Academic Buildings": ["Lecture Hall", "Classroom", "Hallway", "Lab"],
      Residence: ["Dorm Room", "Dorm Hallway", "Common Room", "Laundry Room"],
      Outdoors: ["Quad", "Parking Lot", "Parking Garage", "Bus Stop", "Path / Walkway"],
      Facilities: ["Restroom", "Gym / Rec Center", "Dining Hall"],
    };
    const groupLocationMap = Object.fromEntries(
      (venueConfig.locationGroups || []).map((g) => [g.label, g.options])
    );
    const locations = areaLocationMap[staffMember.area] || groupLocationMap[staffMember.area];
    return locations?.some((location) => signal.location.startsWith(location));
  };
  const orderedSignals = [...signals].sort(
    (first, second) => Number(areaMatches(second)) - Number(areaMatches(first))
  );

  if (staffPanel === "records") {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-amber-400" />
            <div>
              <p className="text-neutral-200 text-sm font-medium">Records</p>
              <p className="text-neutral-500 text-xs mt-0.5">Closed requests and follow-up notes</p>
            </div>
          </div>
          <button onClick={onSignOut} className="text-neutral-600 text-xs underline">
            {staffMember.name} · Sign out
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1 border-b border-neutral-800 bg-neutral-950 p-1">
          <button onClick={() => setStaffPanel("queue")} className="rounded-md px-3 py-2 text-xs font-medium text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200">
            Live queue
          </button>
          <button className="rounded-md bg-amber-500 px-3 py-2 text-xs font-medium text-neutral-900 shadow-sm shadow-amber-600/20">
            Records · {records.length}
          </button>
        </div>
        <RecordsView records={records} onSaveMemo={onSaveMemo} onSaveRecord={onSaveRecord} onSeedDemoRecords={onSeedDemoRecords} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-6 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio size={16} className="text-amber-400" />
          <div>
            <p className="text-neutral-200 text-sm font-medium">
              {venueConfig.staffView.title}
            </p>
            <p className="text-neutral-500 text-xs mt-0.5">
              {staffMember.role && `${staffMember.role} · `}
              {unclaimedCount} awaiting response · {signals.filter((s) => !s.ack).length} active
            </p>
            {venueConfig.staffAreas && (
              <select
                value={staffMember.area}
                onChange={(e) => onAreaChange(e.target.value)}
                aria-label="Active staff area"
                className="mt-2 max-w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-300"
              >
                {venueConfig.staffAreas.map((staffArea) => (
                  <option key={staffArea} value={staffArea}>
            {(dispatchSettings.primaryMonitor || dispatchSettings.backupMonitor) && (
              <p className="mt-2 text-[10px] text-neutral-600">
                Primary: {dispatchSettings.primaryMonitor || "Not assigned"} · Backup: {dispatchSettings.backupMonitor || "Not assigned"}
              </p>
            )}
                    Area: {staffArea}
                  </option>
                ))}
              </select>
            )}
          </div>
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
      <div className="mx-4 mb-3 grid grid-cols-2 gap-1 rounded-lg bg-neutral-950 p-1">
        <button className="rounded-md bg-amber-500 px-3 py-2 text-xs font-medium text-neutral-900 shadow-sm shadow-amber-600/20">
          Live queue · {unclaimedCount}
        </button>
        <button onClick={() => setStaffPanel("records")} className="rounded-md px-3 py-2 text-xs font-medium text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200">
          Records · {records.length}
        </button>
      </div>
      {alertStatus && !alertStatus.audioOk && (
        <div className="mx-4 mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          Audio failed to play — check device volume/silent mode. Vibration{" "}
          {alertStatus.vibrateOk ? "did" : "also did not"} fire.
        </div>
      )}

      {onOpenAdmin && (
        <button
          onClick={onOpenAdmin}
          className="mx-4 mb-3 rounded-lg border border-amber-500/50 px-3 py-2 text-xs font-medium text-amber-300 hover:bg-amber-500/10"
        >
          Open Admin workspace
        </button>
      )}

      <div className="flex-1 overflow-y-auto px-4 space-y-3 pb-6">
        {signals.length === 0 && (
          <p className="text-neutral-600 text-sm px-2 pt-8 text-center">
            {venueConfig.staffView.emptyLabel}
          </p>
        )}
        {orderedSignals.map((s) => {
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
                  {s.message && (
                    <p className="mt-2 whitespace-pre-wrap rounded-md bg-neutral-950/50 px-2 py-1.5 text-xs text-neutral-300">
                      {s.message}
                    </p>
                  )}
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
                      {venueConfig.staffView.claimLabel}
                    </button>
                  )}
                  {!s.ack && s.claimedBy && isMine && (
                    <>
                      <button
                        onClick={() => onAck(s.id)}
                        className="flex items-center gap-1 rounded-lg bg-emerald-600 text-white text-xs font-medium px-3 py-1.5 hover:bg-emerald-700"
                      >
                        <Check size={14} /> {venueConfig.staffView.resolveLabel}
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

const SAMPLE_DEMO_RECORDS = [
  {
    id: "record-demo-1",
    location: "Student Center South · Main Lounge",
    reason: "Noise & Conduct Concerns",
    message: "Group playing loud music late near quiet study tables",
    closedBy: "Jordan (Campus Safety)",
    closedAt: Date.now() - 2 * 60 * 60 * 1000,
    time: Date.now() - 2.5 * 60 * 60 * 1000,
    memo: "Spoke with group and reminded them of quiet hours after 10 PM. Music turned off peacefully.",
  },
  {
    id: "record-demo-2",
    location: "MD Anderson Library · 3rd Floor",
    reason: "Safety & Security Check",
    message: "Unattended laptop and backpack at desk for over an hour",
    closedBy: "Priya (RA)",
    closedAt: Date.now() - 24 * 60 * 60 * 1000,
    time: Date.now() - 25 * 60 * 60 * 1000,
    memo: "Secured items at lost and found desk. Student returned at 3:15 PM and safely claimed belongings.",
  },
  {
    id: "record-demo-3",
    location: "Cougar Village · Residence Entrance",
    reason: "Safety Escort Request",
    message: "Finished late lab session, requested escort to Lot 4A",
    closedBy: "Marcus (Campus Security)",
    closedAt: Date.now() - 48 * 60 * 60 * 1000,
    time: Date.now() - 48.5 * 60 * 60 * 1000,
    memo: "Accompanied student to vehicle safely. Escort completed without incident.",
  },
];

function RecordsView({ records, onSaveMemo, onSaveRecord, onSeedDemoRecords }) {
  const [draftMemos, setDraftMemos] = useState({});
  const [draftDetails, setDraftDetails] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [savedMemoId, setSavedMemoId] = useState(null);

  const handleSave = (id, memo) => {
    onSaveMemo(id, memo);
    setSavedMemoId(id);
    setTimeout(() => {
      setSavedMemoId(null);
    }, 2000);
  };

  const handleSaveDetails = (record) => {
    const details = draftDetails[record.id] || {};
    onSaveRecord(record.id, {
      severity: details.severity || record.severity || "standard",
      actionTaken: details.actionTaken ?? record.actionTaken ?? "",
      followUpRequired: details.followUpRequired ?? record.followUpRequired ?? false,
    });
  };

  const exportCSV = () => {
    if (records.length === 0) return;
    const headers = ["ID", "Location", "Reason", "Severity", "Patron Note", "Closed By", "Closed Time", "Follow-Up Required", "Action Taken", "Follow-Up Memo"];
    const rows = records.map((r) => [
      `"${r.id || ""}"`,
      `"${(r.location || "").replace(/"/g, '""')}"`,
      `"${(r.reason || "").replace(/"/g, '""')}"`,
      `"${r.severity || "standard"}"`,
      `"${(r.message || "").replace(/"/g, '""')}"`,
      `"${(r.closedBy || "staff").replace(/"/g, '""')}"`,
      `"${new Date(r.closedAt || r.time || Date.now()).toISOString()}"`,
      `"${r.followUpRequired ? "yes" : "no"}"`,
      `"${(r.actionTaken || "").replace(/"/g, '""')}"`,
      `"${(draftMemos[r.id] ?? r.memo ?? "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `safetab-incident-records-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredRecords = records.filter((r) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const memo = draftMemos[r.id] ?? r.memo ?? "";
    return (
      (r.location || "").toLowerCase().includes(query) ||
      (r.reason || "").toLowerCase().includes(query) ||
      (r.closedBy || "").toLowerCase().includes(query) ||
      (r.message || "").toLowerCase().includes(query) ||
      memo.toLowerCase().includes(query)
    );
  });

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-2.5 text-neutral-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search records by location, reason, staff..."
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900 pl-8 pr-3 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-600 focus:border-amber-400 focus:outline-none"
          />
        </div>
        {records.length > 0 && (
          <button
            type="button"
            onClick={exportCSV}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 transition shrink-0"
            title="Export records to CSV"
          >
            <Download size={13} /> Export CSV
          </button>
        )}
      </div>

      {records.length === 0 && (
        <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/40 p-6 text-center">
          <FileText size={28} className="mx-auto text-neutral-600 mb-2" />
          <p className="text-sm font-medium text-neutral-300">No closed incident records yet</p>
          <p className="mt-1 text-xs text-neutral-500">
            Resolved requests and staff follow-up memos will appear here automatically.
          </p>
          {onSeedDemoRecords && (
            <button
              type="button"
              onClick={onSeedDemoRecords}
              className="mt-4 rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-2 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 transition"
            >
              + Load Sample Incident Audit Log
            </button>
          )}
        </div>
      )}

      {records.length > 0 && filteredRecords.length === 0 && (
        <p className="px-2 py-6 text-center text-xs text-neutral-500">
          No records match "{searchQuery}"
        </p>
      )}

      {filteredRecords.map((record) => {
        const memo = draftMemos[record.id] ?? record.memo ?? "";
        const details = draftDetails[record.id] || {
          severity: record.severity || "standard",
          actionTaken: record.actionTaken || "",
          followUpRequired: Boolean(record.followUpRequired),
        };
        const isSaved = savedMemoId === record.id;
        return (
          <article key={record.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium text-neutral-100">
                  <MapPin size={14} className="text-amber-400 shrink-0" /> {record.location}
                </p>
                <p className="mt-1 text-xs font-medium text-amber-300/90">{record.reason}</p>
                <p className="mt-1 text-[11px] text-neutral-500">
                  Closed by <span className="text-neutral-300 font-medium">{record.closedBy || "staff"}</span> ·{" "}
                  {new Date(record.closedAt || record.time || Date.now()).toLocaleString()}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 shrink-0">
                <Check size={12} /> Resolved
              </span>
            </div>
            {record.message && (
              <p className="mt-3 rounded-md bg-neutral-950/60 border border-neutral-800 px-3 py-2 text-xs text-neutral-300">
                "{record.message}"
              </p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-[11px] text-neutral-400">Severity
                <select value={details.severity} onChange={(event) => setDraftDetails((current) => ({ ...current, [record.id]: { ...details, severity: event.target.value } }))} className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-2 text-xs text-neutral-100">
                  <option value="standard">Standard</option>
                  <option value="elevated">Elevated</option>
                  <option value="critical">Critical</option>
                </select>
              </label>
              <label className="flex items-end gap-2 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-2 text-[11px] text-neutral-300">
                <input type="checkbox" checked={details.followUpRequired} onChange={(event) => setDraftDetails((current) => ({ ...current, [record.id]: { ...details, followUpRequired: event.target.checked } }))} />
                Follow-up required
              </label>
            </div>
            <label className="mt-2 block">
              <span className="mb-1.5 block text-[11px] font-medium text-neutral-400">Action taken</span>
              <input value={details.actionTaken} onChange={(event) => setDraftDetails((current) => ({ ...current, [record.id]: { ...details, actionTaken: event.target.value.slice(0, 500) } }))} placeholder="e.g. Escort completed, supervisor notified" className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-neutral-100 placeholder:text-neutral-600 focus:border-amber-400 focus:outline-none" />
            </label>
            <label className="mt-3 block">
              <span className="mb-1.5 block text-[11px] font-medium text-neutral-400">Follow-up memo</span>
              <textarea
                value={memo}
                onChange={(event) =>
                  setDraftMemos((current) => ({ ...current, [record.id]: event.target.value.slice(0, 1000) }))
                }
                rows={3}
                placeholder="Add incident resolution details, security notes, or follow-up actions..."
                className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-neutral-100 placeholder:text-neutral-600 focus:border-amber-400 focus:outline-none"
              />
              <div className="mt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    handleSave(record.id, memo);
                    handleSaveDetails(record);
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition ${
                    isSaved
                      ? "bg-emerald-500 text-neutral-950"
                      : "bg-emerald-600 text-white hover:bg-emerald-700"
                  }`}
                >
                  {isSaved ? (
                    <>
                      <Check size={12} /> Record saved!
                    </>
                  ) : (
                    <>
                      <Save size={12} /> Save record
                    </>
                  )}
                </button>
                {record.memo && !isSaved && (
                  <span className="text-[10px] text-neutral-500">Memo recorded</span>
                )}
              </div>
            </label>
          </article>
        );
      })}
    </div>
  );
}

// ---------------------------------------------
// Root
// ---------------------------------------------
export default function SafeTab() {
  const [view, setView] = useState("patron");
  const [showLanding, setShowLanding] = useState(true);
  const [prefillLocation, setPrefillLocation] = useState("");
  const [signals, setSignals] = useState([]);
  const [records, setRecords] = useState([]);
  const [, forceTick] = useState(0);
  const [staffMember, setStaffMember] = useState(null);
  const [loaded, setLoaded] = useState(false);
  // businessId identifies which specific business a patron/staff member is
  // interacting with — this is what lets many businesses share one app
  // deployment instead of each needing their own QR codes/instances.
  const [businessId, setBusinessId] = useState(null);
  const [venueType, setVenueType] = useState(DEFAULT_VENUE_TYPE);
  const [businesses, setBusinesses] = useState({});
  const [registrationNotice, setRegistrationNotice] = useState("");
  const [locationError, setLocationError] = useState("");
  const [staffRoster, setStaffRoster] = useState(MOCK_STAFF);
  const [administratorAccount, setAdministratorAccount] = useState(null);
  const [staffSetupLoaded, setStaffSetupLoaded] = useState(false);
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [dispatchSettings, setDispatchSettings] = useState({
    escalationSeconds: 30,
    repeatSeconds: 30,
    primaryMonitor: "",
    backupMonitor: "",
  });
  const venueConfig = VENUE_TYPES[venueType];
  const canManageVenue = staffMember && ["🗂️ Administrator", "Administrator", "Manager"].includes(staffMember.role);
  const campusOption = CAMPUS_OPTIONS.find((campus) => campus.id === businessId);
  const businessLocation = businessId
    ? {
        id: businessId,
        ...(campusOption || {}),
        ...(businesses[businessId] || {}),
      }
    : null;
  const SIGNALS_PATH = businessId ? `businesses/${businessId}/signals` : null;
  const RECORDS_PATH = businessId ? `businesses/${businessId}/records` : null;

  useEffect(() => {
    authReady
      .then(() => setFirebaseReady(true))
      .catch(() => setFirebaseReady(false));
  }, []);

  // Signals now live in Firebase Realtime Database instead of localStorage,
  // so a patron's phone and a staff phone both read/write the same node
  // and see each other's activity live. Requires src/firebase.js to have
  // your real project config (see README) before this works.
  const persist = (next) => {
    if (!SIGNALS_PATH) return;
    set(ref(db, SIGNALS_PATH), next).catch(() => {
      // write failed (offline, bad config, etc.) — local state still
      // holds the value for this session, but it won't reach other devices
    });
  };

  const persistRecords = (next) => {
    if (!RECORDS_PATH) return;
    set(ref(db, RECORDS_PATH), next).catch(() => {});
  };

  const persistRecord = (record) => {
    if (!RECORDS_PATH || !record?.id) return;
    set(ref(db, `${RECORDS_PATH}/${record.id}`), record).catch(() => {});
  };

  // Directory of every registered business, used by VenueFinder to match
  // patrons to the right one by name/distance instead of a posted QR code.
  useEffect(() => {
    if (!firebaseReady) return undefined;
    const businessesRef = ref(db, "businesses");
    const unsubscribe = onValue(businessesRef, (snapshot) => {
      setBusinesses(snapshot.val() || {});
    });
    return () => unsubscribe();
  }, [firebaseReady]);

  useEffect(() => {
    if (!firebaseReady || !SIGNALS_PATH) return;
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
  }, [firebaseReady, SIGNALS_PATH]);

  useEffect(() => {
    if (!firebaseReady || !RECORDS_PATH) {
      setRecords([]);
      return undefined;
    }
    const recordsRef = ref(db, RECORDS_PATH);
    const unsubscribe = onValue(recordsRef, (snapshot) => {
      const value = snapshot.val();
      const records = Array.isArray(value) ? value : value ? Object.values(value) : [];
      const cutoff = Date.now() - INCIDENT_RETENTION_MS;
      const retainedRecords = records.filter((record) => {
        const closedAt = Number(record.closedAt || record.recordedAt || record.time || 0);
        return !closedAt || closedAt >= cutoff;
      });
      setRecords(retainedRecords);
      records
        .filter((record) => !retainedRecords.includes(record) && record?.id)
        .forEach((record) => remove(ref(db, `${RECORDS_PATH}/${record.id}`)).catch(() => {}));
    }, () => setRecords([]));
    return () => unsubscribe();
  }, [firebaseReady, RECORDS_PATH]);

  useEffect(() => {
    if (!firebaseReady || !businessId) return;
    setStaffSetupLoaded(false);
    setAdministratorAccount(null);
    setStaffRoster(MOCK_STAFF);
    const setupRef = ref(db, `businesses/${businessId}/staffSetup`);
    const unsubscribe = onValue(setupRef, (snapshot) => {
      const setup = snapshot.val();
      if (setup?.roster) setStaffRoster(Array.isArray(setup.roster) ? setup.roster : Object.values(setup.roster));
      else setStaffRoster(MOCK_STAFF);
      setAdministratorAccount(setup?.administratorAccount || null);
      setStaffSetupLoaded(true);
      if (setup?.dispatchSettings) {
        setDispatchSettings((current) => ({ ...current, ...setup.dispatchSettings }));
      }
    }, () => setStaffSetupLoaded(true));
    return () => unsubscribe();
  }, [businessId, firebaseReady]);

  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const handleSend = ({ location, reason, message }) => {
    setSignals((prev) => {
      const next = [
        {
          id: Date.now(),
          location,
          reason,
          message,
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
      const signal = prev.find((s) => s.id === id);
      if (signal) {
        setRecords((current) => {
          if (current.some((record) => record.id === id)) return current;
          const incidentRecord = {
            ...signal,
            ack: true,
            status: "resolved",
            severity: "standard",
            actionTaken: "",
            followUpRequired: false,
            recordedAt: Date.now(),
            closedAt: Date.now(),
            closedBy: staffMember?.name || "staff",
            memo: "",
          };
          const nextRecords = [
            ...current,
            incidentRecord,
          ];
          persistRecord(incidentRecord);
          return nextRecords;
        });
      }
      const next = prev.map((s) => (s.id === id ? { ...s, ack: true } : s));
      persist(next);
      return next;
    });
  };

  const handleSaveMemo = (id, memo) => {
    setRecords((current) => {
      const next = current.map((record) => (record.id === id ? { ...record, memo } : record));
      const updatedRecord = next.find((record) => record.id === id);
      persistRecord(updatedRecord);
      return next;
    });
  };

  const handleSaveRecord = (id, details) => {
    setRecords((current) => {
      const next = current.map((record) => (
        record.id === id
          ? { ...record, ...details, lastUpdatedAt: Date.now(), lastUpdatedBy: staffMember?.name || "staff" }
          : record
      ));
      persistRecord(next.find((record) => record.id === id));
      return next;
    });
  };

  const handleSeedDemoRecords = () => {
    setRecords(SAMPLE_DEMO_RECORDS);
    persistRecords(SAMPLE_DEMO_RECORDS);
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

  const handleAreaChange = (area) => {
    setStaffMember((current) => (current ? { ...current, area } : current));
  };

  // Manager taps "Claim this location" — captures the device's current GPS
  // coordinates as this business's authoritative location, merged onto its
  // existing directory record (so its name/venue type aren't overwritten).
  const handleClaimLocation = ({ mode = "gps", businessName = "", address = "", onSuccess } = {}) => {
    if (!businessId) return;
    if (mode === "manual") {
      if (!businessName.trim() || !address.trim()) {
        setLocationError("Enter the business name and address");
        return;
      }
      const claimed = {
        source: "manual",
        name: businessName.trim(),
        businessName: businessName.trim(),
        address: address.trim(),
        lat: null,
        lng: null,
        accuracy: null,
        claimedBy: staffMember?.name || "Manager",
        claimedAt: Date.now(),
      };
      setBusinesses((current) => ({ ...current, [businessId]: { ...current[businessId], ...claimed } }));
      setLocationError("");
      update(ref(db, `businesses/${businessId}`), claimed).catch(() => {});
      onSuccess?.();
      return;
    }
    if (!navigator.geolocation) {
      setLocationError("Location services aren't available on this device");
      return;
    }
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const claimed = {
          source: "gps",
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          claimedBy: staffMember?.name || "Manager",
          claimedAt: Date.now(),
        };
        setBusinesses((current) => ({ ...current, [businessId]: { ...current[businessId], ...claimed } }));
        onSuccess?.();
        update(ref(db, `businesses/${businessId}`), claimed).catch(() => {
          // write failed (offline, bad config, etc.) — local state still holds it
        });
      },
      () => {
        setLocationError("Couldn't get your location — check location permissions");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
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

  const launchFromLanding = ({ business, newBusiness, demoVenue, location }) => {
    setRegistrationNotice("");
    if (newBusiness) {
      const id = slugifyBusinessId(newBusiness.name);
      const record = { ...newBusiness, createdAt: Date.now() };
      setBusinesses((current) => ({ ...current, [id]: record }));
      set(ref(db, `businesses/${id}`), record).catch(() => {});
      setBusinessId(id);
      setVenueType(newBusiness.venueType);
      setRegistrationNotice(
        `${newBusiness.name} is registered and findable by patrons now. Open Staff and claim administrator access to add your team.`
      );
      setView("staff");
    } else if (business) {
      const id = business.id || slugifyBusinessId(business.name);
      const record = {
        venueType: "bar",
        ...business,
        id,
      };
      setBusinesses((current) => ({ [id]: record, ...current }));
      setBusinessId(id);
      setVenueType(record.venueType || DEFAULT_VENUE_TYPE);
      setView("patron");
    } else if (demoVenue) {
      setBusinessId(demoVenue === "campus" ? CAMPUS_OPTIONS[0].id : `demo-${demoVenue}`);
      setVenueType(demoVenue);
      setView("patron");
    }
    setPrefillLocation(location);
    setShowLanding(false);
  };

  const saveRoster = (nextRoster) => {
    setStaffRoster(nextRoster);
    if (businessId) set(ref(db, `businesses/${businessId}/staffSetup/roster`), nextRoster).catch(() => {});
  };

  const saveAdministrator = ({ name, pin }) => {
    const account = {
      name,
      pin,
      ownerUid: auth.currentUser?.uid || administratorAccount?.ownerUid,
      createdAt: administratorAccount?.createdAt || Date.now(),
    };
    setAdministratorAccount(account);
    if (businessId) set(ref(db, `businesses/${businessId}/staffSetup/administratorAccount`), account).catch(() => {});
  };

  const bootstrapAdministrator = async ({ name, pin }) => {
    if (!businessId || !name || pin.length !== 4) return null;
    const account = { name, pin, ownerUid: auth.currentUser?.uid, createdAt: Date.now() };
    try {
      const result = await runTransaction(
        ref(db, `businesses/${businessId}/staffSetup/administratorAccount`),
        (current) => current || account
      );
      const savedAccount = result.snapshot.val();
      if (!result.committed || savedAccount?.name !== account.name || savedAccount?.pin !== account.pin) return null;
      const admin = { ...account, role: "Administrator", area: venueConfig.staffAreas?.[0] || "All areas" };
      setAdministratorAccount(account);
      return admin;
    } catch {
      return null;
    }
  };

  const saveDispatchSettings = (nextSettings) => {
    setDispatchSettings(nextSettings);
    if (businessId) set(ref(db, `businesses/${businessId}/staffSetup/dispatchSettings`), nextSettings).catch(() => {});
  };

  if (showLanding) {
    return <CampusLanding businesses={businesses} onEnter={launchFromLanding} />;
  }

  const currentCampus = CAMPUS_OPTIONS.find((c) => c.id === businessLocation?.id);

  return (
    <div className="relative w-full max-w-sm mx-auto">
      <a
        href="tel:911"
        aria-label="Call 911 for a serious emergency"
        className="fixed z-30 bottom-4 right-4 flex items-center gap-2 rounded-xl border border-red-400/40 bg-red-600 px-3 py-2.5 text-white shadow-lg shadow-red-950/40 transition hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-300 sm:absolute sm:left-full sm:right-auto sm:top-24 sm:bottom-auto sm:ml-4 sm:w-36 sm:flex-col sm:items-start sm:gap-1 sm:rounded-2xl sm:px-4 sm:py-3"
      >
        <PhoneCall size={18} aria-hidden="true" />
        <span className="text-sm font-semibold leading-tight">Call 911</span>
        <span className="hidden text-[11px] leading-tight text-red-100 sm:block">
          Serious emergency
        </span>
      </a>

      <div className="safetab-shell h-[700px] rounded-3xl border flex flex-col overflow-hidden font-sans">
        {registrationNotice && (
          <div className="mx-4 mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-300">
            {registrationNotice}
          </div>
        )}
        <div className="px-5 pt-4 pb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => {
              setPrefillLocation("");
              setShowLanding(true);
              setBusinessId(null);
              setStaffMember(null);
              setView("patron");
            }}
            aria-label="Back to Side Quest landing page"
            title="Back to landing page"
            className="mr-1 rounded-full p-1 text-neutral-500 transition hover:bg-neutral-800 hover:text-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <ArrowLeft size={16} aria-hidden="true" />
          </button>
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 font-bold text-xs"
            style={{ backgroundColor: currentCampus?.color || "#f59e0b", color: currentCampus ? "#ffffff" : "#171717" }}
          >
            {businessLocation?.name?.[0] || "S"}
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="min-w-0 truncate text-neutral-100 text-sm font-semibold tracking-tight">
              {businessLocation?.name || "SafeTab"}
            </p>
            {currentCampus && (
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                style={{ backgroundColor: currentCampus.badgeBg, color: currentCampus.badgeText }}
              >
                {currentCampus.shortName}
              </span>
            )}
          </div>
        </div>
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
          {venueConfig.staffView.tabLabel}
          {signals.some((s) => !s.ack) && (
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          )}
        </button>
        {canManageVenue && (
          <button
            onClick={() => setView("admin")}
            className={`flex-1 py-3 text-sm font-medium ${
              view === "admin"
                ? "text-amber-400 border-b-2 border-amber-400"
                : "text-neutral-600"
            }`}
          >
            Admin
          </button>
        )}
        </div>
        <div className="flex-1 overflow-hidden">
          {view === "patron" ? (
            <PatronView
              onSend={handleSend}
              onCampusChange={(campus) => {
                if (campus) {
                  setBusinessId(campus.id);
                  setPrefillLocation("");
                  return;
                }
                setPrefillLocation("");
                setShowLanding(true);
                setBusinessId(null);
              }}
              venueConfig={venueConfig}
              initialLocation={prefillLocation}
              businessLocation={businessLocation}
            />
          ) : view === "admin" && canManageVenue ? (
            <AdminView
              staffMember={staffMember}
              venueConfig={venueConfig}
              businessLocation={businessLocation}
              onClaimLocation={handleClaimLocation}
              locationError={locationError}
              staffRoster={staffRoster}
              onSaveRoster={saveRoster}
              administratorAccount={administratorAccount}
              onSaveAdministrator={saveAdministrator}
              dispatchSettings={dispatchSettings}
              onSaveSettings={saveDispatchSettings}
              allowBusinessClaim={venueType !== "campus"}
            />
          ) : staffMember ? (
            <StaffView
              signals={signals}
              records={records}
              onAck={handleAck}
              onSaveMemo={handleSaveMemo}
              onSaveRecord={handleSaveRecord}
              onSeedDemoRecords={handleSeedDemoRecords}
              onClaim={handleClaim}
              onUnclaim={handleUnclaim}
              staffMember={staffMember}
              onSignOut={() => {
                setStaffMember(null);
                setView("staff");
              }}
              soundReady={!!staffMember}
              venueConfig={venueConfig}
              onAreaChange={handleAreaChange}
              dispatchSettings={dispatchSettings}
              onOpenAdmin={canManageVenue ? () => setView("admin") : null}
            />
          ) : (
            <StaffLogin
              onAuth={setStaffMember}
              onBootstrapAdmin={bootstrapAdministrator}
              onSaveAdministrator={saveAdministrator}
              administratorAccount={administratorAccount}
              staffSetupLoaded={staffSetupLoaded}
              venueConfig={venueConfig}
              staffRoster={staffRoster}
            />
          )}
        </div>
      </div>
    </div>
  );
}
