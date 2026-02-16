// api/all-loot-nfts.js

import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

// Loot contract ABI (just the getter functions we need)
const LOOT_ABI = [
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getWeapon',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getChest',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getHead',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getWaist',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getFoot',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getHand',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getNeck',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getRing',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  }
];

export default async function handler(req, res) {
  // --- CORS HEADERS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Only GET requests allowed' });

  try {
    const ALCHEMY_KEY = process.env.ALCHEMY_KEY;
    if (!ALCHEMY_KEY) {
      return res.status(500).json({ error: 'Alchemy key not configured' });
    }

    const OWNER_ADDRESS = '0x712779cbdd3290437f84163fb3d9a06c338768ad';
    const LOOT_CONTRACT = '0xff9c1b15b16263c61d017ee9f65c50e4ae0113d7';

    // Create viem client
    const client = createPublicClient({
      chain: mainnet,
      transport: http(`https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`)
    });

    // Step 1: Get all token IDs owned by the address
    const alchemyUrl = `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}/getNFTsForOwner?owner=${OWNER_ADDRESS}&contractAddresses[]=${LOOT_CONTRACT}&withMetadata=false`;

    const response = await fetch(alchemyUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Alchemy API failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const tokenIds = (data.ownedNfts || []).map(nft => nft.tokenId);

    // Step 2: Fetch gear for each token using viem multicall
    const gearSlots = ['getWeapon', 'getChest', 'getHead', 'getWaist', 'getFoot', 'getHand', 'getNeck', 'getRing'];
    const slotNames = ['Weapon', 'Chest', 'Head', 'Waist', 'Foot', 'Hand', 'Neck', 'Ring'];

    const nfts = await Promise.all(
      tokenIds.map(async (tokenId) => {
        // Use multicall to batch all 8 gear calls for this token
        const results = await client.multicall({
          contracts: gearSlots.map(functionName => ({
            address: LOOT_CONTRACT,
            abi: LOOT_ABI,
            functionName,
            args: [BigInt(tokenId)]
          }))
        });

        const gear = {};
        results.forEach((result, index) => {
          gear[slotNames[index]] = result.status === 'success' ? result.result : '';
        });

        return {
          tokenId,
          gear
        };
      })
    );

    console.log(`Found ${nfts.length} Loot NFTs with gear for ${OWNER_ADDRESS}`);

    res.status(200).json({
      success: true,
      owner: OWNER_ADDRESS,
      contract: LOOT_CONTRACT,
      nfts,
      totalCount: nfts.length
    });

  } catch (err) {
    console.error('Loot NFTs API Error:', err);
    res.status(500).json({
      error: 'Failed to fetch Loot NFTs',
      details: err?.message ?? String(err)
    });
  }
}
