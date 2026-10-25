import { CLOUDFLARE } from "../clouds/cloudflare.ts";
import { resourceCredentialName, resourceName } from "../naming.ts";
import { defineProvisioner } from "./provisioner.ts";

const BUCKET_NAME_MAX = 63;

/** A bucket on Cloudflare: one R2 bucket per environment, with its own bucket-scoped S3 credentials. */
export const bucketOnCloudflare = defineProvisioner({
  cloud: CLOUDFLARE,
  envs: ["NAME", "ENDPOINT", "ACCESS_KEY_ID", "SECRET_ACCESS_KEY"],

  validate(config, entity) {
    for (const env of config.environments) {
      const bucket = resourceName(config.name, entity.name, env);
      if (bucket.length > BUCKET_NAME_MAX) {
        throw new Error(`Bucket name "${bucket}" is longer than ${BUCKET_NAME_MAX} characters. Use a shorter name.`);
      }
    }
  },

  describe(config, entity, env) {
    const bucket = resourceName(config.name, entity.name, env);
    return {
      title: `Provisioning R2 bucket ${bucket}`,
      done: `Provisioned R2 bucket ${bucket} and stored its envs in ${env}.env`,
    };
  },

  async provision({ config, entity, env, client }) {
    const bucket = resourceName(config.name, entity.name, env);
    await client.ensureR2Bucket(bucket);
    const credentials = await client.replaceR2Credentials(bucket, resourceCredentialName(entity.type, bucket));
    return {
      NAME: bucket,
      ENDPOINT: client.endpoint,
      ACCESS_KEY_ID: credentials.accessKeyId,
      SECRET_ACCESS_KEY: credentials.secretAccessKey,
    };
  },
});
