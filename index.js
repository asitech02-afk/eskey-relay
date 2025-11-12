import express from "express";
import cors from "cors";
import * as StellarSdk from "stellar-sdk";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// ✅ Load environment variables
const RELAY_KEY = process.env.RELAY_API_KEY;
const DISTRIBUTION_SECRET = process.env.DISTRIBUTION_SECRET;
const ISSUER_PUBLIC = process.env.ISSUER_PUBLIC;
const ASSET_CODE = process.env.ASSET_CODE || "ESKEY";
const AMOUNT = process.env.ASSET_AMOUNT || "1";

// ✅ Stellar setup
const HORIZON_URL = "https://horizon.stellar.org";
const NETWORK = StellarSdk.Networks.PUBLIC;
const server = new StellarSdk.Server(HORIZON_URL);

let distributionKeypair;
let asset;

try {
  distributionKeypair = StellarSdk.Keypair.fromSecret(DISTRIBUTION_SECRET);
  asset = new StellarSdk.Asset(ASSET_CODE, ISSUER_PUBLIC);
} catch (err) {
  console.error("❌ Invalid Stellar key configuration:", err.message);
  process.exit(1);
}

// ✅ Main API endpoint
app.post("/api/send-eskey", async (req, res) => {
  try {
    const { publicKey } = req.body;
    const relayKey = req.headers["x-relay-key"];

    if (!publicKey) {
      return res.status(400).json({ success: false, message: "Missing publicKey" });
    }

    if (relayKey !== RELAY_KEY) {
      return res.status(403).json({ success: false, message: "Unauthorized relay key" });
    }

    // Load sender and recipient accounts
    const recipient = await server.loadAccount(publicKey);
    const sender = await server.loadAccount(distributionKeypair.publicKey());

    // Build transaction
    const transaction = new StellarSdk.TransactionBuilder(sender, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK,
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination: publicKey,
          asset,
          amount: AMOUNT,
        })
      )
      .setTimeout(30)
      .build();

    // Sign and submit
    transaction.sign(distributionKeypair);
    const result = await server.submitTransaction(transaction);

    res.json({ success: true, hash: result.hash });
  } catch (error) {
    console.error("❌ Error sending ESKEY:", error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

// ✅ Homepage route
app.get("/", (req, res) => {
  res.send("✅ ESKEY Relay is running on Render!");
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ ESKEY Relay running on port ${PORT}`));
