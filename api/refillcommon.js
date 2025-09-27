// api/refillpool.js
import { createWalletClient, createPublicClient, http, parseEventLogs } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains'; // use arb-sepolia (testnet)
import { abi } from '../abi.js'; // your contract ABI

export default async function handler(req, res) {
  // --- CORS HEADERS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST requests allowed' });

  try {
    const { walletAddress } = req.body;

    const PRIVATE_KEY = process.env.PRIVATE_KEY;
    const ALCHEMY_KEY = process.env.ALCHEMY_KEY;

    if (!PRIVATE_KEY) return res.status(500).json({ error: 'Private key not configured' });
    if (!ALCHEMY_KEY) return res.status(500).json({ error: 'Alchemy key not configured' });

    const account = privateKeyToAccount(`0x${PRIVATE_KEY}`);
    // PUBLIC client for reads & waiting for receipts (Arbitrum Sepolia / testnet)
    const publicClient = createPublicClient({
      chain: arbitrumSepolia,
      transport: http(`https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`)
    });

    // WALLET client for writes
    const walletClient = createWalletClient({
      account,
      chain: arbitrumSepolia,
      transport: http(`https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`)
    });

    const CONTRACT_ADDRESS = '0x4bA2ecDa27597B493DC556C7A8110FF18a1c7367';

    // READS
    const nftCount = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi,
      functionName: 'getHeldTokenCount'
    });

    if (nftCount === 0n) {
      return res.status(400).json({
        error: 'No NFTs available in contract to transfer',
        nftCount: 0
      });
    }

    const heldTokenIds = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi,
      functionName: 'getHeldTokenIds'
    });

    console.log(`Contract holds ${nftCount} NFTs:`, heldTokenIds);

    // WRITE (send tx)
    const txHash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi,
      functionName: 'refillPoolCommon',
      args: []
    });

    // Wait for the tx to be mined and get the receipt
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    // Decode PoolRefilled event(s) from receipt.logs using parseEventLogs
    let transferredTokenId = null;
    if (receipt?.logs?.length) {
      const parsed = parseEventLogs({
        abi,
        eventName: 'PoolRefilled',
        logs: receipt.logs
      });

      if (parsed && parsed.length > 0) {
        // parsed[0].args should contain tokenId and poolContract
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
      transferredTokenId,
      previousNftCount: nftCount.toString(),
      poolContract: '0x1c8fD4B77dE82e7eC995D49457e10828c39C57c0',
      message: 'NFT successfully transferred to pool'
    });

  } catch (err) {
    console.error('RefillPool API Error:', err);

    if (err?.message?.includes('No NFTs to transfer')) {
      return res.status(400).json({
        error: 'Contract has no NFTs available to transfer',
        details: err.message
      });
    }

    if (err?.message?.includes("Contract doesn't own this NFT anymore")) {
      return res.status(400).json({
        error: 'Contract no longer owns the selected NFT',
        details: err.message
      });
    }

    res.status(500).json({
      error: 'Failed to execute refillPoolCommon',
      details: err?.message ?? String(err)
    });
  }
}
