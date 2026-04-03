"use client";

import { useEffect, useState } from "react";
import { isLoggedIn } from "@/lib/auth";
import { getActiveNotices } from "@/lib/api";

interface Notice {
  id: string;
  title: string;
  content: string;
  is_pinned: boolean;
}

export default function NoticeBanner() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) return;
    const savedDismissed = sessionStorage.getItem("dismissed_notices");
    if (savedDismissed) {
      try { setDismissed(new Set(JSON.parse(savedDismissed))); } catch {}
    }
    loadNotices();
  }, []);

  const loadNotices = async () => {
    try {
      const data = await getActiveNotices();
      setNotices(data);
    } catch {}
  };

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    sessionStorage.setItem("dismissed_notices", JSON.stringify([...next]));
  };

  const visible = notices.filter((n) => !dismissed.has(n.id));
  if (visible.length === 0) return null;

  return (
    <div style={{ backgroundColor: "#EFF6FF", borderBottom: "1px solid #BFDBFE" }}>
      {visible.map((n) => (
        <div
          key={n.id}
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: "10px 20px",
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            fontSize: 14,
          }}
        >
          <span style={{ color: "#2563EB", flexShrink: 0, marginTop: 1 }}>
            {n.is_pinned ? "📌" : "📢"}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{ fontWeight: 600, color: "#1e40af", cursor: "pointer" }}
              onClick={() => setExpanded(expanded === n.id ? null : n.id)}
            >
              {n.title}
            </span>
            {expanded === n.id && (
              <div style={{ marginTop: 6, color: "#374151", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                {n.content}
              </div>
            )}
          </div>
          <button
            onClick={() => dismiss(n.id)}
            style={{
              background: "none", border: "none", color: "#6B7280", cursor: "pointer",
              fontSize: 16, padding: 0, lineHeight: 1, flexShrink: 0,
            }}
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
