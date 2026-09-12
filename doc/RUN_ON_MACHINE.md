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

ตั้ง Task Scheduler เองครั้งเดียว — สคริปต์นี้ไม่ลงทะเบียนให้:

1. Create Task → **Run only when user is logged on** (ต้องมีจอให้ Chrome)
2. Trigger: ทุก 45 นาที ตอนเปิดร้าน
3. Action: Start a program = `scripts\sync-auto.cmd` (path เต็ม)
4. Start in = โฟลเดอร์รากโปรเจกต์ เช่น `D:\project\Scrapee`

ตัวอย่าง (แก้ path ให้ตรงเครื่อง; `SCRAPEE_SYNC_NOPAUSE=1` กันไม่ให้ค้างรอ Enter):

```bat
schtasks /Create /TN "ScrapeeSyncAuto" /TR "cmd /c set SCRAPEE_SYNC_NOPAUSE=1&& D:\project\Scrapee\scripts\sync-auto.cmd" /SC MINUTE /MO 45 /IT
```

`/IT` = รันในเซสชันที่ล็อกอินอยู่

ตั้งเครื่องไม่ sleep ตอนเปิดร้าน Session Chrome ถูกเก็บใน `.auth/scrapee.json` ตั้ง `AUTH_KEEP_SESSION=0` ใน `.env` ถ้าต้องการ login ใหม่ทุกครั้ง

## แบ็กอัป

```bat
pg_dump -Fc "%DATABASE_URL%" -f scrapee-backup.dump
```

หรือ dump จากฐานที่ระบุใน `.env` ตามที่ติดตั้ง Postgres บนเครื่อง

## ไม่ทำในโหมดนี้

- Docker / เปลี่ยน `DATABASE_URL` เป็นชื่อ service
- Headless Chrome สำหรับ App Check
