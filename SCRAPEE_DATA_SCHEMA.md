# Scrapee Firestore Data Schema — สำหรับพัฒนาโปรแกรมต่อ

เอกสารนี้สรุปโครงสร้างข้อมูลจริงที่ดึงได้จากระบบ Scrapee (บริษัท scharoenchai)
เพื่อใช้เป็นข้อมูลอ้างอิงสำหรับเขียนโปรแกรม/สคริปต์ดึงข้อมูลต่อ

---

## 1. ภาพรวมระบบ

- **แพลตฟอร์ม:** Google Firebase (Authentication + Cloud Firestore)
- **Firebase Project ID:** `scrappy-prod`
- **สถาปัตยกรรม:** Multi-tenant — แต่ละบริษัทลูกค้าแยกข้อมูลด้วย `companyId` เป็น subcollection
- **บริษัทที่ใช้งาน (ตัวอย่างนี้):** `scharoenchai`

### Firebase Client Config

```js
const firebaseConfig = {
  apiKey: "AIzaSyDbfhacQo3A2y5u4YuIlNk1JREwERifVhk",
  authDomain: "scrappy-prod.firebaseapp.com",
  projectId: "scrappy-prod",
};
```

> หมายเหตุ: `apiKey` ของ Firebase Client SDK ไม่ใช่ความลับ (ออกแบบมาให้ฝังใน frontend ได้)
> ความปลอดภัยที่แท้จริงถูกควบคุมด้วย **Firestore Security Rules** และ **Firebase Auth** แทน

---

## 2. การยืนยันตัวตน (Authentication)

- วิธี: Email/Password ผ่าน Firebase Authentication
- บัญชีตัวอย่าง: `may.cashier@scharoenchai.com` (role: `cashier`)
- หลัง login จะได้ **ID Token** ที่มี custom claims ฝังอยู่:
  ```json
  {
    "companyId": "scharoenchai",
    "role": "cashier"
  }
  ```
- `companyId` ใน token นี้คือ**กุญแจสำคัญ**ที่ใช้กำหนด path ของข้อมูลที่บัญชีนี้เข้าถึงได้

```js
const cred = await signInWithEmailAndPassword(auth, email, password);
const idTokenResult = await cred.user.getIdTokenResult();
const companyId = idTokenResult.claims.companyId; // "scharoenchai"
```

---

## 3. โครงสร้าง Collection ใน Firestore

รูปแบบ path: `companies/{companyId}/{subcollection}/{documentId}`

| Subcollection | เก็บข้อมูลอะไร | Sync เข้า Postgres |
|---|---|---|
| `companies/{companyId}/inTickets` | ตั๋วรับซื้อของเก่า | `in_tickets` + `in_ticket_items` |
| `companies/{companyId}/sellers` | ผู้ขาย/ลูกค้าที่มาขายของเก่า | `sellers` |
| `companies/{companyId}/products` | รายการสินค้า, ราคาตั้งต้น, หมวด | `products` |
| `companies/{companyId}/customerGroups` | กลุ่มลูกค้า + ราคาตามกลุ่ม | `customer_groups` |
| `companies/{companyId}/outTickets` | ตั๋วขาย (draft/shipping/accepted/paid/void) | `out_tickets` + `out_ticket_items` |
| `companies/{companyId}/transforms` | แปรสภาพสต็อก (input → output) | `stock_transforms` + `stock_transform_items` |
| `companies/{companyId}/employees` | พนักงานของบริษัท (id = Firebase UID) | `employees` |

**ไม่ดึง:** ใบเสนอราคา, ล็อคราคา, ATM, ตั้งค่าบริษัท  
`listCollectionIds` ของบริษัทนี้บัญชี cashier อ่านไม่ได้ — สำรวจทีละชื่อ  
collection `users` / `members` / `staff` / `companyUsers` ไม่มีเอกสาร (หรือว่าง)

ยอดสต็อกปัจจุบันไม่ได้อยู่เป็น collection แยกในตัวอย่างที่สำรวจ — อยู่ในเอกสาร `products` ถ้ามีฟิลด์ `stock`/`quantity` และประวัติเคลื่อนไหวมาจากตั๋วซื้อ-ขาย + `transforms`

---

## 4. Schema: `companies/{companyId}/inTickets/{ticketId}`

หนึ่งเอกสาร = หนึ่งตั๋วรับซื้อ (หนึ่งรอบที่รถมาขายของเก่าให้ร้าน)

| Field | ประเภท | คำอธิบาย | ตัวอย่างค่า |
|---|---|---|---|
| `runningNumber` | string | เลขที่ตั๋ว (running number) | `"71572"` |
| `number` | integer | เลขที่ตั๋วแบบตัวเลข (ซ้ำกับ runningNumber) | `71572` |
| `status` | string | สถานะตั๋ว — พบจริง: `paid` / `draft` / `void` | `"paid"` |
| `done` | boolean | ปิดรายการแล้วหรือยัง — **ใช้เป็นงานค้างไม่ได้** (ตั๋ว `paid` ก็มี `done=false`) | `true` |
| `payment` | string | ช่องทางจ่ายเงิน | `"payment_transfer"` |
| `paidBy` | string | UID ผู้ทำรายการจ่ายเงิน | `"piydEdQGoEf229cmYJzkWrVBjHv1"` |
| `recordedBy` | string | UID ผู้บันทึกตั๋ว | `"piydEdQGoEf229cmYJzkWrVBjHv1"` |
| `beforeTax` | double | ยอดก่อนภาษี (บาท) | `398983.81` |
| `tax` | integer | ภาษี | `0` |
| `taxCalculation` | string | วิธีคำนวณภาษี | `""` |
| `net` | double | ยอดสุทธิที่จ่ายจริง (บาท) | `398983.81` |
| `finalRounding` | string | รูปแบบการปัดเศษ | `"no_rounding"` |
| `pureWeight` | integer | น้ำหนักสุทธิรวม (กรัม หรือหน่วยที่ระบบใช้) | `15710` |
| `note` | string | บันทึกเพิ่มเติม | `"สระบุรี"` |
| `truck` | string / null | ข้อมูลรถบรรทุก (ถ้ามี) | `null` |
| `productIds` | array&lt;string&gt; | รายการ id ของสินค้าที่ชั่งในตั๋วนี้ | `["v5EO0Qn1kxurcNCto0ur", ...]` |
| `weighedProductMap` | map | **รายการของที่ชั่งซื้อละเอียด** (ดูหัวข้อ 4.1) | ดูด้านล่าง |
| `seller` | map | ข้อมูลผู้ขาย ณ เวลาที่ทำตั๋ว (snapshot) | ดูหัวข้อ 4.2 |
| `createdAt` | timestamp | เวลาสร้างตั๋ว | `2026-08-07T09:44:07.216Z` |
| `updatedAt` | timestamp | เวลาแก้ไขล่าสุด | `2026-08-07T09:45:51.980Z` |
| `paidTimestamp` | timestamp | เวลาชำระเงิน | `2026-08-07T09:45:50.755Z` |
| `paidAt` | timestamp | เวลาชำระเงิน (ซ้ำ/คู่กับ paidTimestamp) | `2026-08-07T09:45:51.980Z` |

**Metadata ของเอกสาร (จาก Firestore เอง ไม่ใช่ field):**
- `createTime` — เวลาที่เอกสารถูกสร้างใน Firestore
- `updateTime` — เวลาที่เอกสารถูกแก้ไขล่าสุด (**ใช้ตรวจสอบได้ว่ามีการแก้ไขย้อนหลังหรือไม่**)

### 4.1 `weighedProductMap` (map ของแต่ละรายการที่ชั่ง)

Key ของ map คือ `clientId` (UUID) แต่ละ item มีโครงสร้าง:

| Field | ประเภท | คำอธิบาย |
|---|---|---|
| `id` | string | id สินค้าในระบบ |
| `clientId` | string | UUID อ้างอิงฝั่ง client |
| `code` | string | รหัสสินค้า เช่น `"9BA008"` — แยกเป็น `branch_code` + `item_group` ตอน sync (ดู 5.5) |
| `name` | string | ชื่อสินค้า เช่น `"9BA008 แบตเตอรี่เล็กมอเตอร์ไซด์"` |
| `category` | string | หมวดหมู่หลัก เช่น `"category_other"` (ของ Scrapee ไม่ใช่หมวดบริษัท) |
| `subcategory` | string | หมวดหมู่ย่อย เช่น `"subcategory_subOther"` |
| `translatedCategory` | string | ชื่อหมวดหมู่ภาษาไทย เช่น `"อื่นๆ"` |
| `weight` | integer | น้ำหนักที่ชั่งได้ |
| `deduct` | integer | น้ำหนักที่หักออก (เช่น หักน้ำ/สิ่งเจือปน) |
| `unit` | string / null | หน่วย |
| `basePrice` | integer | ราคาตั้งต้นต่อหน่วย |
| `paidPrice` | double | ราคาที่จ่ายจริงต่อหน่วย |
| `priceReason` | string | เหตุผลที่ราคาต่าง เช่น `"ราคาพิเศษ"` |
| `priceReasonId` | string | รหัสเหตุผล เช่น `"special"` |
| `priceLocked` | boolean | ล็อกราคาไว้หรือไม่ |
| `tierPricing` | array&lt;map&gt; | ราคาแบบขั้นบันไดตามน้ำหนัก (`weight`, `additionalPrice`) |
| `wastes` | array | รายการของเสีย/สิ่งเจือปน (ถ้ามี) |
| `recordedBy` | string | UID ผู้บันทึกรายการนี้ |
| `localTimestamp` | timestamp | เวลาที่ชั่งรายการนี้ |

### 4.2 `seller` (map — snapshot ข้อมูลผู้ขาย ณ เวลาทำตั๋ว)

| Field | ประเภท | คำอธิบาย |
|---|---|---|
| `id` | string | id ผู้ขายในระบบ |
| `code` | string | รหัสลูกค้า เช่น `"01985"` |
| `fullname` | string | ชื่อผู้ขาย |
| `tel` | string | เบอร์โทร |
| `address` | string | ที่อยู่ |
| `type` | string | ประเภทลูกค้า |
| `customerGroup` | string / null | กลุ่มลูกค้า |
| `taxId` | string | เลขผู้เสียภาษี |
| `taxForBuying` | string | ข้อมูลภาษีสำหรับการซื้อ |
| `licensePlate` | string | ทะเบียนรถหลัก |
| `vehicleType` | string | ประเภทรถ เช่น `"vehicle_tenWheeler"` |
| `vehicles` | array&lt;map&gt; | รถทั้งหมดของผู้ขายราย นี้ (`licensePlate`, `vehicleType`) |
| `bankName`, `bankAccountName`, `bankAccountNumber` | string | บัญชีธนาคารหลัก |
| `bankName2`, `bankAccountName2`, `bankAccountNumber2` | string | บัญชีธนาคารสำรอง |
| `additionalBankAccounts` | array | บัญชีธนาคารเพิ่มเติม |
| `createdAt` | timestamp | วันที่สร้างข้อมูลผู้ขายนี้ |

---

## 5. Schema: `companies/{companyId}/sellers/{sellerId}`

โครงสร้างเดียวกับ field `seller` ในข้อ 4.2 (แยกเป็น collection ต่างหากด้วย เพื่อเก็บเป็น master data ของผู้ขายแต่ละราย)

---

## 5.1 Schema: `products`

Master สินค้า ดึงทั้ง collection ทุกโหมด sync

| Field | ประเภท | คำอธิบาย |
|---|---|---|
| `code` | string | รหัสสินค้า เช่น `"1BA_UPS005"` — แยกสาขา/หมวดตอน sync (ดู 5.5) |
| `name` | string | ชื่อสินค้า |
| `category` / `subcategory` | string | หมวดของ Scrapee เช่น `category_other` / `subcategory_subOther` — **ไม่ใช้แทนหมวดบริษัท** |
| `unit` | string | หน่วย เช่น `unit_kilogram` |
| `basePrice` | number | ราคาตั้งต้นปัจจุบัน |
| `kgConversion` | number | ตัวคูณแปลงเป็นกิโลกรัม |
| `hidden` | boolean | ซ่อนจากปุ่มชั่ง (อาจไม่มีในบางเอกสาร) |
| `tierPricing` | array | ราคาขั้นบันได |
| `color` / `backgroundColor` | string | สีปุ่มในแอป |
| `createdAt` / `updatedAt` | timestamp | เวลาสร้าง / แก้ |

## 5.2 Schema: `customerGroups`

| Field | ประเภท | คำอธิบาย |
|---|---|---|
| `name` | string | ชื่อกลุ่ม เช่น `"A10Direct"` |
| `description` | string | คำอธิบาย |
| `default` | boolean | กลุ่มเริ่มต้น |
| `sellers` | array | รายการผู้ขายในกลุ่ม |
| `productMap` | map | ราคา/ตั้งค่าสินค้าเฉพาะกลุ่ม (key = product id) |
| `recordedBy` | string | UID ผู้บันทึก |
| `updatedAt` | timestamp | เวลาแก้ล่าสุด |

## 5.3 Schema: `outTickets`

ตั๋วขาย — กรองช่วงวันด้วย **`paidAt`** (ไม่มี `paidTimestamp` แบบตั๋วซื้อ) incremental ใช้ `updatedAt`

| Field | ประเภท | คำอธิบาย |
|---|---|---|
| `number` | integer | เลขที่ตั๋วขาย |
| `title` | string | หัวข้อ/ชื่อผู้ซื้อบนตั๋ว |
| `status` | string | `draft` / `shipping` / `accepted` / `paid` / `void` |
| `buyer` | map | snapshot ผู้ซื้อ (`id`, `fullname`, `companyName`, `tel`, `address`, ...) |
| `weighedProductMap` | map | รายการสินค้าในตั๋ว (โครงสร้างคล้ายตั๋วซื้อ) |
| `beforeTax` / `tax` / `net` | number | ยอดเงิน |
| `cost` / `profit` / `profitLoss` | number | ต้นทุนและกำไรที่ระบบคำนวณไว้ |
| `pureWeight` / `acceptedWeight` / `weightLoss` | number | น้ำหนักสุทธิ / รับจริง / ส่วนต่าง |
| `truck` | map | ชั่งเข้า-ออก (`weight`, `weighedInAt`, `weighedOutAt`, `photos`) |
| `paidAt` | timestamp | เวลาบันทึกรับเงิน — ใช้กรองรายเดือน |
| `stockUpdatedAt` | timestamp | เวลาตัดสต็อก |
| `createdAt` / `updatedAt` | timestamp | เวลาสร้าง / แก้ |

## 5.4 Schema: `transforms`

เอกสารแปรสภาพ 1 ใบ = วัตถุดิบหลายรายการ (`input`) กลายเป็นสินค้าใหม่ (`output`)

| Field | ประเภท | คำอธิบาย |
|---|---|---|
| `input` | array | รายการของที่ใช้ไป (flatten เป็น `stock_transform_items.direction = input`) |
| `output` | array | รายการที่ได้ (direction = `output`) |
| `productIds` | array | id สินค้าที่เกี่ยวข้อง |
| `recordedBy` | string | UID ผู้บันทึก |
| `createdAt` | timestamp | ใช้กรองช่วงวันตอน bootstrap / reconcile |

## 5.5 รหัสบริษัท → `branch_code` / `item_group`

รหัสสินค้าของบริษัทมีรูปแบบ:

`{สาขา 1 หลัก}{หมวด ความยาวไม่คงที่}{ลำดับ 3 หลัก}` แล้วตามด้วยชื่อ

หมวดเป็นตัวอักษรและ `_` ได้ ไม่จำกัด 2 ตัว

| ต้นทาง | สาขา (`branch_code`) | หมวด (`item_group`) |
|---|---|---|
| `3BA033 (Din55-64)` | `3` | `BA` |
| `6Pet006 (PET สีเขียว)` | `6` | `Pet` |
| `1BA_UPS005 12V 14-17Ah` | `1` | `BA_UPS` |

อ่านจาก `code` ก่อน ถ้าไม่เข้า pattern ให้ลองคำแรกของ `name`  
ไม่เข้า pattern → ทั้งสองคอลัมน์เป็น `NULL` (ไม่เดาตัด 2 ตัว)

regex ที่ใช้ตอน sync และ backfill (`sql/004_product_code_parts.sql`):

```
/^([0-9])([A-Za-z][A-Za-z_]*)([0-9]{3})(?:\s+|$)/
```

คอลัมน์ `branch_code` และ `item_group` อยู่ที่ `products`, `in_ticket_items`, `out_ticket_items`, `stock_transform_items`  
อย่าใช้ `products.category` ของ Scrapee (`category_other` ฯลฯ) แทนหมวดบริษัท

กรองรายงานได้ตรงๆ เช่น `WHERE branch_code = '3' AND item_group = 'Pet'`

## 5.6 Schema: `employees`

`companies/{companyId}/employees/{uid}` — id เอกสาร = Firebase UID ตรงกับ `recorded_by` / `paid_by`

| Field | ประเภท | คำอธิบาย |
|---|---|---|
| `name` | string | ชื่อในระบบ เช่น `ann.cashier` → เก็บเป็น `employees.display_name` |
| `email` | string | อีเมล เช่น `ann.cashier@scharoenchai.com` |
| `createdAt` | timestamp | วันที่สร้างบัญชี |
| `buttonLayout` | map | เลย์เอาต์ปุ่มในแอป (เก็บใน `raw`) |
| `role` | string | **ไม่มีในเอกสารที่สำรวจ** — คอลัมน์ `employees.role` ว่างไว้ถ้าไม่มีฟิลด์นี้ |

ถ้าอ่าน collection ไม่ได้ sync จะข้าม แล้ว `INSERT` UID จากตั๋วเข้า `employees` โดยไม่มีชื่อ (`seedEmployeesFromTicketUids`)

## 5.7 ตั๋วเปิด / Alert งานค้าง

รายงานเงินยังกรองด้วยวันจ่าย (`paidTimestamp` / `paidAt`) เหมือนเดิม  
รอบเสริมดึงด้วย `createdAt` แล้วเก็บเฉพาะตั๋วเปิดลงตารางเดิม

| ประเภท | ถือว่าเปิด | ไม่ถือว่าเปิด |
|---|---|---|
| ซื้อ (`in_tickets`) | `status = draft` หรือ (`paid_timestamp` ว่าง และ status ไม่ใช่ `paid`/`void`) | `paid`, `void` — **ไม่ใช้ `done=false`** |
| ขาย (`out_tickets`) | `draft` / `shipping` / `accepted` | `paid`, `void` |

`incremental` ดึงตั๋วเปิดย้อน `OPEN_LOOKBACK_DAYS` (ค่าเริ่มต้น 90)  
`bootstrap` / `reconcile-month` ดึง `createdAt` ใน `START_DATE`..`END_DATE`

View สำหรับ Alert (SLA กรองตอน query เช่น `age_hours >= 24`):

- `v_open_in_tickets` — ซื้อค้าง + ชื่อจาก `employees` + `age_hours`
- `v_open_out_tickets` — ขายค้าง + ชื่อจาก `employees` + `age_hours`

---

## 6. วิธีเข้าถึงข้อมูล (สำหรับเขียนโปรแกรม)

### 6.1 ผ่าน Firebase Client SDK (แนะนำ — ใช้ auth/security rules ปกติ)

```js
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, getDocs, query, where, Timestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDbfhacQo3A2y5u4YuIlNk1JREwERifVhk",
  authDomain: "scrappy-prod.firebaseapp.com",
  projectId: "scrappy-prod",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const cred = await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
const { claims } = await cred.user.getIdTokenResult();
const companyId = claims.companyId; // "scharoenchai"

const colRef = collection(db, "companies", companyId, "inTickets");
// กรองตามช่วงวันที่ (ใช้ paidTimestamp)
const q = query(
  colRef,
  where("paidTimestamp", ">=", Timestamp.fromDate(new Date("2026-08-01"))),
  where("paidTimestamp", "<=", Timestamp.fromDate(new Date("2026-08-31T23:59:59")))
);
const snap = await getDocs(q);
const tickets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
```

### 6.2 ข้อมูล Auth ที่ต้องใช้

| รายการ | ค่า |
|---|---|
| Email | `may.cashier@scharoenchai.com` |
| Password | **ไม่บันทึกในเอกสารนี้ — ใส่ผ่าน environment variable ตอนรันเสมอ** |
| companyId | `scharoenchai` (แต่แนะนำให้ดึงจาก token claims เสมอ ไม่ hardcode) |

---

## 7. ข้อควรระวังสำหรับการพัฒนาโปรแกรมต่อ

1. **ข้อมูลแก้ไขย้อนหลังได้** — ใช้ field `updateTime` (metadata ของเอกสาร) หรือ `updatedAt` เพื่อตรวจว่ามีการแก้ไขหลังจากที่เคยดึงไปแล้วหรือไม่ ถ้าต้องการ sync ให้ตรงกับฐานข้อมูลเสมอ ควรดึงข้อมูลใหม่เป็นระยะ ไม่ใช่ cache ถาวร
2. **Timestamp เป็น Firestore Timestamp object** ไม่ใช่ string ธรรมดา ต้องแปลงด้วย `.toDate()` ก่อนใช้งานหรือ export
3. **weighedProductMap เป็น map ไม่ใช่ array** — key เป็น UUID แบบสุ่ม ต้องใช้ `Object.values()` หรือ loop ด้วย `Object.entries()` ในการอ่าน
4. **จำนวนข้อมูลทั้งปีอาจมีหลักพัน–หมื่นตั๋ว** — แนะนำ query แบบแบ่งช่วงวันที่ (ใช้ `where` กับ `paidTimestamp`) แทนการดึงทั้งหมดทีเดียว โดยเฉพาะถ้าจะรันบ่อยๆ
5. **Firestore Security Rules เป็นตัวควบคุมสิทธิ์จริง** — บัญชี role `cashier` อาจเข้าถึงได้จำกัดกว่า role อื่น ถ้าต้องการสิทธิ์กว้างขึ้นให้ตรวจสอบกับผู้ดูแลระบบ Scrapee
6. **ห้าม hardcode รหัสผ่านในโค้ด** — ใช้ environment variable หรือ secret manager เสมอ

---

## 8. ไฟล์ที่เกี่ยวข้อง

- `src/sync-to-postgres.ts` — sync เข้า Postgres (โหมด bootstrap / incremental / reconcile-month)
- `src/compare-month-counts.ts` — เทียบจำนวนตั๋วซื้อและตั๋วขายรายเดือน
- `src/discover-collections.ts` — สำรวจ collection / ตัวอย่างเอกสาร
- `sql/001_schema.sql` — ตารางตั๋วซื้อ + sellers
- `sql/003_dashboard_collections.sql` — products, customer_groups, out_tickets, stock_transforms
- `sql/004_product_code_parts.sql` — คอลัมน์ `branch_code` / `item_group` + backfill จากรหัสบริษัท
- `sql/005_employees_and_open_tickets.sql` — ตาราง `employees` + view ตั๋วเปิด `v_open_in_tickets` / `v_open_out_tickets`
- `export-buy-tickets (1).js` — สคริปต์ export ตั๋วซื้อแบบ JSON/CSV (รุ่นแรก)
- `package.json` — dependency (`firebase`, `pg`, `playwright`)
