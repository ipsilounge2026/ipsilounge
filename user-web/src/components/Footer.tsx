import Link from "next/link";

export default function Footer() {
  return (
    <footer className="footer">
      <div style={{ display: "flex", justifyContent: "center", gap: 24, marginBottom: 8 }}>
        <Link href="/terms" style={{ color: "#9ca3af", fontSize: 13, textDecoration: "none" }}>
          이용약관
        </Link>
        <Link href="/privacy" style={{ color: "#9ca3af", fontSize: 13, textDecoration: "none" }}>
          개인정보처리방침
        </Link>
      </div>
      <p>&copy; 2026 입시라운지. All rights reserved.</p>
    </footer>
  );
}
