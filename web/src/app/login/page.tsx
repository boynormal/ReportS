import Link from "next/link";

const ERRORS: Record<string, string> = {
  state: "การยืนยันจาก LINE ไม่ครบ ลองเข้าใหม่อีกครั้ง",
  config: "ยังไม่ได้ตั้งค่า LINE Login บนเซิร์ฟเวอร์",
  disabled: "บัญชีนี้ถูกปิดสิทธิ์ ติดต่อแอดมิน",
  line: "เข้าสู่ระบบด้วย LINE ไม่สำเร็จ ลองอีกครั้ง",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? ERRORS[error] ?? "เข้าสู่ระบบไม่สำเร็จ" : null;
  const configured = Boolean(process.env.LINE_CHANNEL_ID?.trim() && process.env.LINE_CHANNEL_SECRET?.trim());

  return (
    <div className="app login-page">
      <div className="card login-card">
        <h1>Dashboard Scrapee</h1>
        <p className="muted">เข้าด้วยบัญชี LINE ที่แอดมินอนุมัติแล้ว</p>
        {message ? <p className="error">{message}</p> : null}
        {configured ? (
          <Link className="pill line-login-btn" href="/api/auth/line">
            เข้าสู่ระบบด้วย LINE
          </Link>
        ) : (
          <p className="error">ยังไม่ได้ตั้งค่า LINE_CHANNEL_ID และ LINE_CHANNEL_SECRET</p>
        )}
      </div>
    </div>
  );
}
