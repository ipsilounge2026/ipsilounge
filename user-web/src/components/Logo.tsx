/* 입시라운지 공식 로고 (assets/favicon.png → public/logo.png).
   헤더·푸터·워터마크 어디서나 동일 로고를 쓰도록 단일 컴포넌트로 관리. */
export default function Logo({ size = 24 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="입시라운지"
      width={size}
      height={size}
      style={{ display: "block", objectFit: "contain" }}
    />
  );
}
