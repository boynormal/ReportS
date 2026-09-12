/**
 * export-buy-tickets.js
 * ดึงข้อมูล "ตั๋วรับซื้อ" (inTickets) จาก Firestore ของ Scrapee
 * แล้วบันทึกเป็นไฟล์ JSON + สรุปเป็น CSV เก็บไว้ใช้งานต่อ
 *
 * วิธีติดตั้ง:
 *   npm install firebase
 *
 * วิธีรัน (ดึงข้อมูลทั้งหมด):
 *   SCRAPEE_EMAIL="may.cashier@scharoenchai.com" SCRAPEE_PASSWORD="รหัสผ่านของคุณ" node export-buy-tickets.js
 *
 * วิธีรัน (ดึงเฉพาะช่วงวันที่ เช่น เดือนสิงหาคม 2026):
 *   SCRAPEE_EMAIL="..." SCRAPEE_PASSWORD="..." START_DATE="2026-08-01" END_DATE="2026-08-31" node export-buy-tickets.js
 *
 * (ไม่ควรเขียนรหัสผ่านลงในไฟล์นี้ตรงๆ ให้ใส่ผ่าน environment variable ตอนรันแทน)
 */

const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
} = require("firebase/firestore");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");
const fs = require("fs");

// ---------- Firebase config ----------
const firebaseConfig = {
  apiKey: "AIzaSyDbfhacQo3A2y5u4YuIlNk1JREwERifVhk",
  authDomain: "scrappy-prod.firebaseapp.com",
  projectId: "scrappy-prod",
};

// ---------- ยืนยันแล้วว่า path ที่ถูกต้องคือ ----------
// companies/{companyId}/inTickets

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

async function main() {
  const email = process.env.SCRAPEE_EMAIL;
  const password = process.env.SCRAPEE_PASSWORD;
  const startDateStr = process.env.START_DATE; // เช่น 2026-08-01
  const endDateStr = process.env.END_DATE; // เช่น 2026-08-31

  if (!email || !password) {
    console.error(
      "กรุณาตั้งค่า SCRAPEE_EMAIL และ SCRAPEE_PASSWORD เป็น environment variable ก่อนรัน"
    );
    process.exit(1);
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  console.log("กำลังเข้าสู่ระบบ...");
  const cred = await signInWithEmailAndPassword(auth, email, password);
  console.log("เข้าสู่ระบบสำเร็จ, uid:", cred.user.uid);

  const idTokenResult = await cred.user.getIdTokenResult();
  const companyId = idTokenResult.claims.companyId;
  if (!companyId) {
    console.error("ไม่พบ companyId ใน token ของบัญชีนี้ — ไม่สามารถระบุ path ได้");
    process.exit(1);
  }
  console.log("companyId:", companyId);

  const colRef = collection(db, "companies", companyId, "inTickets");

  let q = colRef;
  const constraints = [];

  if (startDateStr) {
    constraints.push(
      where("paidTimestamp", ">=", Timestamp.fromDate(new Date(startDateStr + "T00:00:00Z")))
    );
  }
  if (endDateStr) {
    constraints.push(
      where("paidTimestamp", "<=", Timestamp.fromDate(new Date(endDateStr + "T23:59:59Z")))
    );
  }

  if (constraints.length > 0) {
    q = query(colRef, ...constraints);
  }

  console.log("\nกำลังดึงข้อมูลตั๋วรับซื้อ...");
  const snap = await getDocs(q);
  console.log(`เจอทั้งหมด ${snap.size} รายการ`);

  const rows = [];
  snap.forEach((doc) => {
    rows.push({ id: doc.id, ...doc.data() });
  });

  // บันทึก JSON แบบเต็ม (เก็บโครงสร้างทั้งหมด รวม weighedProductMap)
  fs.writeFileSync("./inTickets-full.json", JSON.stringify(rows, null, 2), "utf-8");
  console.log(`บันทึกไฟล์ inTickets-full.json (${rows.length} รายการ) แล้ว`);

  // บันทึก CSV แบบสรุป (1 แถว = 1 ตั๋ว) สำหรับเปิดใน Excel ได้เลย
  const csvHeader = [
    "id",
    "runningNumber",
    "paidTimestamp",
    "status",
    "payment",
    "beforeTax",
    "net",
    "note",
    "recordedBy",
  ];
  const csvLines = [csvHeader.join(",")];
  for (const r of rows) {
    const paidTs = r.paidTimestamp?.toDate
      ? r.paidTimestamp.toDate().toISOString()
      : r.paidTimestamp?.seconds
      ? new Date(r.paidTimestamp.seconds * 1000).toISOString()
      : "";
    csvLines.push(
      [
        r.id,
        r.runningNumber,
        paidTs,
        r.status,
        r.payment,
        r.beforeTax,
        r.net,
        r.note,
        r.recordedBy,
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  fs.writeFileSync("./inTickets-summary.csv", "\ufeff" + csvLines.join("\n"), "utf-8");
  console.log(`บันทึกไฟล์ inTickets-summary.csv (สรุป ${rows.length} แถว) แล้ว`);

  process.exit(0);
}

main().catch((err) => {
  console.error("เกิดข้อผิดพลาด:", err);
  process.exit(1);
});
