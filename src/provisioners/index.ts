import type { EntityType } from "../entities.ts";
import { appOnVercel } from "./app-vercel.ts";
import { bucketOnCloudflare } from "./bucket-cloudflare.ts";
import type { Provisioner } from "./provisioner.ts";

export type { Connection, Provisioner } from "./provisioner.ts";

/** What `framer add` can provision today: entity type → the clouds it can go to. */
export const PROVISIONERS: Record<EntityType, Provisioner[]> = {
  app: [appOnVercel],
  db: [],
  bucket: [bucketOnCloudflare],
  job: [],
  task: [],
};
