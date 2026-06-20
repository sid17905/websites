#!/bin/bash
# ============================================================
#  IFSA Phase 4 — VAPID Key Setup
#  Run this ONCE to generate your push notification keys.
#  Keys are saved directly into .env
# ============================================================

set -e

echo ""
echo "🔔 IFSA Phase 4 — VAPID Key Generator"
echo "────────────────────────────────────────"

# Make sure web-push is installed
if ! node -e "require('web-push')" 2>/dev/null; then
    echo "📦 Installing web-push..."
    npm install web-push
fi

# Generate keys
echo ""
echo "Generating VAPID keys..."
KEYS=$(node -e "
const wp = require('web-push');
const keys = wp.generateVAPIDKeys();
console.log('PUBLIC=' + keys.publicKey);
console.log('PRIVATE=' + keys.privateKey);
")

PUBLIC_KEY=$(echo "$KEYS" | grep PUBLIC | cut -d= -f2-)
PRIVATE_KEY=$(echo "$KEYS" | grep PRIVATE | cut -d= -f2-)

echo ""
echo "✅ Keys generated!"
echo ""
echo "Public key:  $PUBLIC_KEY"
echo "Private key: (hidden)"
echo ""

# Ask for VAPID subject
read -p "Enter your admin email for VAPID_SUBJECT [admin@ifsa.in]: " VAPID_EMAIL
VAPID_EMAIL=${VAPID_EMAIL:-admin@ifsa.in}

# Write to .env (append or create)
ENV_FILE=".env"

# Remove any existing VAPID lines
if [ -f "$ENV_FILE" ]; then
    grep -v "^VAPID_" "$ENV_FILE" > "$ENV_FILE.tmp" && mv "$ENV_FILE.tmp" "$ENV_FILE"
fi

cat >> "$ENV_FILE" << EOF

# ── Phase 4: Push Notifications (VAPID) ──────────────────────
VAPID_PUBLIC_KEY=$PUBLIC_KEY
VAPID_PRIVATE_KEY=$PRIVATE_KEY
VAPID_SUBJECT=mailto:$VAPID_EMAIL
EOF

echo "✅ Keys saved to $ENV_FILE"
echo ""
echo "Next steps:"
echo "  1. Restart your server:  npm start   (or: node backend/server.js)"
echo "  2. Visit the site twice — the push prompt appears on the 2nd visit"
echo "  3. In admin, click 🔔 Notifications to send your first notification"
echo ""
