// api/nfts-by-rarity.js
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
    const { rarity } = req.query;

    if (!rarity) {
      return res.status(400).json({
        error: 'Rarity parameter is required',
        details: 'Specify rarity: common, rare, epic, or legendary'
      });
    }

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
    const nftData = [];
    
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
          nftData.push({
            tokenId: tokenId.toString(),
            metadata: metadata
          });
        }
      } catch (err) {
        console.error(`Error fetching metadata for token ${tokenId}:`, err);
      }
    }

    // Filter by rarity - FIXED TO MATCH YOUR METADATA
    const filteredNFTs = nftData.filter(nft => {
      const metadata = nft.metadata;
      if (!metadata) return false;

      let foundRarity = null;

      // Check attributes array for rarity
      if (metadata.attributes && Array.isArray(metadata.attributes)) {
        const rarityAttr = metadata.attributes.find(attr => 
          attr.trait_type && attr.trait_type.toLowerCase() === 'rarity'
        );
        if (rarityAttr) foundRarity = rarityAttr.value;
      }

      // Check metadata fields
      if (!foundRarity && metadata.rarity) {
        foundRarity = metadata.rarity;
      }

      // Map search terms to actual metadata values
      const rarityMapping = {
        'common': 'common',
        'rare': 'rare', 
        'epic': 'epic',
        'legend': 'legendary'  // You're searching for "legend" but metadata has "legendary"
      };

      const searchRarity = rarityMapping[rarity.toLowerCase()] || rarity.toLowerCase();
      
      return foundRarity && foundRarity.toLowerCase() === searchRarity;
    });

    console.log(`Found ${filteredNFTs.length} NFTs with rarity: ${rarity}`);

    // Debug: Log all rarities found for troubleshooting
    console.log("All rarities found in metadata:");
    nftData.forEach(nft => {
      if (nft.metadata && nft.metadata.attributes) {
        const rarityAttr = nft.metadata.attributes.find(attr => 
          attr.trait_type && attr.trait_type.toLowerCase() === 'rarity'
        );
        if (rarityAttr) {
          console.log(`Token ${nft.tokenId}: ${rarityAttr.value}`);
        }
      }
    });

    res.status(200).json({
      success: true,
      rarity,
      nfts: filteredNFTs.map(nft => ({
        tokenId: nft.tokenId,
        name: nft.metadata.name,
        image: nft.metadata.image,
        attributes: nft.metadata.attributes
      })),
      totalCount: filteredNFTs.length
    });

  } catch (err) {
    console.error('NFTs by Rarity API Error:', err);
    res.status(500).json({
      error: 'Failed to fetch NFTs by rarity',
      details: err?.message ?? String(err)
    });
  }
}
