import type { EntityType } from "../entities.ts";
import { appOnVercel } from "./app-vercel.ts";
import { bucketOnCloudflare } from "./bucket-cloudflare.ts";
import type { Provisioner } from "./provisioner.ts";

export { resourceName, type Provisioner } from "./provisioner.ts";

/** What `framer add` can provision today: entity type → the clouds it can go to. */
export const PROVISIONERS: Partial<Record<EntityType, Provisioner<any>[]>> = {
  app: [appOnVercel],
  bucket: [bucketOnCloudflare],
};

export function findProvisioner(type: EntityType, cloud: string): Provisioner | undefined {
  return PROVISIONERS[type]?.find((provisioner) => provisioner.cloud === cloud);
}
