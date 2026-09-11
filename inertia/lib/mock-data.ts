export type ContentStatus = "PUBLISHED" | "DRAFT";

export interface MockSyncStatus {
  synced: boolean;
  syncedAt?: string | null;
  pendingSince?: string | null;
}

export interface MockContent {
  id: string;
  title: string;
  slug: string;
  author: string;
  status: ContentStatus;
  createdAt: string;
  updatedAt: string;
  syncStatus?: MockSyncStatus;
}

export interface MockUser {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string | null;
  status: "ACTIVE" | "INACTIVE";
  roles: string[];
  createdAt: string;
  syncStatus?: MockSyncStatus;
}

export const MOCK_CONTENT: MockContent[] = [
  { id: "1", title: "Getting Started with Next.js 16", slug: "getting-started-nextjs-16", author: "Jane Doe", status: "PUBLISHED", createdAt: "2026-04-10T08:30:00Z", updatedAt: "2026-04-12T14:20:00Z" },
  { id: "2", title: "Understanding Prisma ORM", slug: "understanding-prisma-orm", author: "John Smith", status: "PUBLISHED", createdAt: "2026-04-09T10:00:00Z", updatedAt: "2026-04-11T09:15:00Z" },
  { id: "3", title: "Building REST APIs with NestJS", slug: "rest-apis-nestjs", author: "Jane Doe", status: "DRAFT", createdAt: "2026-04-08T15:45:00Z", updatedAt: "2026-04-10T16:30:00Z" },
  { id: "4", title: "Tailwind CSS v4 Deep Dive", slug: "tailwind-css-v4", author: "Alex Lee", status: "PUBLISHED", createdAt: "2026-04-07T12:00:00Z", updatedAt: "2026-04-09T11:00:00Z" },
  { id: "5", title: "RBAC with CASL in Production", slug: "rbac-casl-production", author: "Jane Doe", status: "DRAFT", createdAt: "2026-04-06T09:00:00Z", updatedAt: "2026-04-08T10:45:00Z" },
  { id: "6", title: "Deploying Monorepos with pnpm", slug: "deploying-monorepos-pnpm", author: "John Smith", status: "PUBLISHED", createdAt: "2026-04-05T14:00:00Z", updatedAt: "2026-04-07T08:30:00Z" },
  { id: "7", title: "TypeScript Tips and Tricks", slug: "typescript-tips-tricks", author: "Alex Lee", status: "DRAFT", createdAt: "2026-04-04T11:30:00Z", updatedAt: "2026-04-06T13:00:00Z" },
  { id: "8", title: "React Query Patterns", slug: "react-query-patterns", author: "Jane Doe", status: "PUBLISHED", createdAt: "2026-04-03T08:00:00Z", updatedAt: "2026-04-05T09:45:00Z" },
  { id: "9", title: "Database Migration Strategies", slug: "db-migration-strategies", author: "John Smith", status: "DRAFT", createdAt: "2026-04-02T16:00:00Z", updatedAt: "2026-04-04T12:15:00Z" },
  { id: "10", title: "JWT Authentication Best Practices", slug: "jwt-auth-best-practices", author: "Alex Lee", status: "PUBLISHED", createdAt: "2026-04-01T10:00:00Z", updatedAt: "2026-04-03T14:30:00Z" },
  { id: "11", title: "Draft — Serverless Edge Runtimes (local only)", slug: "serverless-edge-runtimes", author: "Jane Doe", status: "DRAFT", createdAt: "2026-04-18T09:05:00Z", updatedAt: "2026-04-18T09:05:00Z", syncStatus: { synced: false, pendingSince: "2026-04-18T09:05:00Z" } },
  { id: "12", title: "Notes — Service Worker Precache Tips (local only)", slug: "sw-precache-tips", author: "Alex Lee", status: "DRAFT", createdAt: "2026-04-18T08:12:00Z", updatedAt: "2026-04-18T08:40:00Z", syncStatus: { synced: false, pendingSince: "2026-04-18T08:12:00Z" } },
];

export const MOCK_USERS: MockUser[] = [
  { id: "u1", email: "jane@example.com", username: "jane_doe", firstName: "Jane", lastName: "Doe", status: "ACTIVE", roles: ["SUPERADMIN"], createdAt: "2026-03-01T08:00:00Z" },
  { id: "u2", email: "john@example.com", username: "john_smith", firstName: "John", lastName: "Smith", status: "ACTIVE", roles: ["ADMIN"], createdAt: "2026-03-05T10:00:00Z" },
  { id: "u3", email: "alex@example.com", username: "alex_lee", firstName: "Alex", lastName: "Lee", status: "ACTIVE", roles: ["USER"], createdAt: "2026-03-10T14:00:00Z" },
  { id: "u4", email: "sara@example.com", username: "sara_kim", firstName: "Sara", lastName: "Kim", status: "ACTIVE", roles: ["USER"], createdAt: "2026-03-15T09:00:00Z" },
  { id: "u5", email: "mike@example.com", username: "mike_chen", firstName: "Mike", lastName: "Chen", status: "INACTIVE", roles: ["GUEST"], createdAt: "2026-03-20T11:00:00Z" },
  { id: "u6", email: "emma@example.com", username: "emma_w", firstName: "Emma", lastName: "Wilson", status: "ACTIVE", roles: ["USER", "ADMIN"], createdAt: "2026-03-25T13:00:00Z" },
  { id: "u7", email: "nora@example.com", username: "nora_p", firstName: "Nora", lastName: "Park", status: "ACTIVE", roles: ["USER"], createdAt: "2026-04-18T07:42:00Z", syncStatus: { synced: false, pendingSince: "2026-04-18T07:42:00Z" } },
  { id: "u8", email: "liam@example.com", username: "liam_t", firstName: "Liam", lastName: "Turner", status: "INACTIVE", roles: ["GUEST"], createdAt: "2026-04-18T06:20:00Z", syncStatus: { synced: false, pendingSince: "2026-04-18T06:20:00Z" } },
];

export const MOCK_CHART_DATA = [
  { date: "Apr 01", posts: 2 },
  { date: "Apr 02", posts: 1 },
  { date: "Apr 03", posts: 3 },
  { date: "Apr 04", posts: 0 },
  { date: "Apr 05", posts: 4 },
  { date: "Apr 06", posts: 2 },
  { date: "Apr 07", posts: 5 },
  { date: "Apr 08", posts: 3 },
  { date: "Apr 09", posts: 1 },
  { date: "Apr 10", posts: 4 },
  { date: "Apr 11", posts: 2 },
  { date: "Apr 12", posts: 6 },
  { date: "Apr 13", posts: 3 },
  { date: "Apr 14", posts: 2 },
];

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPERADMIN: ["*"],
  ADMIN: [
    "content:create",
    "content:read",
    "content:update",
    "content:delete",
    "user:read",
    "user:update",
  ],
  USER: ["content:create", "content:read", "content:update"],
  GUEST: ["content:read"],
};
