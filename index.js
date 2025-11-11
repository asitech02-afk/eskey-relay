import express from "express";
import cors from "cors";
import { Server, Keypair, TransactionBuilder, Networks, Operation, Asset } from "stellar-sdk";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const RELAY_KEY = process.env.RELAY_API_KEY;
const DISTRIBUTION_SECRET = process.env.DISTRIBUTION_SECRET;
const ISSUER_PUBLIC = process.env.ISSUER_PUBLIC;
const ASSET_CODE = process.env.ASSET_CODE || "ESKEY";
const HORIZON_URL = "https://horizon.stellar.org";
const NETWORK = Networks.PUBLIC;
const AMOUNT = process.env.ASSET_AMOUNT || "1";

const server = new Server(HORIZON_URL);
const distributionKeypair = Keypair.fromSecret(DISTRIBUTION_SECRET);
const asset = new Asset(ASSET_CODE, ISSUER_PUBLIC);

app.post("/api/send-eskey", async (req, res) => {
  try {
    const { publicKey } = req.body;
    const relayKey = req.headers["x-relay-key"];
    if (relayKey !== RELAY_KEY) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const recipient = await server.loadAccount(publicKey);
    const sender = await server.loadAccount(distributionKeypair.publicKey());

    const transaction = new TransactionBuilder(sender, {
      fee: "10000",
      networkPassphrase: NETWORK,
    })
      .addOperation(Operation.payment({
        destination: publicKey,
        asset,
        amount: AMOUNT,
      }))
      .setTimeout(30)
      .build();

    transaction.sign(distributionKeypair);
    const result = await server.submitTransaction(transaction);

    res.json({ success: true, hash: result.hash });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, message: error.message });
  }
});

app.listen(3000, () => console.log("✅ ESKEY Relay running on port 3000"));
