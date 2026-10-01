#!/usr/bin/env bash
# One-time: lets the Vercel project call Claude on Vertex AI with no stored keys
# (Vercel OIDC token -> GCP Workload Identity Federation -> service account with Vertex AI User).
set -euo pipefail
ACCOUNT=himanshuranjan30@gmail.com
PROJECT=pitchmap-510208
TEAM=himanshu-fe4f
g() { gcloud --account="$ACCOUNT" --project="$PROJECT" "$@"; }

NUM=$(g projects describe "$PROJECT" --format='value(projectNumber)')
g services enable aiplatform.googleapis.com iamcredentials.googleapis.com sts.googleapis.com
g iam service-accounts describe "pitchmap-ai@$PROJECT.iam.gserviceaccount.com" >/dev/null 2>&1 ||
  g iam service-accounts create pitchmap-ai --display-name="Pitchmap question drafting"
g projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:pitchmap-ai@$PROJECT.iam.gserviceaccount.com" --role=roles/aiplatform.user --condition=None >/dev/null
g iam workload-identity-pools describe vercel --location=global >/dev/null 2>&1 ||
  g iam workload-identity-pools create vercel --location=global --display-name="Vercel"
g iam workload-identity-pools providers describe vercel --location=global --workload-identity-pool=vercel >/dev/null 2>&1 ||
  g iam workload-identity-pools providers create-oidc vercel --location=global --workload-identity-pool=vercel \
    --issuer-uri="https://oidc.vercel.com/$TEAM" --allowed-audiences="https://vercel.com/$TEAM" \
    --attribute-mapping="google.subject=assertion.sub,attribute.project=assertion.project_name" \
    --attribute-condition="assertion.owner == '$TEAM' && assertion.project_name == 'pitchmap'"
g iam service-accounts add-iam-policy-binding "pitchmap-ai@$PROJECT.iam.gserviceaccount.com" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$NUM/locations/global/workloadIdentityPools/vercel/attribute.project/pitchmap" >/dev/null
echo "GCP_WIF_PROVIDER=projects/$NUM/locations/global/workloadIdentityPools/vercel/providers/vercel"
echo "GCP_SERVICE_ACCOUNT=pitchmap-ai@$PROJECT.iam.gserviceaccount.com"
