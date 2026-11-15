// Auto-generated using gen-presets script

import type { NitroPreset, NitroPresetMeta } from "nitropack/types";

type PresetMeta = Omit<NitroPresetMeta, "url">;

export interface PresetEntry {
  meta: PresetMeta;
  load: () => Promise<NitroPreset>;
}

const presetEntries: PresetEntry[] = [
  { meta: {"name":"base-worker"}, load: () => import("./_nitro/preset").then((m) => m.default[0]) },
  { meta: {"name":"nitro-dev","dev":true}, load: () => import("./_nitro/preset").then((m) => m.default[1]) },
  { meta: {"name":"nitro-prerender"}, load: () => import("./_nitro/preset").then((m) => m.default[2]) },
  { meta: {"name":"service-worker"}, load: () => import("./_nitro/preset").then((m) => m.default[3]) },
  { meta: {"name":"static","static":true}, load: () => import("./_static/preset").then((m) => m.default[0]) },
  { meta: {"name":"github-pages","static":true}, load: () => import("./_static/preset").then((m) => m.default[1]) },
  { meta: {"name":"gitlab-pages","static":true}, load: () => import("./_static/preset").then((m) => m.default[2]) },
  { meta: {"name":"alwaysdata"}, load: () => import("./alwaysdata/preset").then((m) => m.default[0]) },
  { meta: {"name":"aws-amplify","stdName":"aws_amplify"}, load: () => import("./aws-amplify/preset").then((m) => m.default[0]) },
  { meta: {"name":"aws-lambda"}, load: () => import("./aws-lambda/preset").then((m) => m.default[0]) },
  { meta: {"name":"azure-swa","stdName":"azure_static","aliases":["azure"]}, load: () => import("./azure/preset").then((m) => m.default[0]) },
  { meta: {"name":"azure-functions"}, load: () => import("./azure/preset").then((m) => m.default[1]) },
  { meta: {"name":"bun"}, load: () => import("./bun/preset").then((m) => m.default[0]) },
  { meta: {"name":"cleavr","stdName":"cleavr"}, load: () => import("./cleavr/preset").then((m) => m.default[0]) },
  { meta: {"name":"cloudflare-worker","aliases":["cloudflare"]}, load: () => import("./cloudflare/preset").then((m) => m.default[0]) },
  { meta: {"name":"cloudflare-module-legacy","aliases":["cloudflare-module"]}, load: () => import("./cloudflare/preset").then((m) => m.default[1]) },
  { meta: {"name":"cloudflare-pages","stdName":"cloudflare_pages"}, load: () => import("./cloudflare/preset").then((m) => m.default[2]) },
  { meta: {"name":"cloudflare-pages-static","stdName":"cloudflare_pages","static":true}, load: () => import("./cloudflare/preset").then((m) => m.default[3]) },
  { meta: {"name":"cloudflare-module","stdName":"cloudflare_workers","compatibilityDate":"2024-09-19"}, load: () => import("./cloudflare/preset").then((m) => m.default[4]) },
  { meta: {"name":"cloudflare-durable","compatibilityDate":"2024-09-19"}, load: () => import("./cloudflare/preset").then((m) => m.default[5]) },
  { meta: {"name":"cloudflare-dev","aliases":["cloudflare-module","cloudflare-durable","cloudflare-pages"],"dev":true,"compatibilityDate":"2025-07-15"}, load: () => import("./cloudflare/preset").then((m) => m.default[6]) },
  { meta: {"name":"deno-server-legacy","aliases":["deno-server"]}, load: () => import("./deno/preset").then((m) => m.default[0]) },
  { meta: {"name":"deno-deploy","aliases":["deno"]}, load: () => import("./deno/preset").then((m) => m.default[1]) },
  { meta: {"name":"deno-server","compatibilityDate":"2025-01-30"}, load: () => import("./deno/preset").then((m) => m.default[2]) },
  { meta: {"name":"digital-ocean"}, load: () => import("./digitalocean/preset").then((m) => m.default[0]) },
  { meta: {"name":"edgio","aliases":["layer0"]}, load: () => import("./edgio/preset").then((m) => m.default[0]) },
  { meta: {"name":"firebase"}, load: () => import("./firebase/preset").then((m) => m.default[0]) },
  { meta: {"name":"firebase-app-hosting","stdName":"firebase_app_hosting"}, load: () => import("./firebase/preset").then((m) => m.default[1]) },
  { meta: {"name":"flight-control"}, load: () => import("./flightcontrol/preset").then((m) => m.default[0]) },
  { meta: {"name":"genezio"}, load: () => import("./genezio/preset").then((m) => m.default[0]) },
  { meta: {"name":"heroku"}, load: () => import("./heroku/preset").then((m) => m.default[0]) },
  { meta: {"name":"iis-handler","aliases":["iis"]}, load: () => import("./iis/preset").then((m) => m.default[0]) },
  { meta: {"name":"iis-node"}, load: () => import("./iis/preset").then((m) => m.default[1]) },
  { meta: {"name":"koyeb"}, load: () => import("./koyeb/preset").then((m) => m.default[0]) },
  { meta: {"name":"netlify-legacy","aliases":["netlify"]}, load: () => import("./netlify/preset").then((m) => m.default[0]) },
  { meta: {"name":"netlify-builder"}, load: () => import("./netlify/preset").then((m) => m.default[1]) },
  { meta: {"name":"netlify-edge"}, load: () => import("./netlify/preset").then((m) => m.default[2]) },
  { meta: {"name":"netlify-static","static":true}, load: () => import("./netlify/preset").then((m) => m.default[3]) },
  { meta: {"name":"netlify","stdName":"netlify","compatibilityDate":"2024-05-07"}, load: () => import("./netlify/preset").then((m) => m.default[4]) },
  { meta: {"name":"netlify-edge","compatibilityDate":"2024-05-07"}, load: () => import("./netlify/preset").then((m) => m.default[5]) },
  { meta: {"name":"netlify-static","stdName":"netlify","static":true,"compatibilityDate":"2024-05-07"}, load: () => import("./netlify/preset").then((m) => m.default[6]) },
  { meta: {"name":"node-listener","aliases":["node"]}, load: () => import("./node/preset").then((m) => m.default[0]) },
  { meta: {"name":"node-server"}, load: () => import("./node/preset").then((m) => m.default[1]) },
  { meta: {"name":"node-cluster"}, load: () => import("./node/preset").then((m) => m.default[2]) },
  { meta: {"name":"cli"}, load: () => import("./node/preset").then((m) => m.default[3]) },
  { meta: {"name":"platform-sh"}, load: () => import("./platform.sh/preset").then((m) => m.default[0]) },
  { meta: {"name":"render-com"}, load: () => import("./render.com/preset").then((m) => m.default[0]) },
  { meta: {"name":"stormkit","stdName":"stormkit"}, load: () => import("./stormkit/preset").then((m) => m.default[0]) },
  { meta: {"name":"vercel","stdName":"vercel"}, load: () => import("./vercel/preset").then((m) => m.default[0]) },
  { meta: {"name":"vercel-edge"}, load: () => import("./vercel/preset").then((m) => m.default[1]) },
  { meta: {"name":"vercel-static","stdName":"vercel","static":true}, load: () => import("./vercel/preset").then((m) => m.default[2]) },
  { meta: {"name":"winterjs"}, load: () => import("./winterjs/preset").then((m) => m.default[0]) },
  { meta: {"name":"zeabur","stdName":"zeabur"}, load: () => import("./zeabur/preset").then((m) => m.default[0]) },
  { meta: {"name":"zeabur-static","static":true}, load: () => import("./zeabur/preset").then((m) => m.default[1]) },
  { meta: {"name":"zerops"}, load: () => import("./zerops/preset").then((m) => m.default[0]) },
  { meta: {"name":"zerops-static","static":true}, load: () => import("./zerops/preset").then((m) => m.default[1]) },
];

export default presetEntries;
