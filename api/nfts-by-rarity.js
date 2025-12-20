// api/nfts-cert-tokenid.js
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

    // Use Alchemy's getNFTs endpoint to get NFTs owned by the contract
    const alchemyUrl = `https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}/getNFTs?owner=${CONTRACT_ADDRESS}&contractAddresses[]=${NFT_CONTRACT}&withMetadata=true`;
    
    const response = await fetch(alchemyUrl);
    if (!response.ok) {
      throw new Error(`Alchemy getNFTs failed: ${response.statusText}`);
    }

    const data = await response.json();

    // Process all NFTs and extract Cert value and tokenId
    const nftsWithCert = data.ownedNfts.map(nft => {
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
        cert: certValue,
        name: nft.title,
        image: nft.media[0]?.gateway || nft.metadata?.image,
        allAttributes: nft.metadata?.attributes || []
      };
    });

    // Separate NFTs with and without Cert values
    const nftsWithCertValue = nftsWithCert.filter(nft => nft.cert !== null);
    const nftsWithoutCert = nftsWithCert.filter(nft => nft.cert === null);

    console.log(`Found ${nftsWithCertValue.length} NFTs with Cert values out of ${nftsWithCert.length} total`);

    res.status(200).json({
      success: true,
      totalNFTs: nftsWithCert.length,
      nftsWithCert: nftsWithCertValue.length,
      nftsWithoutCert: nftsWithoutCert.length,
      nfts: nftsWithCert,
      // Quick lookup arrays
      certValues: nftsWithCertValue.map(nft => ({
        tokenId: nft.tokenId,
        cert: nft.cert
      }))
    });

  } catch (err) {
    console.error('NFTs Cert API Error:', err);
    res.status(500).json({
      error: 'Failed to fetch NFTs',
      details: err?.message ?? String(err)
    });
  }
}
