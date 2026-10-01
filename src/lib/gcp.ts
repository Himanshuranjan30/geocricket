import "server-only";
import { getVercelOidcToken } from "@vercel/oidc";
import { ExternalAccountClient, OAuth2Client } from "google-auth-library";

/**
 * Google Cloud auth for server code. On Vercel: keyless (Vercel OIDC → Workload Identity Federation → service account).
 * Locally: GOOGLE_OAUTH_TOKEN if set (gcloud auth print-access-token), otherwise Application Default Credentials.
 */
export function gcpAuthClient() {
  const pool = process.env.GCP_WIF_PROVIDER;
  if (pool) {
    const c = ExternalAccountClient.fromJSON({
      type: "external_account", audience: `//iam.googleapis.com/${pool}`, subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
      token_url: "https://sts.googleapis.com/v1/token",
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${process.env.GCP_SERVICE_ACCOUNT}:generateAccessToken`,
      subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
    })!;
    c.scopes = ["https://www.googleapis.com/auth/cloud-platform"];
    return c;
  }
  if (process.env.GOOGLE_OAUTH_TOKEN) { const c = new OAuth2Client(); c.setCredentials({ access_token: process.env.GOOGLE_OAUTH_TOKEN }); return c; }
  return undefined;
}
