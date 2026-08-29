// Read-only inspection of a Squads v4 multisig: config, members, threshold,
// and a decoded walk of every transaction slot + proposal status.
// Usage: node inspect.js
const cfg = require("./config");
const { Connection, PublicKey } = require("@solana/web3.js");
const multisig = require("@sqds/multisig");

if (cfg.MULTISIG_ADDRESS.startsWith("REPLACE_WITH")) {
  console.error("MULTISIG_ADDRESS is not set — edit config.js (or export MULTISIG_ADDRESS) before running.");
  process.exit(1);
}
const MULTISIG_CONFIG = new PublicKey(cfg.MULTISIG_ADDRESS);

(async () => {
  const conn = new Connection(cfg.RPC_URL, "confirmed");

  const ms = await multisig.accounts.Multisig.fromAccountAddress(conn, MULTISIG_CONFIG);
  console.log("Multisig config:", MULTISIG_CONFIG.toBase58());
  console.log("  threshold:", ms.threshold);
  console.log("  members:", ms.members.map(m => `${m.key.toBase58()} perms=${m.permissions.mask}`));
  console.log("  transactionIndex:", ms.transactionIndex.toString());
  console.log("  staleTransactionIndex:", ms.staleTransactionIndex.toString());
  const [vaultPda] = multisig.getVaultPda({ multisigPda: MULTISIG_CONFIG, index: 0 });
  console.log("  vault PDA (index 0):", vaultPda.toBase58());
  console.log("  vault PDA balance:", (await conn.getBalance(vaultPda)) / 1e9, "SOL");

  // Walk every transaction slot and decode what's in it.
  const top = Number(ms.transactionIndex);
  for (let i = 1; i <= top; i++) {
    const idx = BigInt(i);
    const [txPda] = multisig.getTransactionPda({ multisigPda: MULTISIG_CONFIG, index: idx });
    const [propPda] = multisig.getProposalPda({ multisigPda: MULTISIG_CONFIG, transactionIndex: idx });
    console.log(`\n-- transaction ${i} --`);
    console.log("  tx PDA:", txPda.toBase58());
    try {
      const vtx = await multisig.accounts.VaultTransaction.fromAccountAddress(conn, txPda);
      console.log("  type: VaultTransaction, creator:", vtx.creator.toBase58());
      const m = vtx.message;
      console.log("  accountKeys:", m.accountKeys.map(k => k.toBase58()));
      for (const ix of m.instructions) {
        console.log("  ix -> program:", m.accountKeys[ix.programIdIndex].toBase58(),
          "accounts:", Array.from(ix.accountIndexes).map(a => m.accountKeys[a]?.toBase58()),
          "data:", Buffer.from(ix.data).toString("hex"));
      }
    } catch (e) {
      try {
        const ctx = await multisig.accounts.ConfigTransaction.fromAccountAddress(conn, txPda);
        console.log("  type: ConfigTransaction, creator:", ctx.creator.toBase58());
        console.log("  actions:", JSON.stringify(ctx.actions));
      } catch (e2) {
        console.log("  tx account not decodable/absent:", e.message.slice(0, 80));
      }
    }
    try {
      const prop = await multisig.accounts.Proposal.fromAccountAddress(conn, propPda);
      const statusName = Object.keys(prop.status)[0] ?? JSON.stringify(prop.status);
      console.log("  proposal status:", prop.status.__kind ?? statusName);
      console.log("  approved by:", prop.approved.map(k => k.toBase58()));
      console.log("  rejected by:", prop.rejected.map(k => k.toBase58()));
    } catch (e) {
      console.log("  no proposal account:", e.message.slice(0, 80));
    }
  }
})();
