#!/usr/bin/env node
/**
 * Generate Ed25519 keypair for buyer-mandate signing.
 * Paste into .env.local — private key only on the signer; public key for merchant verify.
 */
import { generateKeyPairSync } from "crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const priv = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
const pub = publicKey.export({ type: "spki", format: "der" }).toString("base64");

console.log("# Buyer mandate authority (Ed25519). Signer holds private; merchant verifies with public.");
console.log(`BUYER_MANDATE_PRIVATE_KEY_B64=${priv}`);
console.log(`BUYER_MANDATE_PUBLIC_KEY_B64=${pub}`);
