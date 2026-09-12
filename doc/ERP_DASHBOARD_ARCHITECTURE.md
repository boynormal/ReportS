# สถาปัตยกรรม Dashboard — จากคลัง Scrapee จริง

เอกสารนี้แยก **สิ่งที่มีอยู่แล้ว** กับ **สิ่งที่เสนอใหม่**  
ตัวเลขในเอกสารมาจาก Postgres ท้องถิ่น ณ 2026-09-07 (บริษัท `scharoenchai`)  
ห้ามเดา table / API / สิทธิ์ที่ไม่มีใน repo นี้

ข้อตกลงที่ล็อกแล้ว:

1. กำไรรอบแรก = **กำไรจากการขาย** จาก `out_tickets` — ห้ามเรียกกำไรสุทธิ
2. `branch_code` = prefix รหัสสินค้าที่รายการ — ห้ามสรุปว่าตั๋วใบนี้เป็นของสาขา X
3. บริษัทเดียวเท่านั้น — ไม่มีสวิตช์บริษัท / GLOBAL
4. ความสด = near real-time หลัง CLI sync หรือปุ่มเว็บ `POST /api/sync` (incremental เท่านั้น ไม่แทนที่ `npm run auth`) + Alert จาก view ตั๋วเปิด + historical จากตั๋วจ่ายแล้ว
5. แกนหน้าจอ = **ซื้อเข้า → สต็อก → ขายออก** ไม่ใช่ Sales-first

คำที่ห้ามใช้บนการ์ด: กำไรสุทธิ, สาขาของตั๋ว, real-time

---

## 1. Existing ERP Architecture

**มีอยู่แล้ว:** repo นี้เป็น CLI sync ไม่ใช่ ERP ที่มีหน้าจอ

```
Scrapee Firestore (scrappy-prod / companies/scharoenchai)
        ↓  npm run sync  (bootstrap | incremental | reconcile-month)
PostgreSQL คลังกลาง
        ↓  (ยังไม่มี)
Dashboard / API / RBAC
```

| ชั้น | สถานะจริง |
|---|---|
| Frontend / routes / charts | ไม่มี |
| HTTP API | ไม่มี |
| Login ของ Dashboard | ไม่มี — Firebase ใช้แค่ดึงข้อมูล |
| RBAC ในคลัง | ไม่มี — `employees.role` ว่าง |
| แหล่งความสด | หลังรอบ sync ไม่ได้อ่าน Firestore ตรงจาก Dashboard |

**เสนอใหม่:** ชั้น API + login อ่าน Postgres ชุดเดียว ไม่สร้างฐานรายงานคู่ขนานในรอบแรก

---

## 2. Database Structure

**มีอยู่แล้ว (12 ตาราง + 2 view)**

| ตาราง / view | บทบาท | PK |
|---|---|---|
| `in_tickets` | หัวตั๋วซื้อ | `id` |
| `in_ticket_items` | รายการชั่งซื้อ + `branch_code` / `item_group` | `(ticket_id, client_id)` FK → in_tickets |
| `out_tickets` | หัวตั๋วขาย + `cost` / `profit` / `profit_loss` | `id` |
| `out_ticket_items` | รายการขาย + `branch_code` / `item_group` | `(ticket_id, client_id)` |
| `products` | สินค้า + `stock_qty` snapshot + `base_price` | `id` |
| `sellers` | ผู้ขายของเก่าให้ร้าน | `id` |
| `customer_groups` | กลุ่มราคา | `id` |
| `stock_transforms` | หัวแปรสภาพ | `id` |
| `stock_transform_items` | วัตถุดิบ/ผลผลิต | `(transform_id, direction, line_index)` |
| `employees` | พนักงาน (UID = `recorded_by` / `paid_by`) | `id` |
| `sync_state` / `sync_runs` | cursor และประวัติ sync | — |
| `v_open_in_tickets` | ซื้อค้าง + ชื่อคน + `age_hours` | view |
| `v_open_out_tickets` | ขายค้าง + ชื่อคน + `age_hours` | view |

ไม่มี: VIEW อื่น, materialized view, function, trigger, enum, ตาราง `branches`, `buyers`, `permissions`

**นับจริง 2026-09-07**

| ชุดข้อมูล | จำนวน |
|---|---|
| ตั๋วซื้อ (ไม่ลบ) | 22,676 |
| รายการซื้อ | 81,444 |
| ตั๋วขาย | 3,764 |
| รายการขาย | 8,981 |
| สินค้า | 1,431 |
| ผู้ขาย | 3,487 |
| กลุ่มลูกค้า | 53 |
| แปรสภาพ | 845 |
| พนักงาน (มีชื่อครบ) | 36 |
| ซื้อค้าง | 8 |
| ขายค้าง | 48 |

สถานะซื้อ: `paid` 22,662 / `draft` 8 / `void` 6  
สถานะขาย: `paid` 3,714 / `shipping` 24 / `draft` 18 / `accepted` 6 / `void` 2

`branch_code` ที่สินค้า: `1` (205), `3` (270), `4` (205), `5` (268), `6` (268), `9` (205) — ไม่มี 2, 7, 8

ตั๋วที่รายการมีมากกว่า 1 `branch_code`: ซื้อ **52 ใบ** จาก 22,668 / ขาย **3 ใบ** จาก 3,763  
หลักฐานว่าห้ามติดป้ายสาขาที่หัวตั๋ว

---

## 3. ERP Module Map

```
Company (scharoenchai เดียว)
├── Employees          มี — ชื่อ/อีเมล ไม่มี role / สาขาของคน
├── Sellers            มี — คนที่มาขายของให้ร้าน
├── Customer groups    มี
├── Products           มี — ราคาตั้งต้น + stock snapshot
├── Purchase           มี — in_tickets / items
├── Sales              มี — out_tickets / items
├── Inventory          บางส่วน — snapshot + เคลื่อนไหวจากตั๋ว/แปรสภาพ
├── Stock transform    มี
└── Sync meta          มี
```

**ไม่มีในคลังนี้:** Finance แยก, TMS, Maintenance, Tire, Warehouse แยก, Production (นอกแปรสภาพ), IoT, PO, lock-price, ATM, Users/Permissions ของแอป, master สาขา, master ผู้ซื้อปลายทาง

---

## 4. Business Process Flow

| Process | มีในระบบหรือไม่ | Table / แหล่ง | Status ที่ใช้ | Dashboard ใช้ได้หรือไม่ |
|---|---|---|---|---|
| ลูกค้ามาขาย (`sellers`) | มี | `sellers` | — | ใช้ได้ |
| เปิดตั๋วรับซื้อ | มี | `in_tickets` | `draft` | ใช้ได้ผ่าน `v_open_in_tickets` |
| ชั่งน้ำหนัก | มี | `in_ticket_items.weight` / `deduct` — สุทธิ `GREATEST(weight − deduct, 0)` | — | ใช้ได้ |
| ตรวจสินค้า | ไม่มีขั้นตอนแยก | — | — | ใช้ไม่ได้ |
| ประเมินราคา | มีบางส่วน | `base_price` / `paid_price` / `price_reason` | — | ใช้ได้ |
| จ่ายเงินซื้อ | มี | `paid_timestamp`, `net`, `payment` | `paid` | ใช้ได้ (historical) |
| เข้าสต็อก | อนุมาน | ตั๋วซื้อ + `products.stock_qty` | — | snapshot ใช้ได้ ประวัติรายวันไม่มี |
| คัดแยก / แปรสภาพ | มี | `stock_transforms` | — | ใช้ได้ |
| ขายออก | มี | `out_tickets` | draft/shipping/accepted/paid/void | ใช้ได้ |
| รับเงินขาย | มี | `paid_at`, `net` | `paid` | ใช้ได้ |
| กำไรทั้งธุรกิจ | ไม่มี | มีแค่กำไรจากการขายที่ header | — | ห้ามแสดงเป็นกำไรสุทธิ |

---

## 5. User / Role Structure

**มีอยู่แล้ว**

- `employees`: UID, `display_name`, `email` — ไม่มี `role` ในเอกสาร Firestore ที่สำรวจ
- JWT sync มี claim `role` เช่น `cashier` แต่ไม่ถูกเก็บลงคลัง
- `recorded_by` / `paid_by` บนตั๋ว = UID ไป join `employees` ได้

**เสนอใหม่ (ยังไม่มีในระบบ)**

| Role เอกสาร | ใช้ทำอะไร | ผูกข้อมูลยังไง |
|---|---|---|
| Executive | ภาพรวมบริษัท | ทั้งคลังบริษัทเดียว |
| Branch Manager | คุมงานระดับรายการตาม `branch_code` | กรอง item ไม่กรองหัวตั๋ว |
| Staff | งานของตัวเอง | `recorded_by = session.uid` |

ไม่มี Department ในข้อมูล  
ไม่มีการผูกพนักงานกับ `branch_code`

---

## 6. RBAC Analysis

**มีอยู่แล้ว:** ไม่มีตารางสิทธิ์ ไม่มี middleware ไม่มีบังคับสิทธิ์ที่ backend ของ Dashboard

**ปัญหา:** ถ้าสร้างหน้าจอก่อนมี API ที่กรอง scope จะพึ่งการซ่อนแท็บฝั่ง frontend ซึ่งห้ามใช้เป็นที่พึ่งเดียว

**เสนอใหม่**

| Role | เห็น | ไม่เห็น |
|---|---|---|
| Executive | ซื้อ ขาย สต็อก กำไรจากการขาย ผู้ขาย Alert ทั้งบริษัท | ต้นทุนที่ไม่มี, กำไรสุทธิปลอม |
| Manager | รายการที่ `branch_code` ตรงสาขาที่ได้รับมอบ + งานค้างที่เกี่ยวข้อง | ทั้งบริษัทแบบไม่กรอง, สรุปสาขาของตั๋ว |
| Staff | ตั๋วที่ตัวเอง `recorded_by` | กำไรบริษัท, ผู้ขายทั้งก้อน, สต็อกทั้งคลัง (ถ้าไม่เกี่ยวกับงาน) |

บังคับที่ API/SQL เท่านั้น ยังไม่มีโค้ดนี้ใน repo

---

## 7. Data Scope Analysis

| Scope | มีข้อมูลรองรับหรือไม่ | ใช้ในรอบนี้ |
|---|---|---|
| GLOBAL | ไม่มีหลายบริษัท | ไม่ทำ |
| COMPANY | มี `company_id` | กรองใน query เป็นสุขลักษณะ — UI ไม่มีสวิตช์บริษัท |
| BRANCH | มีแค่ `branch_code` ที่รายการ | ใช้กรอง item เท่านั้น |
| DEPARTMENT | ไม่มี | ไม่ทำ |
| USER | มี UID + `employees` | Staff หลังมี login |

---

## 8. KPI Dictionary

สถานะ: A = พร้อมใช้ / B = ต้องสร้าง query หรือ view / C = มีบางส่วน / D = ไม่มี

หน่วยเงิน = บาท (`net`, `paid_price`)  
หน่วยน้ำหนัก = ค่าในคลัง (`pure_weight`, `weight`) — เอกสารต้นทางระบุว่าอาจเป็นกรัมหรือหน่วยระบบ ห้ามสมมติ kg ในป้ายถ้ายังไม่ยืนยัน `unit` / `kg_conversion`

### ซื้อ (ศูนย์กลาง)

| KPI | สูตร | แหล่ง | สถานะ |
|---|---|---|---|
| ยอดซื้อ | `SUM(in_tickets.net)` | ตั๋ว `paid` / มี `paid_timestamp` | A |
| น้ำหนักซื้อ | `SUM(in_tickets.pure_weight)` หรือผลรวมรายการ | header หรือ items | A / B |
| จำนวนใบซื้อ | `COUNT(*)` ตั๋วจ่ายแล้ว | `in_tickets` | A |
| ราคาซื้อเฉลี่ยต่อน้ำหนัก | `SUM(net) / NULLIF(SUM(pure_weight),0)` | header | B |
| ยอดต่อใบ | `AVG(net)` | header | A |
| ราคาซื้อรายการ | `paid_price` | `in_ticket_items` | A |
| ยอดซื้อตาม `item_group` / `branch_code` | รวมที่รายการ `(GREATEST(weight − deduct, 0)) * paid_price` (ตรวจ unit ก่อน) | items | B |

ปี 2026 จ่ายแล้วในคลัง: ยอดซื้อ **1,557,668,241** / ใบ **22,668** / น้ำหนักคลัง **71,728,396**

### ขาย

| KPI | สูตร | แหล่ง | สถานะ |
|---|---|---|---|
| ยอดขาย | `SUM(out_tickets.net)` ที่ `paid` | header | A |
| น้ำหนักขาย | `SUM(pure_weight)` / `accepted_weight` | header | A |
| จำนวนใบขาย | `COUNT(*)` | header | A |
| ต้นทุนขาย (ของ Scrapee) | `SUM(cost)` | header | A |
| **กำไรจากการขาย** | `SUM(out_tickets.profit)` | header — **ห้ามติดป้ายกำไรสุทธิ** | A |
| **ส่วนต่างขาย−ซื้อ** (`/trade?tab=profit`) | ยอดขายรายการ − ยอดซื้อรายการ (น้ำหนักสุทธิ × ราคา; กก. = น้ำหนักขาย − น้ำหนักซื้อ) | items ทั้งสองฝั่ง — **ห้ามติดป้ายกำไรสุทธิ** และไม่ใช่กำไรจากการขายของ Scrapee | A |
| profit_loss | `SUM(profit_loss)` | header | A |

ปี 2026: ยอดขาย **1,589,592,825** / ใบ **3,716** / ต้นทุนขาย **1,569,653,691** / กำไรจากการขาย **19,939,134**

### สต็อก

| KPI | สูตร | แหล่ง | สถานะ |
|---|---|---|---|
| ปริมาณคงเหลือ | `stock_qty` | `products` snapshot ตอน sync | A |
| มูลค่าสต็อกโดยประมาณ | `SUM(stock_qty * base_price)` | ไม่ใช่ต้นทุนจริง | C |
| รายสินค้าแยกสาขา/หมวด (`/trade?tab=stock`) | สินค้าที่ `stock_qty > 0` จัดกลุ่ม `branch_code` → `item_group` | snapshot — ห้ามเรียกต้นทุนเฉลี่ย | A |
| เคลื่อนไหว | ซื้อ − ขาย ± แปรสภาพ | 3 ตาราง | B |
| Aging / slow moving / turnover | ต้องสร้างประวัติรายวัน | ไม่มี | D |

### ลูกค้า (ผู้ขายของเก่า)

กลุ่มบน `/trade?tab=customers` = **วงเล็บชุดสุดท้ายใน `sellers.fullname`** เช่น `(A123)` `(AOUT)` `(ASC)` ไม่มีวงเล็บ = `ไม่ระบุ` — ไม่ใช้ `customer_groups` ของ Scrapee และไม่ใช้ `sellers.code`

| KPI | สูตร | แหล่ง | สถานะ |
|---|---|---|---|
| มาล่าสุด / หายไปกี่วัน (`/trade?tab=customers`) | `MAX(paid_timestamp)` ทั้งประวัติ; วันปฏิทินกรุงเทพถึงวันนี้ | `in_tickets` paid | A |
| สรุปซื้อเข้ารายลูกค้า (`/trade?tab=customer-buy`) | น้ำหนักสุทธิ × `kg_conversion` / × `paid_price` ต่อ `seller_id` × เดือน | items จ่ายแล้วในปีนั้น — **ห้ามติดป้ายกำไรสุทธิ** | A |
| สรุปขายออกรายลูกค้า (`/trade?tab=customer-sell`) | น้ำหนักสุทธิ × `kg_conversion` / × `paid_price` ต่อ `buyer_id` × เดือน | items จ่ายแล้ว · ชื่อจาก snapshot บนตั๋ว — **ห้ามติดป้ายกำไรสุทธิ** | A |
| ปริมาณ/ยอดปีที่เลือก | น้ำหนักสุทธิ × `kg_conversion` / × `paid_price` ต่อ `seller_id` | items จ่ายแล้วในปีนั้น | A |
| Active / top sellers | นับใบหรือ `SUM(net)` ต่อ `seller_id` | `in_tickets` | B |
| New sellers | `sellers.created_at` ในช่วง | `sellers` | B |
| CLV | — | ไม่มี | D |
| ผู้ซื้อปลายทาง | snapshot บนตั๋วขาย | ไม่มี master | C |

### สาขา (ระดับรายการเท่านั้น)

| KPI | สูตร | แหล่ง | สถานะ |
|---|---|---|---|
| น้ำหนัก/มูลค่ารายการตาม `branch_code` | รวมที่ items | items | B |
| จำนวนใบที่มีรายการสาขานั้น | `COUNT(DISTINCT ticket_id)` — ใบคละสาขานับซ้ำได้หลายสาขา | items | B — ต้องติดป้าย |
| จำนวนใบของสาขา (ใบเป็นของสาขาเดียว) | — | ตั๋วไม่มี `branch_id` | **ห้ามทำ** |

### งานค้าง

| KPI | สูตร | แหล่ง | สถานะ |
|---|---|---|---|
| ซื้อค้าง | แถวใน `v_open_in_tickets` | view | A |
| ขายค้าง | `v_open_out_tickets` | view | A |
| เกิน SLA | `age_hours >= 24` (กฎเรา ไม่มีใน Scrapee) | view | A |

ณ วันสำรวจ: ซื้อค้าง 8 ใบ (เกิน 24 ชม. 1) / ขายค้าง 48 ใบ (เกิน 24 ชม. 39, อายุสูงสุด ~5,805 ชม.)

---

## 9. Executive Dashboard

คำถามที่ต้องตอบ: **ธุรกิจซื้อ-สต็อก-ขายเป็นอย่างไร และควรตัดสินใจอะไร**

ลำดับแท็บ (ซื้อก่อนขาย):

1. Overview — ยอดซื้อ, น้ำหนักซื้อ, จำนวนใบ, สต็อกโดยประมาณ, ยอดขาย, กำไรจากการขาย, Alert สรุป
2. Purchase — แนวโน้มซื้อ, ราคาเฉลี่ย, mix `item_group`
3. Inventory — snapshot ตามหมวด/รหัสสาขาสินค้า, แปรสภาพ
4. Sales — ยอดขาย น้ำหนัก ใบ
5. กำไรจากการขาย — `profit` / `cost` จากตั๋วขายเท่านั้น + คำอธิบายว่าไม่ใช่กำไรสุทธิ
   - หน้า `/trade?tab=profit` เป็นส่วนต่างยอดขายรายการ − ยอดซื้อรายการ ไม่ใช้ `out_tickets.profit` และห้ามติดป้ายกำไรสุทธิ
6. Customer — top `sellers`
7. Product — สินค้าเคลื่อนไหว
8. Branch mix — สัดส่วนรายการตาม `branch_code` (ไม่ใช่ผลงานสาขาแบบ P&L)
9. Alert Center — ซื้อค้าง, ขายค้างเกิน 24 ชม., sync ล่าสุดจาก `sync_runs`

ไม่ใส่: กำไรสุทธิ, สวิตช์บริษัท, ตั๋วต่อสาขาแบบหัวตั๋ว

---

## 10. Branch Manager Dashboard

คำถาม: **รายการของรหัสสาขานี้เป็นอย่างไร และมีอะไรต้องแก้**

กรองทุกอย่างที่ **รายการ** `branch_code = :code`  
ป้ายคงที่บนหน้า: *ตั๋วอาจมีหลายรหัสสาขา — ตัวเลขใบนับจากรายการ ไม่ใช่เจ้าของตั๋ว*

แท็บ:

1. Overview รายการสาขา — น้ำหนัก/มูลค่าซื้อขายของรายการ, สต็อกสินค้าที่รหัสตรงสาขา
2. Purchase
3. Inventory
4. Sales
5. Pending — ตั๋วเปิดที่มีรายการรหัสนี้
6. Staff — ใคร `recorded_by` บนรายการ/ตั๋วที่เกี่ยวข้อง (ชื่อจาก `employees`)
7. Alert

ห้ามการ์ด "จำนวนตั๋วของสาขา X" โดยไม่ระบุวิธีนับ  
ห้ามมอบ `branch_code` ให้พนักงานจากตาราง — ไม่มีข้อมูลนี้

---

## 11. Staff Dashboard

คำถาม: **วันนี้ต้องทำอะไร และมีงานค้างอะไร**

**มีข้อมูล:** ตั๋วเปิด + `recorded_by` + ชื่อใน `employees`  
**ยังไม่มี:** login ของ Dashboard จึงยังผูก "ฉัน" ไม่ได้ — ติดป้ายเสนอใหม่

แท็บเมื่อมี login:

1. My Work — `v_open_*` ที่ `recorded_by = uid`
2. Pending — งานเกิน 24 ชม. ของตัวเอง
3. Purchase / Weighing — ตั๋วซื้อที่ตัวเองบันทึก
4. Sales — ตั๋วขายค้างของตัวเอง
5. My Activity — รายการล่าสุด

ไม่โชว์กำไรบริษัท, ไม่โชว์ผู้ขายทั้งก้อน  
ตัด Product Inspection (ไม่มีขั้นตอนในคลัง)  
ตัด SLA ของ Scrapee (ไม่มี) ใช้ `age_hours`

---

## 12. Navigation / Tab Structure

บริษัทเดียว — ไม่มีเมนูบริษัท

```
[ Executive | Manager | Staff ]     ← เลือก role หลังมี login (เสนอใหม่)
ช่วงเวลา: วันนี้ | เมื่อวาน | 7 วัน | เดือนนี้ | เดือนก่อน | ปีนี้ | กำหนดเอง
ความสด: แสดง synced_at / sync_runs ล่าสุด  — ไม่ติดป้าย real-time

Executive: Overview · ซื้อ · สต็อก · ขาย · กำไรจากการขาย · ลูกค้า · สินค้า · สัดส่วนรหัสสาขา · Alert
Manager:   Overview รายการ · ซื้อ · สต็อก · ขาย · งานค้าง · พนักงาน · Alert
Staff:     งานของฉัน · ค้าง · ซื้อ · ขาย · กิจกรรม
```

ตัวกรองร่วม: วันที่จ่าย (historical) / วันที่สร้าง (งานค้าง) / `item_group` / `branch_code` ที่รายการ / ผู้บันทึก

---

## 13. Drill Down

รองรับจากข้อมูลจริง:

```
บริษัท (เดียว)
  → รหัสสาขาสินค้า (branch_code ที่รายการ)
    → หมวดบริษัท (item_group)
      → สินค้า (product_id / code)
        → รายการในตั๋ว
          → ตั๋ว
            → รายละเอียด + ผู้บันทึก (employees)
```

**ไม่รองรับ:** บริษัท → สาขาองค์กร → ตั๋วทั้งใบเป็นของสาขา  
ถ้าตั๋วคละรหัส (ซื้อ 52 ใบ, ขาย 3 ใบ) ต้องแสดงรายการทุกสาขาในใบนั้น ไม่เดาเจ้าของใบ

ไม่ต้องเพิ่ม `branch_id` บนตั๋วโดยเดา

---

## 14. Alert Center

แหล่งที่มี: `v_open_in_tickets`, `v_open_out_tickets`, `sync_runs`  
SLA = กฎเรา `age_hours >= 24`

| Role | Alert | แหล่ง | พร้อมใช้ |
|---|---|---|---|
| Executive | ขายค้างจำนวนมาก / เกิน 24 ชม. | view ขาย | A — ณ วันสำรวจ 39 จาก 48 ใบ |
| Executive | ยอดซื้อ/ขายผิดช่วง (เทียบเดือน) | historical query | B |
| Executive | กำไรจากการขายต่ำผิดปกติ | `SUM(profit)` | B — อย่าเรียกกำไรสุทธิ |
| Manager | ตั๋วค้างที่มีรายการรหัสสาขา | view + items | B |
| Manager | สินค้า snapshot สูง/ต่ำ | `products.stock_qty` | C |
| Staff | งานของฉัน / เกิน SLA | view + uid | C จนกว่ามี login |
| ทั้งชุด | sync ล้มเหลว | `sync_runs.error` | A |

ไม่ทำในรอบแรก: ยอดซื้อผิดปกติแบบ ML, stock aging, งานเกิน SLA ของ Scrapee

---

## 15. Data Source Mapping

| คำถามธุรกิจ | ตาราง | หมายเหตุ |
|---|---|---|
| ข้อมูลซื้อเข้า | `in_tickets` + `in_ticket_items` | รายงานเงินใช้ `paid_timestamp` |
| ข้อมูลขายออก | `out_tickets` + `out_ticket_items` | รายงานเงินใช้ `paid_at` |
| สต็อก | `products.stock_qty` + ตั๋ว + แปรสภาพ | snapshot ไม่ใช่รายวัน |
| ลูกค้า | `sellers` | ผู้ขายของเก่า — กลุ่มบน `/trade` = วงเล็บท้ายชื่อ |
| สินค้า / ราคาตั้งต้น | `products.base_price`, `tier_pricing` | ราคาจ่ายจริงอยู่ที่ item |
| สาขา | `*.branch_code` ที่รายการ | ไม่ใช่สาขาของตั๋ว |
| ผู้ใช้ | `employees` | ไม่มี role |
| ต้นทุนขาย / กำไรจากการขาย | `out_tickets.cost`, `profit` | ค่าที่ Scrapee คำนวณ |
| น้ำหนัก | `pure_weight` ที่หัวตั๋ว; รายการใช้ `GREATEST(weight − deduct, 0)` | ตรวจหน่วยก่อนติดป้าย kg |
| ยอดเงิน | `net`, `before_tax`, `paid_price` | |
| สถานะตั๋ว | `status` | ซื้อ: paid/draft/void — ขาย: draft/shipping/accepted/paid/void |
| งานค้าง | `v_open_*` | ห้ามใช้ `done=false` — หน้า `/trade?tab=open` แสดงซื้อค้างและขายค้าง |

---

## 16. Gap Analysis

| Dashboard | KPI | แหล่ง | สถานะ | Action |
|---|---|---|---|---|
| ซื้อ | ยอด / ใบ / น้ำหนัก | `in_tickets` | A | ใช้ได้ |
| ซื้อ | ราคาเฉลี่ย / mix หมวด | items | B | view รายวัน |
| สต็อก | ปริมาณ snapshot | `products` | A | ใช้ได้ |
| สต็อก | มูลค่าโดยประมาณ | `stock_qty * base_price` | C | ติดป้ายประมาณการ |
| สต็อก | Aging / turnover | — | D | ต้องออกแบบประวัติ |
| ขาย | ยอด / กำไรจากการขาย | `out_tickets` | A | ใช้ได้ — ห้ามชื่อกำไรสุทธิ |
| กำไรทั้งธุรกิจ | — | ไม่มีต้นทุนซื้อครบ | D | ไม่แสดง |
| สาขา | mix รายการ | `branch_code` | B | กรอง item |
| สาขา | เจ้าของตั๋ว | ไม่มี | D | ห้ามสร้าง |
| ลูกค้า | กลุ่มวงเล็บท้ายชื่อ / วันหาย / ปริมาณปี | `sellers` + `in_tickets` paid | A | `/trade?tab=customers` |
| ลูกค้า | สรุปซื้อเข้า × เดือน | `in_tickets` paid + items | A | `/trade?tab=customer-buy` |
| ลูกค้า | สรุปขายออก × เดือน | `out_tickets` paid + items · snapshot ผู้ซื้อ | A | `/trade?tab=customer-sell` |
| ลูกค้า | top sellers | `in_tickets` | B | view |
| ลูกค้า | CLV / ผู้ซื้อ master | — | D | ไม่ทำรอบแรก |
| Alert ขายค้าง | view | A | ใช้ได้ทันที |
| Staff my work | UID | C | ต้องมี login |
| RBAC | — | D | API ใหม่ |

---

## 17. Recommended Database Views

Reuse ตารางที่มีและ `v_open_*` ก่อน  
**เสนอใหม่เมื่อลงมือทำ Dashboard** (ยังไม่สร้างในรอบเอกสารนี้)

| View | ใช้ทำ | Grain |
|---|---|---|
| `v_daily_purchase` | ยอดซื้อ น้ำหนัก ใบ ต่อวัน | วัน + company |
| `v_daily_sales` | ยอดขาย ต้นทุน กำไรจากการขาย ต่อวัน | วัน + company |
| `v_item_purchase_mix` | ซื้อตาม `branch_code` + `item_group` | วัน + รหัส |
| `v_item_sales_mix` | ขายตามรหัสรายการ | วัน + รหัส |
| `v_seller_period` | top ผู้ขาย | ช่วง + seller |
| `v_stock_snapshot` | `stock_qty`, ประมาณมูลค่า, รหัส | สินค้า |

Materialized view: ยังไม่จำเป็นจนกว่า daily mix จะช้า  
Reporting table แยก: ยังไม่ทำ

---

## 18. Recommended API

**มีอยู่แล้ว:** ไม่มี HTTP API

**เสนอใหม่เมื่อสร้างหน้าจอ** — อ่าน Postgres ชุดเดียว บังคับ scope ที่ backend

| API | ทำอะไร | Scope |
|---|---|---|
| `GET /me` | uid หลัง login | USER |
| `GET /kpis/overview` | การ์ด Executive แกนซื้อ | COMPANY (เดียว) |
| `GET /kpis/purchase` | ซื้อ + mix | รายการ `branch_code` ถ้า Manager |
| `GET /kpis/sales` | ขาย + กำไรจากการขาย | เช่นกัน |
| `GET /kpis/inventory` | snapshot | เช่นกัน |
| `GET /alerts/open` | จาก `v_open_*` | Executive ทั้งหมด / Manager ตามรายการ / Staff ตาม uid |
| `GET /tickets/:id` | drill ลงตั๋ว + รายการ | ตรวจสิทธิ์ |
| `GET /sync/status` | `sync_runs` ล่าสุด + `running` | ทุก role |
| `POST /api/sync` | เริ่ม incremental จาก Scrapee เข้าคลัง — ไม่เรียก `npm run auth` | ปุ่มอัปเดทบน `/` และ `/trade` |

ยังไม่กำหนดเทคโนโลยีเว็บ — นอกขอบเขตเอกสารรอบนี้คือการเลือก framework

---

## 19. Recommended Dashboard Architecture

```
Firestore
  → CLI sync (มีแล้ว)
    → PostgreSQL คลังเดียว (มีแล้ว)
      → View รายงาน (บางส่วนมี / ส่วนใหญ่เสนอใหม่)
        → API + login + บังคับ scope (เสนอใหม่)
          → Dashboard 3 role ข้อมูลชุดเดียว ต่างตัวกรอง
```

| คำถาม | คำตอบ |
|---|---|
| ใช้ DB เดิมได้หรือไม่ | ได้ |
| ต้องสร้าง view เพิ่มไหม | ใช่ สำหรับ daily / mix — หลังเริ่มทำหน้าจอ |
| Materialized view | ยังไม่จำเป็น |
| Reporting tables | ยังไม่ทำ |
| API | ต้องมีก่อนมี UI ที่กันสิทธิ์ได้ |
| RBAC / data scope | ต้องทำใหม่ทั้งก้อนที่ backend |
| Real-time หรือ aggregated | งานค้าง = query view หลัง sync / วิเคราะห์ = aggregate ตามวันจ่าย |
| Cache | cache การ์ด historical รายวันได้ / งานค้างอย่า cache นาน |
| คำนวณล่วงหน้า | daily purchase/sales เมื่อปริมาณโต |

ความสด 3 ระดับ:

| ระดับ | ในระบบนี้ | ใช้กับ |
|---|---|---|
| Real-time จากแอป | **ไม่มี** | — |
| Near real-time | หลัง `npm run sync` หรือปุ่มเว็บ `POST /api/sync` (incremental) | งานค้าง, snapshot สต็อก, ชื่อพนักงาน |
| Historical | ตั๋วจ่ายแล้ว | ยอดซื้อ ขาย กำไรจากการขาย แนวโน้ม |

---

## 20. Implementation Priority

1. **Views ซื้อ-สต็อก-ขาย** — daily + mix รายการ (`branch_code` / `item_group`)
2. **Executive แกนซื้อ** — Overview → ซื้อ → สต็อก → ขาย → กำไรจากการขาย ติดป้ายความสดจาก `sync_runs`
3. **Manager กรองรายการตาม `branch_code`** — ป้ายตั๋วคละรหัส
4. **Alert จาก `v_open_*`** — เน้นขายค้างที่ค้างนาน (ข้อมูลจริงชี้ว่าเป็นปัญหาใหญ่กว่าซื้อค้าง)
5. **Login แล้วค่อย Staff** — my work จาก UID

นอกคิวรอบแรก: กำไรสุทธิทั้งธุรกิจ, master สาขา, `branch_id` บนตั๋ว, multi-company, CLV, aging สต็อก, real-time จาก Firestore
