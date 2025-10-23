// api/all-nfts.js - NEW ENDPOINT
import { createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { abi } from '../abi.js';

export default async function handler(req, res) {
  // --- CORS HEADERS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Only GET requests allowed' });

  try {
    const ALCHEMY_KEY = process.env.ALCHEMY_KEY;
    if (!ALCHEMY_KEY) return res.status(500).json({ error: 'Alchemy key not configured' });

    const publicClient = createPublicClient({
      chain: arbitrumSepolia,
      transport: http(`https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`)
    });

    const CONTRACT_ADDRESS = '0x851c4152161904F7ad05cf49d64dd1F39fd8E35d';

    // Get all held token IDs
    const heldTokenIds = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi,
      functionName: 'getHeldTokenIds'
    });

    console.log(`Found ${heldTokenIds.length} total NFTs in contract`);

    // Use Alchemy's NFT API to get metadata for each token
    const allNFTs = [];
    
    for (const tokenId of heldTokenIds) {
      try {
        // Call Alchemy NFT API directly
        const response = await fetch(
          `https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}/getNFTMetadata`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contractAddress: '0x5Bc8904CE5cC7db7ac731DE368a829EAC4A803f7',
              tokenId: tokenId.toString(),
              tokenType: 'ERC721'
            })
          }
        );

        if (response.ok) {
          const metadata = await response.json();
          
          // Extract rarity from attributes
          let rarity = "unknown";
          if (metadata.attributes && Array.isArray(metadata.attributes)) {
            const rarityAttr = metadata.attributes.find(attr => 
              attr.trait_type && attr.trait_type.toLowerCase() === 'rarity'
            );
            if (rarityAttr) rarity = rarityAttr.value;
          }
          
          allNFTs.push({
            tokenId: tokenId.toString(),
            name: metadata.name,
            image: metadata.image,
            rarity: rarity,
            attributes: metadata.attributes || []
          });
        }
      } catch (err) {
        console.error(`Error fetching metadata for token ${tokenId}:`, err);
      }
    }

    console.log(`Successfully fetched ${allNFTs.length} NFTs with metadata`);

    res.status(200).json({
      success: true,
      nfts: allNFTs,
      totalCount: allNFTs.length
    });

  } catch (err) {
    console.error('All NFTs API Error:', err);
    res.status(500).json({
      error: 'Failed to fetch NFTs',
      details: err?.message ?? String(err)
    });
  }
}