// api/refillcommon.js
import { createWalletClient, createPublicClient, http, parseEventLogs } from 'viem';
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
    // Check secret key first - EXACTLY like pauseops
    const SECRET_KEY = process.env.SECRET_KEY;
    const providedKey = req.headers['x-secret-key'] || req.body.secretKey;

    if (!SECRET_KEY) return res.status(500).json({ error: 'Server configuration error' });
    if (!providedKey) return res.status(401).json({ error: 'Secret key required' });
    if (providedKey !== SECRET_KEY) return res.status(403).json({ error: 'Invalid secret key' });

    const { tokenId } = req.body;

    const PRIVATE_KEY = process.env.PRIVATE_KEY;
    const ALCHEMY_KEY = process.env.ALCHEMY_KEY;

    if (!PRIVATE_KEY) return res.status(500).json({ error: 'Private key not configured' });
    if (!ALCHEMY_KEY) return res.status(500).json({ error: 'Alchemy key not configured' });

    // Validate tokenId is provided
    if (!tokenId && tokenId !== 0) {
      return res.status(400).json({
        error: 'tokenId is required',
        details: 'You must specify which NFT tokenId to use for refilling the pool'
      });
    }

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

    const CONTRACT_ADDRESS = '0x851c4152161904F7ad05cf49d64dd1F39fd8E35d';

    // Verify the contract actually holds the specified token
    const holdsToken = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi,
      functionName: 'holdsToken',
      args: [BigInt(tokenId)]
    });

    if (!holdsToken) {
      // Get current held tokens to show available options
      const heldTokenIds = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi,
        functionName: 'getHeldTokenIds'
      });

      return res.status(400).json({
        error: 'Contract does not hold the specified token',
        tokenId,
        availableTokens: heldTokenIds.map(id => id.toString()),
        details: `Token ID ${tokenId} is not owned by the contract. Available tokens: ${heldTokenIds.join(', ')}`
      });
    }

    console.log(`Refilling pool with token ${tokenId}...`);

    // Execute refill with the frontend-specified tokenId
    const txHash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi,
      functionName: 'refillPoolCommon',
      args: [BigInt(tokenId)],
      gas: 300000n,
      gasPrice: await publicClient.getGasPrice()
    });

    // Wait for transaction receipt
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    // Parse event logs
    let transferredTokenId = null;
    if (receipt?.logs?.length) {
      const parsed = parseEventLogs({
        abi,
        eventName: 'PoolRefilled',
        logs: receipt.logs
      });

      if (parsed && parsed.length > 0) {
        const maybeTokenId = parsed[0].args?.tokenId ?? parsed[0].args?.[0];
        if (typeof maybeTokenId === 'bigint') {
          transferredTokenId = maybeTokenId.toString();
        } else if (maybeTokenId != null) {
          transferredTokenId = String(maybeTokenId);
        }
      }
    }

    res.status(200).json({
      success: true,
      txHash,
      tokenIdUsed: tokenId,
      transferredTokenId: transferredTokenId || tokenId,
      message: `Successfully used NFT #${tokenId} to refill pool`
    });

  } catch (err) {
    console.error('RefillPool API Error:', err);

    // Handle specific contract errors
    if (err?.message?.includes('Contract does not hold token')) {
      return res.status(400).json({
        error: 'Contract does not hold the specified token',
        details: err.message
      });
    }

    if (err?.message?.includes('Invalid tokenId') || err?.message?.includes('invalid token')) {
      return res.status(400).json({
        error: 'Invalid tokenId provided',
        details: err.message
      });
    }

    if (err?.message?.includes('Only owner can call this function')) {
      return res.status(403).json({
        error: 'Unauthorized: Only contract owner can refill pool',
        details: err.message
      });
    }

    res.status(500).json({
      error: 'Failed to refill pool',
      details: err?.message ?? String(err)
    });
  }
}
