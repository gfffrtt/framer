import { defineProvisioner, resourceName } from "./provisioner.ts";

const BUCKET_NAME_MAX = 63;

/** A bucket on Cloudflare: one R2 bucket per environment, with its own bucket-scoped S3 credentials. */
export const bucketOnCloudflare = defineProvisioner({
  cloud: "cloudflare",
  envs: ["NAME", "ENDPOINT", "ACCESS_KEY_ID", "SECRET_ACCESS_KEY"],

  validate(config, name) {
    for (const env of config.environments) {
      const bucket = resourceName(config.name, name, env);
      if (bucket.length > BUCKET_NAME_MAX) {
        throw new Error(`Bucket name "${bucket}" is longer than ${BUCKET_NAME_MAX} characters. Use a shorter name.`);
      }
    }
  },

  describe(config, name, env) {
    const bucket = resourceName(config.name, name, env);
    return {
      title: `Provisioning R2 bucket ${bucket}`,
      done: `Provisioned R2 bucket ${bucket} and stored its envs in ${env}.env`,
    };
  },

  async provision({ config, name, env, client }) {
    const bucket = resourceName(config.name, name, env);
    await client.ensureR2Bucket(bucket);
    const credentials = await client.createR2Credentials(bucket);
    return {
      NAME: bucket,
      ENDPOINT: client.endpoint,
      ACCESS_KEY_ID: credentials.accessKeyId,
      SECRET_ACCESS_KEY: credentials.secretAccessKey,
    };
  },
});
