// api/purchaseSignature.js
import { privateKeyToAccount } from 'viem/accounts';
import { keccak256, encodePacked } from 'viem';

export default async function handler(req, res) {
  // --- CORS HEADERS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST requests allowed' });

  try {
    const { userAddress, nonce } = req.body;
    
    // Validate inputs
    if (!userAddress) {
      return res.status(400).json({ error: 'userAddress is required' });
    }
    
    if (!nonce) {
      return res.status(400).json({ error: 'nonce is required' });
    }

    const PRIVATE_KEY = process.env.PRIVATE_KEY;
    
    if (!PRIVATE_KEY) {
      return res.status(500).json({ error: 'Server configuration error: Private key not set' });
    }

    // Create account from private key
    const account = privateKeyToAccount(`0x${PRIVATE_KEY}`);

    // Generate message hash for purchase (matches contract's getPurchaseMessageHash function)
    // getPurchaseMessageHash(address user, uint nonce)
    const messageHash = keccak256(
      encodePacked(
        ['address', 'uint256'], 
        [userAddress, BigInt(nonce)]
      )
    );

    // Sign the message hash
    const signature = await account.signMessage({ 
      message: { raw: messageHash } 
    });

    console.log(`Purchase signature generated for user: ${userAddress}, nonce: ${nonce}`);

    res.status(200).json({
      success: true,
      signature,
      nonce,
      userAddress,
      message: 'Purchase signature generated successfully'
    });

  } catch (err) {
    console.error('Purchase Signature API Error:', err);
    res.status(500).json({
      error: 'Failed to generate purchase signature',
      details: err?.message ?? String(err)
    });
  }
}