// Recover the multisig CONFIG address from the vault address you already know,
// and verify membership + threshold on-chain. Useful when all you were handed
// is "the money is at <vault>": walk recent transactions touching the vault,
// test every account they reference for being a Squads multisig whose index-0
// vault PDA derives to that address.
// Usage: node findconfig.js
const cfg = require("./config");
const { Connection, PublicKey } = require("@solana/web3.js");
const multisig = require("@sqds/multisig");

if (cfg.VAULT_ADDRESS.startsWith("REPLACE_WITH")) {
  console.error("VAULT_ADDRESS is not set — edit config.js (or export VAULT_ADDRESS) before running.");
  process.exit(1);
}
const VAULT = new PublicKey(cfg.VAULT_ADDRESS);
const ME = cfg.MY_ADDRESS ? new PublicKey(cfg.MY_ADDRESS) : null;
const conn = new Connection(cfg.RPC_URL, "confirmed");

(async () => {
  const sigs = await conn.getSignaturesForAddress(VAULT, { limit: 10 });
  console.log("txs touching vault:", sigs.length);
  const candidates = new Set();
  for (const s of sigs) {
    const tx = await conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
    if (!tx) continue;
    for (const k of tx.transaction.message.staticAccountKeys || tx.transaction.message.accountKeys || []) {
      candidates.add(k.toBase58());
    }
  }
  for (const c of candidates) {
    try {
      const pk = new PublicKey(c);
      const ms = await multisig.accounts.Multisig.fromAccountAddress(conn, pk);
      const [vaultPda] = multisig.getVaultPda({ multisigPda: pk, index: 0 });
      if (vaultPda.equals(VAULT)) {
        console.log("FOUND multisig config:", c);
        console.log("  threshold:", ms.threshold, "of", ms.members.length);
        console.log("  members:", ms.members.map(m => m.key.toBase58() + ((ME && m.key.equals(ME)) ? " (me)" : "")));
        console.log("  transactionIndex:", ms.transactionIndex.toString());
      }
    } catch (e) { /* not a multisig account */ }
  }
})();
