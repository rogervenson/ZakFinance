import type { MetadataRoute } from "next";

/** Permite adicionar o app à tela inicial do celular. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ZakFinance",
    short_name: "ZakFinance",
    description: "Controle financeiro pessoal",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1f2128",
    lang: "pt-BR",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
