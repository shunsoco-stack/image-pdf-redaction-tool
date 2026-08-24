import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "画像・PDF個人情報マスキングツール",
  description:
    "画像・PDFの機密情報候補をブラウザ内で検出し、人の確認を経て黒塗り・ぼかし・画像化出力する業務効率化ツール。",
  applicationName: "画像・PDF個人情報マスキングツール",
  icons: { icon: "/icons/image-pdf-redaction-tool.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f4f6f8",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
