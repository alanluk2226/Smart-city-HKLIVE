/** Shared build identity — baked into the client at build time via next.config. */
export function resolveBuildId(): string {
  return (
    process.env.NEXT_PUBLIC_APP_BUILD_ID ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    "dev"
  );
}
