// config.js — the ONE file you edit (or override everything via environment).
// Every script requires this and fails closed while a needed value still says
// REPLACE_WITH_… , so you can never act against someone else's vault by accident.
module.exports = {
  // Your Squads v4 multisig CONFIG address (shown in the Squads UI after you
  // create the squad, or recovered from the vault address by findconfig.js).
  // NOT the vault address — the config account describes members + threshold.
  MULTISIG_ADDRESS: process.env.MULTISIG_ADDRESS || "REPLACE_WITH_MULTISIG_CONFIG_ADDRESS",

  // Your vault PDA (index 0) — the address that actually holds the funds.
  // Only findconfig.js needs this (it works backwards from vault to config).
  VAULT_ADDRESS: process.env.VAULT_ADDRESS || "REPLACE_WITH_VAULT_ADDRESS",

  // The agent's public key. Optional — findconfig.js only uses it to mark
  // "(me)" in the members list; discovery works without it.
  MY_ADDRESS: process.env.MY_ADDRESS || "",

  // Path to the agent's keypair file: a JSON array secret key, i.e. the format
  // solana-keygen writes. This key can PROPOSE and add one approval — with a
  // 2-of-2 threshold it can never move funds alone.
  KEYPAIR_PATH: process.env.KEYPAIR_PATH || "REPLACE_WITH_KEYPAIR_PATH",

  RPC_URL: process.env.RPC_URL || "https://api.mainnet-beta.solana.com",
};
