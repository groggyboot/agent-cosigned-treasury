// Execute a Squads proposal that has reached threshold. Usage:
//   node execute.js <transactionIndex>          # dry-run simulate
//   node execute.js <transactionIndex> --send
const fs = require("fs");
const cfg = require("./config");
const {
  Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction,
} = require("@solana/web3.js");
const multisig = require("@sqds/multisig");

if (cfg.MULTISIG_ADDRESS.startsWith("REPLACE_WITH")) {
  console.error("MULTISIG_ADDRESS is not set — edit config.js (or export MULTISIG_ADDRESS) before running.");
  process.exit(1);
}
const MULTISIG = new PublicKey(cfg.MULTISIG_ADDRESS);
const conn = new Connection(cfg.RPC_URL, "confirmed");

(async () => {
  const transactionIndex = BigInt(process.argv[2]);
  const send = process.argv.includes("--send");
  const me = Keypair.fromSecretKey(new Uint8Array(
    JSON.parse(fs.readFileSync(cfg.KEYPAIR_PATH))));
  const [vaultPda] = multisig.getVaultPda({ multisigPda: MULTISIG, index: 0 });

  const [propPda] = multisig.getProposalPda({ multisigPda: MULTISIG, transactionIndex });
  const p = await multisig.accounts.Proposal.fromAccountAddress(conn, propPda);
  console.log("proposal", transactionIndex.toString(), "status:", p.status.__kind,
    "approved:", p.approved.map(k => k.toBase58()));

  const { instruction: ix } = await multisig.instructions.vaultTransactionExecute({
    connection: conn, multisigPda: MULTISIG, transactionIndex, member: me.publicKey,
  });
  const { blockhash } = await conn.getLatestBlockhash();
  const payer = send ? me.publicKey : vaultPda; // vault fronts the fee in simulation only
  const msg = new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions: [ix] })
    .compileToV0Message();
  const tx = new VersionedTransaction(msg);

  if (!send) {
    const sim = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
    console.log(sim.value.err ? "SIMULATION FAILED: " + JSON.stringify(sim.value.err) + "\n" + (sim.value.logs || []).join("\n")
                              : "SIMULATION OK — units: " + sim.value.unitsConsumed);
    return;
  }
  tx.sign([me]);
  const sig = await conn.sendTransaction(tx);
  console.log("sent:", sig);
  await conn.confirmTransaction(sig, "confirmed");
  console.log("executed.");
})();
