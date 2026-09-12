# รันบนเครื่อง Windows (ไม่ใช้ Docker)

แดชบอร์ดอ่าน Postgres บนเครื่องนี้ Sync ดึงจาก Scrapee ผ่าน Chrome เพราะ Firebase App Check

## สิ่งที่ต้องมี

- Node.js, Chrome, Postgres เป็นบริการ Windows ที่สตาร์ทเอง
- `.env` ที่รากโปรเจกต์ (`DATABASE_URL` เป็น `localhost`)
- `npm install` ที่ราก และที่ `web`
- ห้าม commit `.env` และ `.auth/`

## เปิดใช้ประจำวัน

1. ยืนยัน Postgres ทำงาน
2. ดับเบิลคลิก [`scripts/start-web.cmd`](../scripts/start-web.cmd) หรือที่รากโปรเจกต์รัน `npm run dev:web`
3. เปิด http://localhost:3100/
4. ถ้าปุ่มอัปเดทขึ้น 401 / App Check: ที่รากรัน `npm run auth` เข้าบัญชีใน Chrome ที่เปิดขึ้น แล้วกดอัปเดทบนเว็บได้เลย **ไม่ต้องรีสตาร์ทเว็บ**

เช้าวันแรกหรือหลังเครื่องหลับนาน ให้ `npm run auth` ครั้ง

## อัปเดทอัตโนมัติ

[`scripts/sync-auto.cmd`](../scripts/sync-auto.cmd) = `npm run sync:auto` (เปิด Chrome จับ token แล้ว incremental sync)

ลงทะเบียน Task Scheduler จากโฟลเดอร์ [`scripts/scheduler/`](../scripts/scheduler/) ครั้งเดียว (หา path เครื่องนี้เอง ไม่ต้องพิมพ์ `schtasks`):

1. ดับเบิลคลิก [`scripts/scheduler/install.cmd`](../scripts/scheduler/install.cmd) — งาน `ScrapeeSyncAuto` จันทร์–เสาร์ 06:00–18:00 ทุก 1 ชม. ยกเว้นวันอาทิตย์ รันเมื่อล็อกอินอยู่
2. [`status.cmd`](../scripts/scheduler/status.cmd) — ดูรอบถัดไปและผลรันล่าสุด (`Last Result` เป็น 0 = สำเร็จ)
3. [`run-now.cmd`](../scripts/scheduler/run-now.cmd) — ทดสอบทันที
4. [`uninstall.cmd`](../scripts/scheduler/uninstall.cmd) — ลบงาน

`install.cmd` ใช้ `/F` ทับงานชื่อเดียวกันได้ ถ้าเคยสร้างมือไว้แล้ว

ตั้งเครื่องไม่ sleep ตอนเปิดร้าน Session Chrome ถูกเก็บใน `.auth/scrapee.json` ตั้ง `AUTH_KEEP_SESSION=0` ใน `.env` ถ้าต้องการ login ใหม่ทุกครั้ง

## แบ็กอัป

```bat
pg_dump -Fc "%DATABASE_URL%" -f scrapee-backup.dump
```

หรือ dump จากฐานที่ระบุใน `.env` ตามที่ติดตั้ง Postgres บนเครื่อง

## ไม่ทำในโหมดนี้

- Docker / เปลี่ยน `DATABASE_URL` เป็นชื่อ service
- Headless Chrome สำหรับ App Check
