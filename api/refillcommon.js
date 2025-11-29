// api/refillcommon.js
import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';
import { abi } from '../abi.js';

// Helper function to convert BigInt to string for JSON serialization
function bigIntToString(obj) {
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'bigint') {
    return obj.toString();
  }
  
  if (Array.isArray(obj)) {
    return obj.map(bigIntToString);
  }
  
  if (typeof obj === 'object') {
    const newObj = {};
    for (const [key, value] of Object.entries(obj)) {
      newObj[key] = bigIntToString(value);
    }
    return newObj;
  }
  
  return obj;
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Secret-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST requests allowed' });

  try {
    // Secret key check
    const SECRET_KEY = process.env.SECRET_KEY;
    const providedKey = req.headers['x-secret-key'] || req.body.secretKey;
    if (!SECRET_KEY || !providedKey || providedKey !== SECRET_KEY) {
      return res.status(403).json({ error: 'Invalid secret key' });
    }

    // Validate tokenId parameter
    const { tokenId } = req.body;
    if (!tokenId && tokenId !== 0) {
      return res.status(400).json({ 
        error: 'Missing required parameter: tokenId',
        details: 'Please provide a tokenId in the request body'
      });
    }

    // Validate tokenId is a valid number
    const tokenIdNum = Number(tokenId);
    if (!Number.isInteger(tokenIdNum) || tokenIdNum < 0) {
      return res.status(400).json({ 
        error: 'Invalid tokenId',
        details: 'tokenId must be a non-negative integer'
      });
    }

    const PRIVATE_KEY = process.env.PRIVATE_KEY;
    const ALCHEMY_KEY = process.env.ALCHEMY_KEY;
    if (!PRIVATE_KEY || !ALCHEMY_KEY) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const account = privateKeyToAccount(`0x${PRIVATE_KEY}`);
    const publicClient = createPublicClient({
      chain: arbitrumSepolia,
      transport: http(`https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`)
    });

    const walletClient = createWalletClient({
      account,
      chain: arbitrumSepolia,
      transport: http(`https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`)
    });

    const CONTRACT_ADDRESS = '0xA3D7FB8BA2cD9605D0599BD23F1486725A5f7a68';
    const NFT_CONTRACT = '0xEed0161329830F14d85D28c9803eeF4a02016c14';
    const RECIPIENT_ADDRESS = '0x345696D68D5D3e2bbF5307152aA6458286056F0f';
    const TOKEN_ID = tokenIdNum;

    console.log(`\n=== Refill Common - Token ${TOKEN_ID} ===`);
    console.log(`Contract: ${CONTRACT_ADDRESS}`);
    console.log(`Recipient: ${RECIPIENT_ADDRESS}`);
    console.log(`Account executing: ${account.address}`);

    // Step 1: Check contract owner
    const contractOwner = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi,
      functionName: 'owner'
    });
    console.log(`Contract owner: ${contractOwner}`);
    console.log(`Is caller owner? ${contractOwner.toLowerCase() === account.address.toLowerCase()}`);

    if (contractOwner.toLowerCase() !== account.address.toLowerCase()) {
      return res.status(403).json({
        error: 'Caller is not contract owner',
        contractOwner,
        callerAddress: account.address,
        details: 'Only the contract owner can call emergencyRecoverNFT'
      });
    }

    // Step 2: Verify the contract holds the token
    const holdsToken = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi,
      functionName: 'holdsToken',
      args: [BigInt(TOKEN_ID)]
    });
    console.log(`Contract holdsToken(${TOKEN_ID}): ${holdsToken}`);

    if (!holdsToken) {
      const heldTokenIds = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi,
        functionName: 'getHeldTokenIds'
      });

      return res.status(400).json(bigIntToString({
        error: 'Contract does not hold the specified token',
        tokenId: TOKEN_ID,
        availableTokens: heldTokenIds,
        details: `Token ID ${TOKEN_ID} is not tracked by the contract. Available tokens: ${heldTokenIds.join(', ')}`
      }));
    }

    // Step 3: Verify NFT contract ownership
    let tokenOwner;
    try {
      tokenOwner = await publicClient.readContract({
        address: NFT_CONTRACT,
        abi: [
          {
            "inputs": [{"name": "tokenId", "type": "uint256"}],
            "name": "ownerOf",
            "outputs": [{"name": "", "type": "address"}],
            "stateMutability": "view",
            "type": "function"
          }
        ],
        functionName: 'ownerOf',
        args: [BigInt(TOKEN_ID)]
      });
      console.log(`NFT ownerOf(${TOKEN_ID}): ${tokenOwner}`);
    } catch (err) {
      return res.status(400).json({
        error: 'Token does not exist in NFT contract',
        tokenId: TOKEN_ID,
        nftContract: NFT_CONTRACT,
        details: err.message
      });
    }

    if (tokenOwner.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()) {
      return res.status(400).json({
        error: 'NFT ownership mismatch',
        tokenId: TOKEN_ID,
        currentOwner: tokenOwner,
        expectedOwner: CONTRACT_ADDRESS,
        details: `Token ${TOKEN_ID} is owned by ${tokenOwner}, not the refill contract`
      });
    }

    // Step 4: Simulate the transaction first
    console.log('\n=== Simulating transaction ===');
    try {
      await publicClient.simulateContract({
        address: CONTRACT_ADDRESS,
        abi,
        functionName: 'emergencyRecoverNFT',
        args: [BigInt(TOKEN_ID), RECIPIENT_ADDRESS],
        account: account.address,
      });
      console.log('✓ Simulation successful');
    } catch (simError) {
      console.error('✗ Simulation failed:', simError.message);
      
      // Extract revert reason if available
      let revertReason = 'Unknown reason';
      if (simError.message.includes('Only owner can call this function')) {
        revertReason = 'Only owner can call this function';
      } else if (simError.message.includes('Contract does not hold token')) {
        revertReason = 'Contract does not hold token';
      }
      
      return res.status(400).json({
        error: 'Transaction simulation failed',
        revertReason,
        tokenId: TOKEN_ID,
        diagnostics: {
          contractOwner,
          callerAddress: account.address,
          isCallerOwner: contractOwner.toLowerCase() === account.address.toLowerCase(),
          holdsToken,
          nftOwner: tokenOwner,
          isNftInContract: tokenOwner.toLowerCase() === CONTRACT_ADDRESS.toLowerCase()
        },
        details: simError.message
      });
    }

    // Step 5: Execute the withdrawal
    console.log('\n=== Executing transaction ===');
    
    // Estimate gas first
    const gasEstimate = await publicClient.estimateContractGas({
      address: CONTRACT_ADDRESS,
      abi,
      functionName: 'emergencyRecoverNFT',
      args: [BigInt(TOKEN_ID), RECIPIENT_ADDRESS],
      account: account.address,
    });
    
    // Add 50% buffer to gas estimate
    const gasLimit = (gasEstimate * 150n) / 100n;
    console.log(`Gas estimate: ${gasEstimate}`);
    console.log(`Gas limit (with 50% buffer): ${gasLimit}`);
    
    const txHash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi,
      functionName: 'emergencyRecoverNFT',
      args: [BigInt(TOKEN_ID), RECIPIENT_ADDRESS],
      gas: gasLimit,
    });

    console.log(`Transaction sent: ${txHash}`);

    // Wait for transaction receipt
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`Transaction status: ${receipt.status}`);

    if (receipt.status === 'success') {
      // Verify the token was transferred
      const newOwner = await publicClient.readContract({
        address: NFT_CONTRACT,
        abi: [
          {
            "inputs": [{"name": "tokenId", "type": "uint256"}],
            "name": "ownerOf",
            "outputs": [{"name": "", "type": "address"}],
            "stateMutability": "view",
            "type": "function"
          }
        ],
        functionName: 'ownerOf',
        args: [BigInt(TOKEN_ID)]
      });

      const result = bigIntToString({
        success: true,
        message: `Successfully transferred token ${TOKEN_ID} to common pool`,
        tokenId: TOKEN_ID,
        recipient: RECIPIENT_ADDRESS,
        txHash: txHash,
        explorerUrl: `https://sepolia.arbiscan.io/tx/${txHash}`,
        newOwner: newOwner,
        verified: newOwner.toLowerCase() === RECIPIENT_ADDRESS.toLowerCase(),
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed
      });

      console.log('✓ Refill successful');
      res.status(200).json(result);
    } else {
      console.log('✗ Transaction reverted');
      res.status(500).json({
        success: false,
        error: 'Transaction failed',
        tokenId: TOKEN_ID,
        txHash: txHash,
        explorerUrl: `https://sepolia.arbiscan.io/tx/${txHash}`,
        details: 'Transaction reverted on-chain. Check explorer for revert reason.'
      });
    }

  } catch (err) {
    console.error('Refill Common API Error:', err);

    // Parse common error messages
    let errorDetails = {
      error: 'Failed to refill common pool',
      details: err?.message ?? String(err)
    };

    if (err?.message?.includes('Contract does not hold token')) {
      errorDetails.error = 'Contract does not hold the specified token';
    } else if (err?.message?.includes('Only owner can call this function')) {
      errorDetails.error = 'Unauthorized: Only contract owner can refill';
    } else if (err?.message?.includes('ownerOf') || err?.message?.includes('nonexistent token')) {
      errorDetails.error = 'Token does not exist in NFT contract';
    }

    res.status(500).json(bigIntToString(errorDetails));
  }
}
