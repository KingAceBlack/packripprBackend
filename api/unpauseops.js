// api/unpauseops.js
import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';
import { abi } from '../abi.js';

export default async function handler(req, res) {
  // --- CORS HEADERS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Secret-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST requests allowed' });

  try {
    // Check secret key first
    const SECRET_KEY = process.env.SECRET_KEY;
    const providedKey = req.headers['x-secret-key'] || req.body.secretKey;

    if (!SECRET_KEY) return res.status(500).json({ error: 'Server configuration error' });
    if (!providedKey) return res.status(401).json({ error: 'Secret key required' });
    if (providedKey !== SECRET_KEY) return res.status(403).json({ error: 'Invalid secret key' });

    const PRIVATE_KEY = process.env.PRIVATE_KEY;
    const ALCHEMY_KEY = process.env.ALCHEMY_KEY;

    if (!PRIVATE_KEY) return res.status(500).json({ error: 'Private key not configured' });
    if (!ALCHEMY_KEY) return res.status(500).json({ error: 'Alchemy key not configured' });

    const account = privateKeyToAccount(`0x${PRIVATE_KEY}`);

    const publicClient = createPublicClient({
      chain: arbitrumSepolia,
      transport: http(`https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`)
    });

    const walletClient = createWalletClient({
      account,
      chain: arbitrumSepolia,
      transport: http(`https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`)
    });

    const CONTRACT_ADDRESS = '0x345696D68D5D3e2bbF5307152aA6458286056F0f';

    const isPaused = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi,
      functionName: 'paused'
    });

    console.log(`Current pause state: ${isPaused}`);

    const txHash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi,
      functionName: 'unpause',
      args: [],
      gas: 100000n,
      gasPrice: await publicClient.getGasPrice()
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    res.status(200).json({
      success: true,
      txHash,
      previousState: isPaused,
      newState: false,
      message: 'Contract unpaused successfully'
    });

  } catch (err) {
    console.error('Unpause API Error:', err);

    if (err?.message?.includes('Only owner can call this function')) {
      return res.status(403).json({
        error: 'Unauthorized: Only contract owner can unpause',
        details: err.message
      });
    }

    res.status(500).json({
      error: 'Failed to unpause contract',
      details: err?.message ?? String(err)
    });
  }
}
