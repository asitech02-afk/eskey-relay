import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import stellar from "stellar-sdk";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// ENV VARIABLES
const RELAY_KEY = process.env.RELAY_API_KEY;
const DISTRIBUTION_SECRET = process.env.DISTRIBUTION_SECRET;
const ISSUER_PUBLIC = process.env.ISSUER_PUBLIC;
const ASSET_CODE = process.env.ASSET_CODE || "ESKEY";

// STELLAR SETUP
const HORIZON_URL = "https://horizon.stellar.org";
const NETWORK = stellar.Networks.PUBLIC;
const server = new stellar.Horizon.Server(HORIZON_URL);

let distributionKeypair, asset;

// VALIDATE KEYS
try {
  distributionKeypair = stellar.Keypair.fromSecret(DISTRIBUTION_SECRET);
  asset = new stellar.Asset(ASSET_CODE, ISSUER_PUBLIC);
} catch (err) {
  console.error("❌ Invalid Stellar key configuration:", err.message);
  process.exit(1);
}

// ========================================================
// ✅ AUTO TRUSTLINE ENDPOINT (Receiver signs it)
// ========================================================
app.post("/trustline", async (req, res) => {
  try {
    const { wallet } = req.body;
    const relayKey = req.headers["x-relay-key"];

    if (!wallet) {
      return res.status(400).json({
        success: false,
        message: "Missing wallet address",
      });
    }

    if (relayKey !== RELAY_KEY) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized relay key",
      });
    }

    const account = await server.loadAccount(wallet);

    const tx = new stellar.TransactionBuilder(account, {
      fee: stellar.BASE_FEE,
      networkPassphrase: NETWORK,
    })
      .addOperation(
        stellar.Operation.changeTrust({
          asset: asset,
        })
      )
      .setTimeout(180)
      .build();

    // IMPORTANT:
    // This transaction is NOT signed here.
    // The user signs it in frontend or wallet.
    const xdr = tx.toXDR();

    return res.json({
      success: true,
      message: "Trustline transaction generated. User must sign.",
      xdr: xdr,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
});

// ========================================================
// ✅ FINAL WORKING CLAIM ENDPOINT (Already compatible!)
// ========================================================
app.post("/claim", async (req, res) => {
  try {
    const { wallet, amount } = req.body;
    const relayKey = req.headers["x-relay-key"];

    if (!wallet || !amount) {
      return res.status(400).json({
        success: false,
        message: "Missing wallet or amount",
      });
    }

    if (relayKey !== RELAY_KEY) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized relay key",
      });
    }

    // Load accounts
    await server.loadAccount(wallet); // validates destination
    const sender = await server.loadAccount(distributionKeypair.publicKey());

    // Create TX
    const tx = new stellar.TransactionBuilder(sender, {
      fee: stellar.BASE_FEE,
      networkPassphrase: NETWORK,
    })
      .addOperation(
        stellar.Operation.payment({
          destination: wallet,
          asset: asset,
          amount: String(amount),
        })
      )
      .setTimeout(30)
      .build();

    tx.sign(distributionKeypair);

    const result = await server.submitTransaction(tx);

    return res.json({
      success: true,
      hash: result.hash,
      sent_amount: amount,
      wallet: wallet,
    });
  } catch (err) {
    console.error("❌ Stellar error:", err.message);
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
});

// ===============================
// HOMEPAGE
// ===============================
app.get("/", (req, res) => {
  res.send("✅ ESKEY Relay is running and ready!");
});

// ===============================
// START SERVER
// ===============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 ESKEY Relay running on port ${PORT}`)
);
