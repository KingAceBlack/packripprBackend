// api/all-nfts.js
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

    const CONTRACT_ADDRESS = '0x851c4152161904F7ad05cf49d64dd1F39fd8E35d';
    const NFT_CONTRACT = '0x5Bc8904CE5cC7db7ac731DE368a829EAC4A803f7';

    // Use Alchemy's getNFTs endpoint to get NFTs owned by the contract
    const alchemyUrl = `https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}/getNFTs?owner=${CONTRACT_ADDRESS}&contractAddresses[]=${NFT_CONTRACT}&withMetadata=true`;
    
    const response = await fetch(alchemyUrl);
    if (!response.ok) {
      throw new Error(`Alchemy getNFTs failed: ${response.statusText}`);
    }

    const data = await response.json();

    const nfts = data.ownedNfts.map(nft => {
      const tokenId = BigInt(nft.id.tokenId).toString();
      
      // Extract rarity from attributes
      let rarity = "unknown";
      if (nft.metadata?.attributes) {
        const rarityAttr = nft.metadata.attributes.find(attr => 
          attr.trait_type && attr.trait_type.toLowerCase() === 'rarity'
        );
        if (rarityAttr) {
          rarity = rarityAttr.value;
        }
      }

      return {
        tokenId,
        name: nft.title,
        image: nft.media[0]?.gateway || nft.metadata?.image,
        rarity: rarity,
        attributes: nft.metadata?.attributes || []
      };
    });

    console.log(`Alchemy API found ${nfts.length} NFTs for contract ${CONTRACT_ADDRESS}`);

    res.status(200).json({
      success: true,
      nfts: nfts,
      totalCount: nfts.length
    });

  } catch (err) {
    console.error('All NFTs API Error:', err);
    res.status(500).json({
      error: 'Failed to fetch NFTs',
      details: err?.message ?? String(err)
    });
  }
}
