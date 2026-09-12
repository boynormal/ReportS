export type DashboardRole = "viewer" | "sync" | "admin";
export type DashboardStatus = "pending" | "active" | "disabled";

export type SessionUser = {
  lineUserId: string;
  name: string;
  role: DashboardRole;
  status: DashboardStatus;
};

export type DashboardUser = SessionUser & {
  pictureUrl: string | null;
  createdAt: string | null;
  lastLoginAt: string | null;
};

export function canSync(role: DashboardRole | null | undefined): boolean {
  return role === "sync" || role === "admin";
}

export function isAdmin(role: DashboardRole | null | undefined): boolean {
  return role === "admin";
}

export function isDashboardRole(value: string): value is DashboardRole {
  return value === "viewer" || value === "sync" || value === "admin";
}

export function isDashboardStatus(value: string): value is DashboardStatus {
  return value === "pending" || value === "active" || value === "disabled";
}
