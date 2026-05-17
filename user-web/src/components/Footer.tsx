import Link from "next/link";
import Logo from "@/components/Logo";

export default function Footer() {
  return (
    <div className="lp">
      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <Link href="/" className="lp-logo" style={{ fontSize: 17 }}>
            <Logo size={22} />입시라운지
          </Link>
          <div className="lp-footer-links">
            <Link href="/terms">이용약관</Link>
            <Link href="/privacy">개인정보처리방침</Link>
          </div>
          <span className="lp-footer-copy">© 2026 입시라운지. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
