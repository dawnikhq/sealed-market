import { getEnclavePubKey } from '../attestation.js';
import { initializeEnclaveState } from './server.js';

async function runSeed() {
  console.log('[Sealed Market Seed] Initializing & sealing 3 fictional CSV datasets into TEE...');
  await initializeEnclaveState({ seed: true });
  console.log('[Sealed Market Seed] Enclave ed25519 Public Key:', getEnclavePubKey());
  console.log('[Sealed Market Seed] Sealed datasets ready: ds_bike, ds_churn, ds_bad');
}

runSeed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
