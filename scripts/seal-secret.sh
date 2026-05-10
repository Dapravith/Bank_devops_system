#!/bin/bash

# Utility script to seal Kubernetes secrets for GitOps
# Requirement: kubeseal CLI installed (brew install kubeseal)

SECRET_FILE=$1
OUTPUT_FILE=${2:-"k8s/02-sealed-secret.yaml"}

if [ -z "$SECRET_FILE" ]; then
    echo "Usage: ./scripts/seal-secret.sh <input-secret-yaml> [output-sealed-yaml]"
    exit 1
fi

if ! command -v kubeseal &> /dev/null; then
    echo "Error: kubeseal CLI not found. Install it with: brew install kubeseal"
    exit 1
fi

echo "🔐 Sealing $SECRET_FILE -> $OUTPUT_FILE..."

# This command assumes you have access to the cluster via kubectl
# It fetches the public key from the cluster and encrypts the secret
kubeseal --format=yaml < "$SECRET_FILE" > "$OUTPUT_FILE"

echo "✅ Done! You can now safely commit $OUTPUT_FILE to Git."
