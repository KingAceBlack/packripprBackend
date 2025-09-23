// api/refillpool.js
import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';
import { abi } from '../abi.js'; // RefillPoolCommon contract ABI

export default async function handler(req, res) {

  // --- CORS HEADERS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  // --- END CORS HEADERS ---

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST requests allowed' });
  }

  try {
    const { walletAddress } = req.body;

    // Load keys from env
    const PRIVATE_KEY = process.env.PRIVATE_KEY;
    const ALCHEMY_KEY = process.env.ALCHEMY_KEY;

    if (!PRIVATE_KEY) {
      return res.status(500).json({ error: 'Private key not configured' });
    }
    if (!ALCHEMY_KEY) {
      return res.status(500).json({ error: 'Alchemy key not configured' });
    }

    const account = privateKeyToAccount(PRIVATE_KEY);

    // ✅ Use PublicClient for reading
    const publicClient = createPublicClient({
      chain: arbitrumSepolia,
      transport: http(`https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`)
    });

    // ✅ Use WalletClient for writing
    const walletClient = createWalletClient({
      account,
      chain: arbitrumSepolia,
      transport: http(`https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`)
    });

    // --- READ CONTRACT STATE ---
    const nftCount = await publicClient.readContract({
      address: '0xb009B318aBA823B18002283b1A1dc0552DF6612b',
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
      address: '0xb009B318aBA823B18002283b1A1dc0552DF6612b',
      abi,
      functionName: 'getHeldTokenIds'
    });

    console.log(`Contract holds ${nftCount} NFTs:`, heldTokenIds);

    // --- WRITE TO CONTRACT ---
    const txHash = await walletClient.writeContract({
      address: '0xb009B318aBA823B18002283b1A1dc0552DF6612b',
      abi,
      functionName: 'refillPoolCommon',
      args: []
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    // --- PARSE EVENTS ---
    let transferredTokenId = null;
    if (receipt.logs) {
      const poolRefilledEvent = receipt.logs.find(
        log => log.topics[0] === publicClient.keccak256('PoolRefilled(uint256,address)')
      );
      
      if (poolRefilledEvent) {
        const decoded = publicClient.decodeEventLog({
          abi,
          eventName: 'PoolRefilled',
          data: poolRefilledEvent.data,
          topics: poolRefilledEvent.topics
        });
        transferredTokenId = decoded.args.tokenId;
      }
    }

    res.status(200).json({ 
      success: true, 
      txHash,
      transferredTokenId: transferredTokenId ? transferredTokenId.toString() : null,
      previousNftCount: nftCount.toString(),
      poolContract: '0x1c8fD4B77dE82e7eC995D49457e10828c39C57c0',
      message: 'NFT successfully transferred to pool'
    });

  } catch (err) {
    console.error('RefillPool API Error:', err);

    if (err.message.includes('No NFTs to transfer')) {
      return res.status(400).json({ 
        error: 'Contract has no NFTs available to transfer',
        details: err.message 
      });
    }
    
    if (err.message.includes('Contract doesn\'t own this NFT anymore')) {
      return res.status(400).json({ 
        error: 'Contract no longer owns the selected NFT',
        details: err.message 
      });
    }

    res.status(500).json({ 
      error: 'Failed to execute refillPoolCommon',
      details: err.message 
    });
  }
}
