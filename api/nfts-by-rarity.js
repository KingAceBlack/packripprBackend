// api/nfts-with-ev.js
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
    }).filter(nft => nft.cert !== null); // Only keep NFTs with cert values

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
              error: `EV lookup failed: ${evResponse.statusText}`
            };
          }

          const evData = await evResponse.json();
          
          return {
            tokenId: nft.tokenId,
            cert: nft.cert,
            ev: evData.ev || evData.data?.ev || evData // Adjust based on actual response structure
          };
        } catch (error) {
          console.error(`Error fetching EV for cert ${nft.cert}:`, error);
          return {
            tokenId: nft.tokenId,
            cert: nft.cert,
            ev: null,
            error: error.message
          };
        }
      })
    );

    // Separate successful and failed lookups
    const successful = nftsWithEV.filter(nft => nft.ev !== null && !nft.error);
    const failed = nftsWithEV.filter(nft => nft.ev === null || nft.error);

    console.log(`Successfully fetched EV for ${successful.length} out of ${nftsWithEV.length} NFTs`);

    res.status(200).json({
      success: true,
      totalNFTs: nftsWithEV.length,
      successfulLookups: successful.length,
      failedLookups: failed.length,
      nfts: nftsWithEV,
      // Simplified array with just the essentials
      results: nftsWithEV.map(nft => ({
        tokenId: nft.tokenId,
        ev: nft.ev
      }))
    });

  } catch (err) {
    console.error('NFTs with EV API Error:', err);
    res.status(500).json({
      error: 'Failed to fetch NFTs with EV data',
      details: err?.message ?? String(err)
    });
  }
}
