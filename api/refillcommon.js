// api/refillpool.js
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';
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
    // No parameters needed for refillPoolCommon function
    // Optional: could accept wallet address for additional validation
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

    const client = createWalletClient({
      account,
      chain: arbitrum,
      transport: http(`https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`)
    });

    // First, check if contract has any NFTs to transfer
    const nftCount = await client.readContract({
      address: '0xb009B318aBA823B18002283b1A1dc0552DF6612b', // RefillPoolCommon contract
      abi,
      functionName: 'getHeldTokenCount'
    });

    if (nftCount === 0n) {
      return res.status(400).json({ 
        error: 'No NFTs available in contract to transfer',
        nftCount: 0
      });
    }

    // Get list of held token IDs for logging
    const heldTokenIds = await client.readContract({
      address: '0xb009B318aBA823B18002283b1A1dc0552DF6612b',
      abi,
      functionName: 'getHeldTokenIds'
    });

    console.log(`Contract holds ${nftCount} NFTs:`, heldTokenIds);

    // Call refillPoolCommon function
    const txHash = await client.writeContract({
      address: '0xb009B318aBA823B18002283b1A1dc0552DF6612b', // RefillPoolCommon contract
      abi,
      functionName: 'refillPoolCommon',
      args: [] // No arguments needed
    });

    // Get transaction receipt to parse events
    const receipt = await client.waitForTransactionReceipt({
      hash: txHash
    });

    // Try to find PoolRefilled event in logs
    let transferredTokenId = null;
    if (receipt.logs) {
      const poolRefilledEvent = receipt.logs.find(log => 
        log.topics[0] === client.keccak256('PoolRefilled(uint256,address)')
      );
      
      if (poolRefilledEvent) {
        // Decode the event data to get token ID
        const decoded = client.decodeEventLog({
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
    
    // Handle specific contract errors
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
