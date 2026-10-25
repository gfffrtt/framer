import { expect, test } from "bun:test";
import { credentialKey, credentialName, credentialTarget, envPrefix, resourceCredentialName, resourceName } from "./naming.ts";

test("credential keys are exact per environment, purpose and entity", () => {
  const target = credentialTarget("acme", "prod-eu", { type: "bucket", name: "user-files" });
  expect(credentialKey("CLOUDFLARE_API_TOKEN", target)).toBe("CLOUDFLARE_API_TOKEN_PROD_EU_BUCKETS_USER_FILES");
  expect(credentialName(target)).toBe("framer-acme-prod-eu-buckets-user-files");
});

test("resources, their credentials and generated envs", () => {
  const bucket = resourceName("acme", "uploads", "prod");
  expect(bucket).toBe("acme-uploads-prod");
  expect(resourceCredentialName("bucket", bucket)).toBe("framer-buckets-acme-uploads-prod");
  expect(envPrefix("bucket", "user-files")).toBe("BUCKET_USER_FILES_");
});
