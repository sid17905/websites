// ============================================================
//  IFSA — Change Admin Password Utility
//  Usage: node change-password.js
// ============================================================

const bcrypt = require('bcrypt');
const readline = require('readline');
const crypto = require('crypto');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log('\n🔐 IFSA Admin Password Setup\n');

// Also generate a JWT secret suggestion
const suggestedSecret = crypto.randomBytes(64).toString('hex');
console.log('📌 Suggested JWT_SECRET (copy this into server.js or .env):');
console.log(`   ${suggestedSecret}\n`);

rl.question('Enter your new admin password: ', async (password) => {
    if (password.length < 8) {
        console.log('\n❌ Password must be at least 8 characters.');
        rl.close();
        return;
    }

    console.log('\n⏳ Hashing password (this takes a moment)...');
    const hash = await bcrypt.hash(password, 12);

    console.log('\n✅ Done! Copy this hash into server.js:\n');
    console.log(`const ADMIN_PASSWORD_HASH = '${hash}';\n`);
    console.log('Then restart your server with: node server.js\n');

    rl.close();
});
