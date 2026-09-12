import Link from "next/link";
import { getInTicket, netWarehouseWeight, wasteWeight } from "@/lib/queries";
import { formatMoney, formatNumber, formatWhen } from "@/lib/format";

export default async function InTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ticket = await getInTicket(id);
  if (!ticket) return <p className="app">ไม่พบตั๋วซื้อ</p>;
  const h = ticket.header as Record<string, unknown>;
  return (
    <div className="app">
      <p>
        <Link href="/">กลับแดชบอร์ด</Link>
      </p>
      <h1>ตั๋วซื้อ {String(h.number ?? id)}</h1>
      <p className="sub">
        สถานะ {String(h.status ?? "—")} · ผู้บันทึก {String(h.recorded_by_name ?? h.recorded_by ?? "—")} ·
        ผู้ขาย {String(h.seller_fullname ?? "—")}
      </p>
      <div className="grid grid-4">
        <div className="card">
          <div className="label">ยอดสุทธิ</div>
          <div className="value">{formatMoney(Number(h.net ?? 0))} บาท</div>
        </div>
        <div className="card">
          <div className="label">น้ำหนักสุทธิทั้งใบ</div>
          <div className="value">{formatNumber(Number(h.pure_weight ?? 0))}</div>
          <div className="hint">หัวตั๋ว · สุทธิ = รวม − หัก − เจือปน</div>
        </div>
        <div className="card">
          <div className="label">จ่ายเมื่อ</div>
          <div className="value" style={{ fontSize: 16 }}>
            {formatWhen(h.paid_timestamp as string)}
          </div>
        </div>
      </div>
      <h2>รายการ</h2>
      <p className="muted">สุทธิ = รวม − หัก − เจือปน · ยอดคิดจากสุทธิ × ราคาจ่าย · รหัสสาขาอยู่ที่รายการ</p>
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
          {ticket.items.map((item) => {
            const row = item as Record<string, unknown>;
            return (
              <tr key={String(row.client_id)}>
                <td>{String(row.code ?? "—")}</td>
                <td>{String(row.name ?? "—")}</td>
                <td>{String(row.branch_code ?? "—")}</td>
                <td>{String(row.item_group ?? "—")}</td>
                <td className="right">{formatNumber(Number(row.weight ?? 0))}</td>
                <td className="right">{formatNumber(Number(row.deduct ?? 0))}</td>
                <td className="right">{formatNumber(wasteWeight(row.wastes))}</td>
                <td className="right">{formatNumber(netWarehouseWeight(row.weight, row.deduct, row.wastes))}</td>
                <td className="right">{formatMoney(Number(row.paid_price ?? 0))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
