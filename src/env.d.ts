/// <reference types="vite/client" />

declare const __CESIUM_BASE_URL__: string;

interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_KEY?: string;
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
  readonly VITE_CLERK_PROXY_URL?: string;
  readonly VITE_CF_ANALYTICS_TOKEN?: string;
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  CESIUM_BASE_URL?: string;
}

declare module "virtual:soupmap-journal" {
  const index: readonly { slug: string; title: string; dek: string; category: string; mark: string }[];
  export default index;
}
