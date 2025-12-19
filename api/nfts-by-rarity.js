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
    // Get rarity from query parameter
    const { rarity } = req.query;
    
    if (!rarity) {
      return res.status(400).json({ 
        error: 'Rarity parameter is required',
        usage: 'Call with ?rarity=common (or rare, epic, legendary, etc.)'
      });
    }

    const ALCHEMY_KEY = process.env.ALCHEMY_KEY;
    if (!ALCHEMY_KEY) return res.status(500).json({ error: 'Alchemy key not configured' });

    const CONTRACT_ADDRESS = '0xA3D7FB8BA2cD9605D0599BD23F1486725A5f7a68';
    const NFT_CONTRACT = '0xEed0161329830F14d85D28c9803eeF4a02016c14';

    // Use Alchemy's getNFTs endpoint to get NFTs owned by the contract
    const alchemyUrl = `https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}/getNFTs?owner=${CONTRACT_ADDRESS}&contractAddresses[]=${NFT_CONTRACT}&withMetadata=true`;
    
    const response = await fetch(alchemyUrl);
    if (!response.ok) {
      throw new Error(`Alchemy getNFTs failed: ${response.statusText}`);
    }

    const data = await response.json();

    // Process all NFTs and extract rarity
    const allNFTs = data.ownedNfts.map(nft => {
      const tokenId = BigInt(nft.id.tokenId).toString();
      
      // Extract rarity from attributes
      let nftRarity = "unknown";
      if (nft.metadata?.attributes) {
        const rarityAttr = nft.metadata.attributes.find(attr => 
          attr.trait_type && attr.trait_type.toLowerCase() === 'rarity'
        );
        if (rarityAttr) {
          nftRarity = rarityAttr.value;
        }
      }

      return {
        tokenId,
        name: nft.title,
        image: nft.media[0]?.gateway || nft.metadata?.image,
        rarity: nftRarity,
        attributes: nft.metadata?.attributes || []
      };
    });

    // Filter NFTs by the specified rarity (case-insensitive)
    const targetRarity = rarity.toLowerCase();
    const filteredNFTs = allNFTs.filter(nft => 
      nft.rarity.toLowerCase() === targetRarity
    );

    // Extract just the token IDs
    const tokenIds = filteredNFTs.map(nft => nft.tokenId);

    // Count all rarities for reference
    const rarityCounts = {};
    allNFTs.forEach(nft => {
      const r = nft.rarity;
      rarityCounts[r] = (rarityCounts[r] || 0) + 1;
    });

    console.log(`Filtered ${filteredNFTs.length} NFTs with rarity "${rarity}" out of ${allNFTs.length} total`);

    res.status(200).json({
      success: true,
      requestedRarity: rarity,
      nfts: filteredNFTs,
      tokenIds: tokenIds,
      count: filteredNFTs.length,
      totalNFTs: allNFTs.length,
      availableRarities: rarityCounts
    });

  } catch (err) {
    console.error('NFTs by Rarity API Error:', err);
    res.status(500).json({
      error: 'Failed to fetch NFTs',
      details: err?.message ?? String(err)
    });
  }
}
