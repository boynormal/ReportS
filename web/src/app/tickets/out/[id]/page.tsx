import Link from "next/link";
import { getOutTicket, netWarehouseWeight, wasteWeight } from "@/lib/queries";
import { formatDecimal, formatMoney, formatNumber, formatWhen } from "@/lib/format";

export default async function OutTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ticket = await getOutTicket(id);
  if (!ticket) return <p className="app">ไม่พบตั๋วขาย</p>;
  const h = ticket.header as Record<string, unknown>;
  return (
    <div className="app">
      <p>
        <Link href="/">กลับแดชบอร์ด</Link>
      </p>
      <h1>ตั๋วขาย {String(h.number ?? id)}</h1>
      <p className="sub">
        สถานะ {String(h.status ?? "—")} · ผู้บันทึก {String(h.recorded_by_name ?? h.recorded_by ?? "—")} ·
        ผู้ซื้อ {String(h.buyer_fullname ?? "—")}
      </p>
      <div className="grid grid-4">
        <div className="card">
          <div className="label">ยอดสุทธิ</div>
          <div className="value">{formatMoney(Number(h.net ?? 0))} บาท</div>
        </div>
        <div className="card">
          <div className="label">กำไรจากการขาย</div>
          <div className="value">{formatMoney(Number(h.profit ?? 0))} บาท</div>
          <div className="hint">ค่าจาก Scrapee ไม่ใช่กำไรสุทธิ</div>
        </div>
        <div className="card">
          <div className="label">น้ำหนักคลัง</div>
          <div className="value">{formatNumber(Number(h.pure_weight ?? 0))}</div>
        </div>
        <div className="card">
          <div className="label">รับเงินเมื่อ</div>
          <div className="value" style={{ fontSize: 16 }}>
            {formatWhen(h.paid_at as string)}
          </div>
        </div>
      </div>
      <h2>รายการ</h2>
      <p className="muted">สุทธิ = รวม − หัก − เจือปน · รหัสสาขาอยู่ที่รายการ — ใบนี้ไม่ถูกสรุปว่าเป็นของสาขาใดสาขาหนึ่ง</p>
      <table>
        <thead>
          <tr>
            <th>รหัส</th>
            <th>ชื่อ</th>
            <th>สาขาสินค้า</th>
            <th>หมวด</th>
            <th className="right">รวม</th>
            <th className="right">หัก</th>
            <th className="right">เจือปน</th>
            <th className="right">สุทธิ</th>
            <th className="right">ราคาจ่าย</th>
          </tr>
        </thead>
        <tbody>
          {ticket.items.map((item, idx) => {
            const row = item as Record<string, unknown>;
            return (
              <tr key={String(row.client_id ?? idx)}>
                <td>{String(row.code ?? "—")}</td>
                <td>{String(row.name ?? "—")}</td>
                <td>{String(row.branch_code ?? "—")}</td>
                <td>{String(row.item_group ?? "—")}</td>
                <td className="right">{formatNumber(Number(row.weight ?? 0))}</td>
                <td className="right">{formatNumber(Number(row.deduct ?? 0))}</td>
                <td className="right">{formatNumber(wasteWeight(row.wastes))}</td>
                <td className="right">{formatNumber(netWarehouseWeight(row.weight, row.deduct, row.wastes))}</td>
                <td className="right">{formatDecimal(Number(row.paid_price ?? 0), 2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
