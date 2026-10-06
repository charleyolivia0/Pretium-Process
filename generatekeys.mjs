import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

async function main() {
  const keys = await generateKeyPair("RS256", {
    extractable: true,
  });
  const privateKey = await exportPKCS8(keys.privateKey);
  const publicKey = await exportJWK(keys.publicKey);
  const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey }] });

  console.log(
    `JWT_PRIVATE_KEY="${privateKey.trimEnd().replace(/\n/g, " ")}"`,
  );
  console.log(`JWKS=${jwks}`);
}

main().catch((err) => {
  console.error("Error generating keys:", err);
  process.exit(1);
});
