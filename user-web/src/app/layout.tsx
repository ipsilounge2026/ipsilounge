import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "입시라운지 - 학생부 분석 & 입시 상담",
  description: "학생부 분석 리포트와 입시 상담을 한 곳에서",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
