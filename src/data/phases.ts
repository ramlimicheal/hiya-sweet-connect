import { BuildPhase } from "../types";

export const DEFAULT_PHASES: BuildPhase[] = [
  {
    id: "master",
    number: "00",
    title: "Master Product Context",
    description: "Permanent source of truth to provide before every major Lovable phase.",
    requirements: "Create a compact but complete master context covering product, users, roles, business model, features, exclusions, stack, design, security and non-negotiable constraints.",
    status: "idle"
  },
  {
    id: "discovery",
    number: "01",
    title: "Discovery and Decisions",
    description: "Challenge assumptions and resolve missing product decisions.",
    requirements: "Analyze the product idea, identify contradictions, challenge weak assumptions, prioritize unresolved decisions and recommend defensible defaults.",
    status: "idle"
  },
  {
    id: "architecture",
    number: "02",
    title: "Product Architecture",
    description: "Pages, journeys, boundaries, data flow and implementation plan.",
    requirements: "Define information architecture, routes, users, permissions, journeys, components, services, data flow, trust boundaries, integrations and dependency-aware phases.",
    status: "idle"
  },
  {
    id: "design",
    number: "03",
    title: "Design System",
    description: "Visual language, components, layouts and responsive rules.",
    requirements: "Create the complete visual system: tokens, colors, typography, spacing, elevation, grids, components, states, responsive rules, accessibility and visual quality controls.",
    status: "idle"
  },
  {
    id: "motion",
    number: "04",
    title: "Motion and Interaction",
    description: "Purposeful animation, transitions and gesture controls.",
    requirements: "Specify exact Framer Motion animations, page transitions, button micro-interactions, responsive touch targets, loading placeholders, and custom cursor/hover highlights.",
    status: "idle"
  },
  {
    id: "layout",
    number: "05",
    title: "Core Layout and Navigation",
    description: "Primary shell, responsive navigation, and workspace layout.",
    requirements: "Build the master wrapper, sticky headers, responsive drawers/sidebars, dynamic tabs, user profile headers, and multi-device container responsiveness.",
    status: "idle"
  },
  {
    id: "auth",
    number: "06",
    title: "Authentication and Authorization",
    description: "Sign-up, sign-in, session handlers, and role-based access.",
    requirements: "Implement full OAuth sign-in, login credentials, token verification, route guards, permission controls, and secure session state tracking.",
    status: "idle"
  },
  {
    id: "database",
    number: "07",
    title: "Schema and Row-Level Security",
    description: "Supabase or PostgreSQL database tables, relationships, and security rules.",
    requirements: "Write complete DDL schemas, relationship keys, indices, triggers for user sync, and row-level security (RLS) policies for complete multi-tenant safety.",
    status: "idle"
  },
  {
    id: "dashboard",
    number: "08",
    title: "Main Dashboard & Visualizer",
    description: "Core dashboards, dynamic stats grid, charts, and empty states.",
    requirements: "Create the main data workspace containing beautiful key metrics with transition effects, interactive D3 or recharts visualizations, and clean, empty state wrappers.",
    status: "idle"
  },
  {
    id: "magic",
    number: "09",
    title: "Interactive Journey ('Magic' Moment)",
    description: "The core utility or primary workflows of the application.",
    requirements: "Build the primary interaction engine, complex state controls, main functional utility or AI-generation canvas, and ensure seamless frontend feedback loops.",
    status: "idle"
  },
  {
    id: "settings",
    number: "10",
    title: "Settings and Personalization",
    description: "User profiles, app configurations, preferences, and local cache.",
    requirements: "Design forms for profile edits, account preferences, theme options, local state backups, and local storage configurations.",
    status: "idle"
  },
  {
    id: "integrations",
    number: "11",
    title: "Real-World APIs & Payments",
    description: "Secure integrations with Stripe, twilio, sendgrid, or calendar.",
    requirements: "Write fully functioning API proxies on the backend to handle Stripe checkout/billing portals, calendar API sync, or email webhooks without client keys.",
    status: "idle"
  },
  {
    id: "hardening",
    number: "12",
    title: "Production Hardening and Error Handling",
    description: "Robust error boundaries, fallbacks, and user feedback.",
    requirements: "Implement custom ErrorBoundary components, server try-catch responses, toast error triggers, offline banners, and validation guards.",
    status: "idle"
  },
  {
    id: "seo",
    number: "13",
    title: "SEO, Performance, and Metadata",
    description: "Meta tags, dynamic headers, lazy loading, and bundle optimization.",
    requirements: "Add clean dynamic head managers (such as react-helmet), lazy-load dynamic pages, optimize layout shifts, and verify lighting-fast page loads.",
    status: "idle"
  },
  {
    id: "verify",
    number: "14",
    title: "Verification, Testing & Export",
    description: "End-to-end flow checks, diagnostic reports, and code package export.",
    requirements: "Set up simulated user-journey diagnostic verifiers, diagnostic check summaries, and direct options to export the prompt pack as ZIP or JSON.",
    status: "idle"
  }
];
