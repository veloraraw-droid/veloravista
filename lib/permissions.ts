export type AdminModule = "overview" | "tasks" | "calendar" | "customers" | "contracts" | "billing" | "projects" | "portfolio" | "plans" | "team" | "settings";

const labels: Record<string, AdminModule> = {
  overview: "overview",
  tasks: "tasks",
  "team hub": "tasks",
  "tasks & team hub": "tasks",
  schedule: "calendar",
  calendar: "calendar",
  customers: "customers",
  contracts: "contracts",
  billing: "billing",
  projects: "projects",
  portfolio: "portfolio",
  plans: "plans",
  subscriptions: "plans",
  team: "team",
  "team settings": "team",
  settings: "settings",
  "company settings": "settings",
};

export function permissionModules(value: unknown): Set<AdminModule> {
  const source = value && typeof value === "object" && "modules" in value
    ? String((value as { modules?: unknown }).modules || "")
    : "";
  const modules = new Set<AdminModule>(["overview"]);
  for (const item of source.split(/\s*[·,|]\s*/)) {
    const normalized = labels[item.trim().toLowerCase()];
    if (normalized) modules.add(normalized);
  }
  return modules;
}

export function moduleForKind(kind: string): AdminModule | null {
  if (["task", "message", "daily_report", "notification"].includes(kind)) return "tasks";
  if (["booking", "meeting", "availability"].includes(kind)) return "calendar";
  if (["client", "client_request"].includes(kind)) return "customers";
  if (["contract", "contract_template"].includes(kind)) return "contracts";
  if (kind === "invoice") return "billing";
  if (kind === "project") return "projects";
  if (kind === "portfolio") return "portfolio";
  if (["plan", "subscription"].includes(kind)) return "plans";
  if (kind === "team") return "team";
  return null;
}

export function canAccessModule(role: string, permissions: unknown, module: AdminModule) {
  return role === "owner" || permissionModules(permissions).has(module);
}
