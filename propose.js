// Create a Squads v4 spend proposal from the vault, with the agent's approval attached.
// Usage:
//   node propose.js <recipient> <amountSOL> "<memo>"           # dry-run: build + simulate only
//   node propose.js <recipient> <amountSOL> "<memo>" --send    # actually submit (needs gas in the agent wallet)
//
// Flow (one transaction, three instructions):
//   vaultTransactionCreate  -> stores the SOL transfer to be executed from vault PDA
//   proposalCreate          -> opens voting on it
//   proposalApprove         -> the agent's 1-of-2 signature; the co-signer approves in
//                              the Squads app, then anyone can run execute.js.
// Dry-run simulates with the vault PDA as fee/rent payer and sigVerify off, so it
// works even while the agent wallet holds 0 SOL. Nothing touches the chain in dry-run.
const fs = require("fs");
const cfg = require("./config");
const {
  Connection, Keypair, PublicKey, SystemProgram,
  TransactionMessage, VersionedTransaction, LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const multisig = require("@sqds/multisig");

if (cfg.MULTISIG_ADDRESS.startsWith("REPLACE_WITH")) {
  console.error("MULTISIG_ADDRESS is not set — edit config.js (or export MULTISIG_ADDRESS) before running.");
  process.exit(1);
}
const MULTISIG = new PublicKey(cfg.MULTISIG_ADDRESS);
const RPC = cfg.RPC_URL;

(async () => {
  const [recipient, amountSol, memo] = process.argv.slice(2);
  const send = process.argv.includes("--send");
  if (!recipient || !amountSol || !memo) {
    console.error('usage: node propose.js <recipient> <amountSOL> "<memo>" [--send]');
    process.exit(1);
  }
  const to = new PublicKey(recipient);
  const lamports = Math.round(parseFloat(amountSol) * LAMPORTS_PER_SOL);
  if (!(lamports > 0)) throw new Error("bad amount");

  const me = Keypair.fromSecretKey(new Uint8Array(
    JSON.parse(fs.readFileSync(cfg.KEYPAIR_PATH))));
  const conn = new Connection(RPC, "confirmed");

  const ms = await multisig.accounts.Multisig.fromAccountAddress(conn, MULTISIG);
  const transactionIndex = BigInt(ms.transactionIndex.toString()) + 1n;
  const [vaultPda] = multisig.getVaultPda({ multisigPda: MULTISIG, index: 0 });
  console.log("multisig:", MULTISIG.toBase58());
  console.log("vault PDA:", vaultPda.toBase58(), "balance:", (await conn.getBalance(vaultPda)) / LAMPORTS_PER_SOL, "SOL");
  console.log("next transactionIndex:", transactionIndex.toString());
  console.log("spend:", lamports / LAMPORTS_PER_SOL, "SOL ->", to.toBase58(), "| memo:", memo);

  const { blockhash } = await conn.getLatestBlockhash();
  // In dry-run the vault PDA fronts fees/rent so simulation passes with an empty agent wallet.
  const payer = send ? me.publicKey : vaultPda;

  const inner = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: blockhash,
    instructions: [SystemProgram.transfer({ fromPubkey: vaultPda, toPubkey: to, lamports })],
  });

  const ixs = [
    multisig.instructions.vaultTransactionCreate({
      multisigPda: MULTISIG, transactionIndex, creator: me.publicKey,
      rentPayer: payer, vaultIndex: 0, ephemeralSigners: 0,
      transactionMessage: inner, memo,
    }),
    multisig.instructions.proposalCreate({
      multisigPda: MULTISIG, transactionIndex, creator: me.publicKey, rentPayer: payer,
    }),
    multisig.instructions.proposalApprove({
      multisigPda: MULTISIG, transactionIndex, member: me.publicKey,
    }),
  ];

  const msg = new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions: ixs })
    .compileToV0Message();
  const tx = new VersionedTransaction(msg);

  if (!send) {
    const sim = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
    if (sim.value.err) {
      console.error("SIMULATION FAILED:", JSON.stringify(sim.value.err));
      console.error((sim.value.logs || []).join("\n"));
      process.exit(1);
    }
    console.log("SIMULATION OK — units:", sim.value.unitsConsumed);
    console.log("Re-run with --send once the agent wallet has gas.");
    return;
  }

  tx.sign([me]);
  const sig = await conn.sendTransaction(tx);
  console.log("sent:", sig);
  await conn.confirmTransaction(sig, "confirmed");
  const [proposalPda] = multisig.getProposalPda({ multisigPda: MULTISIG, transactionIndex });
  console.log("confirmed. proposal:", proposalPda.toBase58());
  console.log("Waiting on the co-signer approval, then: node execute.js", transactionIndex.toString());
})();
