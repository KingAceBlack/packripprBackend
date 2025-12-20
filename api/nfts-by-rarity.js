// api/nfts-by-rarity.js
import { createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { abi } from '../abi.js';

// Define EV rarity ranges
const RARITY_RANGES = {
  common: { min: 25, max: 60 },
  rare: { min: 61, max: 125 },
  epic: { min: 126, max: 499 },
  legendary: { min: 500, max: Infinity }
};

function getEVRarity(ev) {
  const evNum = parseFloat(ev);
  if (isNaN(evNum)) return null;
  
  if (evNum >= 25 && evNum <= 60) return 'common';
  if (evNum >= 61 && evNum <= 125) return 'rare';
  if (evNum >= 126 && evNum <= 499) return 'epic';
  if (evNum >= 500) return 'legendary';
  return null;
}

export default async function handler(req, res) {
  // --- CORS HEADERS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Only GET requests allowed' });

  try {
    // Get rarity filter from query parameter
    const { rarity } = req.query;
    
    const ALCHEMY_KEY = process.env.ALCHEMY_KEY;
    if (!ALCHEMY_KEY) return res.status(500).json({ error: 'Alchemy key not configured' });

    const CONTRACT_ADDRESS = '0xA3D7FB8BA2cD9605D0599BD23F1486725A5f7a68';
    const NFT_CONTRACT = '0xEed0161329830F14d85D28c9803eeF4a02016c14';

    // Step 1: Get NFTs from Alchemy
    const alchemyUrl = `https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}/getNFTs?owner=${CONTRACT_ADDRESS}&contractAddresses[]=${NFT_CONTRACT}&withMetadata=true`;
    
    const response = await fetch(alchemyUrl);
    if (!response.ok) {
      throw new Error(`Alchemy getNFTs failed: ${response.statusText}`);
    }

    const data = await response.json();

    // Step 2: Extract tokenId and Cert only
    const nftCerts = data.ownedNfts.map(nft => {
      const tokenId = BigInt(nft.id.tokenId).toString();
      
      // Extract Cert from attributes
      let certValue = null;
      if (nft.metadata?.attributes) {
        const certAttr = nft.metadata.attributes.find(attr => 
          attr.trait_type && attr.trait_type.toLowerCase() === 'cert'
        );
        if (certAttr) {
          certValue = certAttr.value;
        }
      }

      return {
        tokenId,
        cert: certValue
      };
    }).filter(nft => nft.cert !== null);

    console.log(`Found ${nftCerts.length} NFTs with Cert values`);

    // Step 3: Fetch EV data for each cert number
    const nftsWithEV = await Promise.all(
      nftCerts.map(async (nft) => {
        try {
          const evUrl = `https://packripper-frontend.vercel.app/api/ev-lookup?certNumber=${nft.cert}`;
          const evResponse = await fetch(evUrl);
          
          if (!evResponse.ok) {
            console.error(`EV lookup failed for cert ${nft.cert}: ${evResponse.statusText}`);
            return {
              tokenId: nft.tokenId,
              cert: nft.cert,
              ev: null,
              evRarity: null,
              error: `EV lookup failed: ${evResponse.statusText}`
            };
          }

          const evData = await evResponse.json();
          const evValue = evData.ev || evData.data?.ev || evData.estimatedValue || null;
          const evRarity = evValue !== null ? getEVRarity(evValue) : null;
          
          return {
            tokenId: nft.tokenId,
            cert: nft.cert,
            ev: evValue,
            evRarity: evRarity
          };
        } catch (error) {
          console.error(`Error fetching EV for cert ${nft.cert}:`, error);
          return {
            tokenId: nft.tokenId,
            cert: nft.cert,
            ev: null,
            evRarity: null,
            error: error.message
          };
        }
      })
    );

    // Step 4: Filter by rarity if specified
    let filteredNFTs = nftsWithEV.filter(nft => nft.ev !== null && nft.evRarity !== null);
    
    if (rarity) {
      const targetRarity = rarity.toLowerCase();
      if (!RARITY_RANGES[targetRarity]) {
        return res.status(400).json({
          error: 'Invalid rarity parameter',
          validRarities: Object.keys(RARITY_RANGES),
          usage: 'Use ?rarity=common, ?rarity=rare, ?rarity=epic, or ?rarity=legendary'
        });
      }
      
      filteredNFTs = filteredNFTs.filter(nft => nft.evRarity === targetRarity);
      console.log(`Filtered to ${filteredNFTs.length} NFTs with ${targetRarity} rarity`);
    }

    // Count NFTs by rarity for summary
    const rarityCounts = {
      common: 0,
      rare: 0,
      epic: 0,
      legendary: 0,
      invalid: nftsWithEV.filter(nft => nft.ev === null || nft.evRarity === null).length
    };
    
    nftsWithEV.forEach(nft => {
      if (nft.evRarity) {
        rarityCounts[nft.evRarity]++;
      }
    });

    res.status(200).json({
      success: true,
      requestedRarity: rarity || 'all',
      totalNFTs: nftsWithEV.length,
      matchingNFTs: filteredNFTs.length,
      rarityCounts: rarityCounts,
      rarityRanges: RARITY_RANGES,
      nfts: filteredNFTs,
      // Simplified array with just tokenId and EV
      results: filteredNFTs.map(nft => ({
        tokenId: nft.tokenId,
        ev: nft.ev,
        rarity: nft.evRarity
      }))
    });

  } catch (err) {
    console.error('NFTs by Rarity API Error:', err);
    res.status(500).json({
      error: 'Failed to fetch NFTs with EV data',
      details: err?.message ?? String(err)
    });
  }
}
