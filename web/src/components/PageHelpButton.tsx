"use client";

import { useEffect, useId, useRef, useState } from "react";
import { getPageHelp, type PageHelpTab } from "@/lib/page-help";

export function PageHelpButton({ tab, title }: { tab: PageHelpTab; title: string }) {
  const help = getPageHelp(tab);
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!help) return null;

  return (
    <>
      <button
        type="button"
        className="pill page-help-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        ? คำอธิบายหน้านี้
      </button>
      {open ? (
        <div className="page-help-overlay" role="presentation" onClick={() => setOpen(false)}>
          <div
            className="page-help-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="page-help-head">
              <h3 id={titleId}>{title}</h3>
              <button ref={closeRef} type="button" className="pill" onClick={() => setOpen(false)}>
                ปิด
              </button>
            </div>
            <dl className="page-help-summary">
              <div>
                <dt>หน้านี้คือ</dt>
                <dd>{help.what}</dd>
              </div>
              <div>
                <dt>ไม่ใช่</dt>
                <dd>{help.not}</dd>
              </div>
              <div>
                <dt>ช่วงเวลา</dt>
                <dd>{help.period}</dd>
              </div>
            </dl>
            <h4>ตัวเลขบนหน้านี้</h4>
            <ul className="page-help-metrics">
              {help.metrics.map((metric) => (
                <li key={metric.name}>
                  <strong>{metric.name}</strong>
                  <p>
                    <span className="muted">สูตร</span> {metric.formula}
                  </p>
                  <p>
                    <span className="muted">ใช้ทำอะไร</span> {metric.useFor}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
