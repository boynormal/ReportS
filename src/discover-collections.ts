/**
 * สำรวจ collection ของบริษัท + ตัวอย่างเอกสาร
 *
 *   npx tsx src/discover-collections.ts
 */

import "dotenv/config";
import { decodeFields, documentIdFromName } from "./lib/firestore-rest.js";
import { loginScrapee } from "./lib/firebase.js";

const PROJECT_ID = "scrappy-prod";
const SAMPLE_IDS = [
  "products",
  "customerGroups",
  "outTickets",
  "transforms",
  "sellers",
  "inTickets",
];
const EMPLOYEE_CANDIDATES = [
  "users",
  "members",
  "employees",
  "staff",
  "companyUsers",
];

function authHeaders(idToken: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${idToken}`,
  };
  const appCheck = process.env.FIREBASE_APP_CHECK_TOKEN;
  if (appCheck) headers["X-Firebase-AppCheck"] = appCheck;
  return headers;
}

async function listCollectionIds(parent: string, idToken: string): Promise<string[]> {
  const res = await fetch(`https://firestore.googleapis.com/v1/${parent}:listCollectionIds`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({ pageSize: 100 }),
  });
  const body = (await res.json()) as { collectionIds?: string[]; error?: { message?: string } };
  if (!res.ok) {
    console.log(`[listCollectionIds] error: ${body.error?.message ?? res.statusText}`);
    return [];
  }
  return body.collectionIds ?? [];
}

async function sampleCollection(
  parent: string,
  idToken: string,
  collectionId: string,
  structuredQuery?: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const res = await fetch(`https://firestore.googleapis.com/v1/${parent}:runQuery`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({
      structuredQuery: structuredQuery ?? { from: [{ collectionId }], limit: 1 },
    }),
  });
  const body = (await res.json()) as
    | Array<{ document?: { name: string; fields?: Record<string, never> } }>
    | { error?: { message?: string } };
  if (!res.ok) {
    const msg = !Array.isArray(body) ? body.error?.message ?? res.statusText : res.statusText;
    console.log(`[${collectionId}] error: ${msg}`);
    return null;
  }
  const doc = Array.isArray(body) ? body.find((r) => r.document?.fields)?.document : undefined;
  if (!doc?.fields) {
    console.log(`[${collectionId}] no documents`);
    return null;
  }
  const data = decodeFields(doc.fields);
  console.log(`[${collectionId}] ${documentIdFromName(doc.name)}`);
  console.log("  keys:", Object.keys(data).sort().join(", "));
  return data;
}

function summarizeTicket(kind: string, data: Record<string, unknown> | null): void {
  if (!data) return;
  console.log(
    `  ${kind} status=${String(data.status ?? "null")} done=${String(data.done ?? "null")} paidTimestamp=${data.paidTimestamp instanceof Date ? "set" : String(data.paidTimestamp ?? "null")} paidAt=${data.paidAt instanceof Date ? "set" : String(data.paidAt ?? "null")} recordedBy=${data.recordedBy ? "set" : "null"}`
  );
}

async function sampleMany(
  parent: string,
  idToken: string,
  label: string,
  structuredQuery: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`https://firestore.googleapis.com/v1/${parent}:runQuery`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({ structuredQuery }),
  });
  const body = (await res.json()) as
    | Array<{ document?: { name: string; fields?: Record<string, never> } }>
    | { error?: { message?: string } };
  if (!res.ok) {
    const msg = !Array.isArray(body) ? body.error?.message ?? res.statusText : res.statusText;
    console.log(`[${label}] error: ${msg}`);
    return;
  }
  const docs = Array.isArray(body) ? body.filter((r) => r.document?.fields) : [];
  console.log(`[${label}] count=${docs.length}`);
  const statuses = new Map<string, number>();
  for (const row of docs) {
    const data = decodeFields(row.document!.fields!);
    const key = `status=${String(data.status ?? "null")}|done=${String(data.done ?? "null")}|paidTs=${data.paidTimestamp ? "set" : "null"}`;
    statuses.set(key, (statuses.get(key) ?? 0) + 1);
  }
  for (const [key, n] of statuses) console.log(`  ${n} ${key}`);
  const first = docs[0]?.document;
  if (first?.fields) {
    const data = decodeFields(first.fields);
    console.log("  sample keys:", Object.keys(data).sort().join(", "));
    if (data.email || data.name || data.role) {
      console.log(
        `  sample name=${String(data.name ?? "")} email=${String(data.email ?? "")} role=${String(data.role ?? "")}`
      );
    }
  }
}

async function sampleOpenTickets(parent: string, idToken: string): Promise<void> {
  console.log("\n--- open inTickets (done == false) ---");
  const unpaidIn = await sampleCollection(parent, idToken, "inTickets:done=false", {
    from: [{ collectionId: "inTickets" }],
    where: {
      fieldFilter: {
        field: { fieldPath: "done" },
        op: "EQUAL",
        value: { booleanValue: false },
      },
    },
    limit: 1,
  });
  summarizeTicket("in", unpaidIn);

  console.log("\n--- open outTickets (status == draft) ---");
  const draftOut = await sampleCollection(parent, idToken, "outTickets:draft", {
    from: [{ collectionId: "outTickets" }],
    where: {
      fieldFilter: {
        field: { fieldPath: "status" },
        op: "EQUAL",
        value: { stringValue: "draft" },
      },
    },
    limit: 1,
  });
  summarizeTicket("out", draftOut);
}

async function main(): Promise<void> {
  const email = process.env.SCRAPEE_EMAIL?.trim() || "token-auth@local";
  const password = process.env.SCRAPEE_PASSWORD?.trim() || "";
  const session = await loginScrapee(email, password);
  const parent = `projects/${PROJECT_ID}/databases/(default)/documents/companies/${session.companyId}`;
  console.log("companyId:", session.companyId);

  console.log("\n--- listCollectionIds ---");
  const ids = await listCollectionIds(parent, session.idToken);
  if (ids.length) console.log("  ", ids.join(", "));

  console.log("\n--- known collections ---");
  for (const id of SAMPLE_IDS) {
    await sampleCollection(parent, session.idToken, id);
  }

  console.log("\n--- employee candidates ---");
  const extra = ids.filter((id) => !SAMPLE_IDS.includes(id) && !EMPLOYEE_CANDIDATES.includes(id));
  for (const id of [...EMPLOYEE_CANDIDATES, ...extra]) {
    await sampleCollection(parent, session.idToken, id);
  }

  await sampleOpenTickets(parent, session.idToken);

  console.log("\n--- employees sample ---");
  await sampleMany(parent, session.idToken, "employees", {
    from: [{ collectionId: "employees" }],
    limit: 20,
  });

  console.log("\n--- inTickets paidTimestamp is null ---");
  await sampleMany(parent, session.idToken, "inTickets:paidTs-null", {
    from: [{ collectionId: "inTickets" }],
    where: {
      fieldFilter: {
        field: { fieldPath: "paidTimestamp" },
        op: "EQUAL",
        value: { nullValue: null },
      },
    },
    limit: 30,
  });

  console.log("\n--- inTickets status != paid ---");
  await sampleMany(parent, session.idToken, "inTickets:status-ne-paid", {
    from: [{ collectionId: "inTickets" }],
    where: {
      fieldFilter: {
        field: { fieldPath: "status" },
        op: "NOT_EQUAL",
        value: { stringValue: "paid" },
      },
    },
    limit: 30,
  });

  console.log("\n--- outTickets open statuses ---");
  for (const status of ["draft", "shipping", "accepted", "void"]) {
    await sampleMany(parent, session.idToken, `outTickets:${status}`, {
      from: [{ collectionId: "outTickets" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "status" },
          op: "EQUAL",
          value: { stringValue: status },
        },
      },
      limit: 5,
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
