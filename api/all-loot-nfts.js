// api/all-loot-nfts.js

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

    // Owner address to check
    const OWNER_ADDRESS = '0x712779cbdd3290437f84163fb3d9a06c338768ad';
    
    // Loot NFT contract on Ethereum mainnet
    const LOOT_CONTRACT = '0xff9c1b15b16263c61d017ee9f65c50e4ae0113d7';

    // Use Alchemy's getNFTsForOwner endpoint (Ethereum mainnet)
    const alchemyUrl = `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}/getNFTsForOwner?owner=${OWNER_ADDRESS}&contractAddresses[]=${LOOT_CONTRACT}&withMetadata=true`;

    const response = await fetch(alchemyUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Alchemy API failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    const nfts = (data.ownedNfts || []).map(nft => {
      // Handle token ID (v3 API uses tokenId directly)
      const tokenId = nft.tokenId || BigInt(nft.id?.tokenId || '0').toString();

      // Extract attributes from metadata
      const attributes = nft.raw?.metadata?.attributes || nft.metadata?.attributes || [];

      // Loot NFTs have unique item-based attributes
      // Extract all the gear pieces
      const gear = {};
      attributes.forEach(attr => {
        if (attr.trait_type && attr.value) {
          gear[attr.trait_type] = attr.value;
        }
      });

      return {
        tokenId,
        name: nft.name || nft.title || `Loot Bag #${tokenId}`,
        description: nft.description || nft.raw?.metadata?.description || '',
        image: nft.image?.cachedUrl || nft.image?.originalUrl || nft.raw?.metadata?.image || '',
        attributes,
        gear
      };
    });

    console.log(`Found ${nfts.length} Loot NFTs for address ${OWNER_ADDRESS}`);

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