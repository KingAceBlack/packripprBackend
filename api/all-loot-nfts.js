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

    const OWNER_ADDRESS = '0x712779cbdd3290437f84163fb3d9a06c338768ad';
    const LOOT_CONTRACT = '0xff9c1b15b16263c61d017ee9f65c50e4ae0113d7';
    const RPC_URL = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;

    // Step 1: Get all token IDs owned by the address
    const alchemyUrl = `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}/getNFTsForOwner?owner=${OWNER_ADDRESS}&contractAddresses[]=${LOOT_CONTRACT}&withMetadata=false`;

    const response = await fetch(alchemyUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Alchemy API failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const tokenIds = (data.ownedNfts || []).map(nft => nft.tokenId);

    // Step 2: Fetch gear attributes for each token from the Loot contract
    // Loot contract has these view functions: getWeapon, getChest, getHead, getWaist, getFoot, getHand, getNeck, getRing
    const gearFunctions = [
      { name: 'Weapon', selector: '0x169e5c20' },   // getWeapon(uint256)
      { name: 'Chest', selector: '0x4c2a7c25' },    // getChest(uint256)
      { name: 'Head', selector: '0xae756451' },     // getHead(uint256)
      { name: 'Waist', selector: '0xd5cb2a59' },    // getWaist(uint256)
      { name: 'Foot', selector: '0xa6df38a4' },     // getFoot(uint256)
      { name: 'Hand', selector: '0xd8ae4e7d' },     // getHand(uint256)
      { name: 'Neck', selector: '0x067ca633' },     // getNeck(uint256)
      { name: 'Ring', selector: '0x867dafb7' }      // getRing(uint256)
    ];

    // Helper to encode token ID as uint256
    const encodeTokenId = (tokenId) => {
      return BigInt(tokenId).toString(16).padStart(64, '0');
    };

    // Helper to decode string from ABI-encoded response
    const decodeString = (hexData) => {
      if (!hexData || hexData === '0x') return '';
      // Remove 0x prefix
      const data = hexData.slice(2);
      // String offset is at position 0 (32 bytes)
      // String length is at position 64 (32 bytes)
      const lengthHex = data.slice(64, 128);
      const length = parseInt(lengthHex, 16);
      // String data starts at position 128
      const stringHex = data.slice(128, 128 + length * 2);
      // Convert hex to string
      let str = '';
      for (let i = 0; i < stringHex.length; i += 2) {
        str += String.fromCharCode(parseInt(stringHex.slice(i, i + 2), 16));
      }
      return str;
    };

    // Fetch gear for all tokens
    const nfts = await Promise.all(
      tokenIds.map(async (tokenId) => {
        const gear = {};

        // Batch all gear calls for this token
        const gearPromises = gearFunctions.map(async ({ name, selector }) => {
          const callData = selector + encodeTokenId(tokenId);
          
          const rpcResponse = await fetch(RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_call',
              params: [
                {
                  to: LOOT_CONTRACT,
                  data: callData
                },
                'latest'
              ],
              id: 1
            })
          });

          const rpcData = await rpcResponse.json();
          return { name, value: decodeString(rpcData.result) };
        });

        const gearResults = await Promise.all(gearPromises);
        gearResults.forEach(({ name, value }) => {
          gear[name] = value;
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
