import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "画像・PDF個人情報マスキングツール",
    short_name: "個人情報マスキング",
    description: "人の確認を中心にした、ローカル完結の文書マスキングツール",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f6f8",
    theme_color: "#0b7669",
    icons: [
      {
        src: "/icons/image-pdf-redaction-tool.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
