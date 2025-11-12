import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import stellar from "stellar-sdk";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// ✅ Env variables
const RELAY_KEY = process.env.RELAY_API_KEY;
const DISTRIBUTION_SECRET = process.env.DISTRIBUTION_SECRET;
const ISSUER_PUBLIC = process.env.ISSUER_PUBLIC;
const ASSET_CODE = process.env.ASSET_CODE || "ESKEY";
const AMOUNT = process.env.ASSET_AMOUNT || "1";

// ✅ Stellar setup
const HORIZON_URL = "https://horizon.stellar.org";
const NETWORK = stellar.Networks.PUBLIC;
const server = new stellar.Horizon.Server(HORIZON_URL); // ✅ FIXED HERE!

let distributionKeypair, asset;
try {
  distributionKeypair = stellar.Keypair.fromSecret(DISTRIBUTION_SECRET);
  asset = new stellar.Asset(ASSET_CODE, ISSUER_PUBLIC);
} catch (err) {
  console.error("❌ Invalid Stellar key configuration:", err.message);
  process.exit(1);
}

// ✅ API route
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

    const recipient = await server.loadAccount(publicKey);
    const sender = await server.loadAccount(distributionKeypair.publicKey());

    const transaction = new stellar.TransactionBuilder(sender, {
      fee: stellar.BASE_FEE,
      networkPassphrase: NETWORK,
    })
      .addOperation(
        stellar.Operation.payment({
          destination: publicKey,
          asset,
          amount: AMOUNT,
        })
      )
      .setTimeout(30)
      .build();

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
