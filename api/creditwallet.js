// api/creditwallet.js
import { createWalletClient, createPublicClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';
import { abi } from '../abi.js';

export default async function handler(req, res) {
  // --- CORS HEADERS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Secret-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST requests allowed' });

  try {
    // Check secret key first - EXACTLY like pauseops
    const SECRET_KEY = process.env.SECRET_KEY;
    const providedKey = req.headers['x-secret-key'] || req.body.secretKey;

    if (!SECRET_KEY) return res.status(500).json({ error: 'Server configuration error' });
    if (!providedKey) return res.status(401).json({ error: 'Secret key required' });
    if (providedKey !== SECRET_KEY) return res.status(403).json({ error: 'Invalid secret key' });

    const { recipient, amount } = req.body;

    const PRIVATE_KEY = process.env.PRIVATE_KEY;
    const ALCHEMY_KEY = process.env.ALCHEMY_KEY;

    if (!PRIVATE_KEY) return res.status(500).json({ error: 'Private key not configured' });
    if (!ALCHEMY_KEY) return res.status(500).json({ error: 'Alchemy key not configured' });

    // Validate recipient address
    if (!recipient) {
      return res.status(400).json({
        error: 'Recipient address is required',
        details: 'You must specify the wallet address to credit'
      });
    }

    // Validate recipient is a valid Ethereum address
    if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
      return res.status(400).json({
        error: 'Invalid recipient address',
        details: 'Recipient must be a valid Ethereum address (0x...)'
      });
    }

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({
        error: 'Invalid amount',
        details: 'Amount must be a positive number in ETH (e.g., 0.001, 1.5)'
      });
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

    const CONTRACT_ADDRESS = '0x345696D68D5D3e2bbF5307152aA6458286056F0f';

    // Convert ETH amount to wei
    const amountInWei = parseEther(amount.toString());

    // Check contract balance before attempting transfer
    const contractBalance = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi,
      functionName: 'getContractBalance'
    });

    if (contractBalance < amountInWei) {
      return res.status(400).json({
        error: 'Insufficient contract balance',
        details: `Contract has ${(Number(contractBalance) / 1e18).toFixed(6)} ETH, but ${amount} ETH requested`,
        contractBalance: (Number(contractBalance) / 1e18).toFixed(6),
        requestedAmount: amount
      });
    }

    // Verify the caller is the contract owner
    const contractOwner = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi,
      functionName: 'owner'
    });

    if (contractOwner.toLowerCase() !== account.address.toLowerCase()) {
      return res.status(403).json({
        error: 'Unauthorized',
        details: 'Only the contract owner can credit wallets'
      });
    }

    console.log(`Crediting ${amount} ETH to ${recipient}...`);

    // Execute creditWallet function
    const txHash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi,
      functionName: 'creditWallet',
      args: [recipient, amountInWei],
      gas: 100000n,
      gasPrice: await publicClient.getGasPrice()
    });

    // Wait for transaction receipt
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    // Check if transaction was successful
    if (receipt.status !== 'success') {
      return res.status(500).json({
        error: 'Transaction failed',
        txHash,
        details: 'The transaction was mined but failed during execution'
      });
    }

    res.status(200).json({
      success: true,
      txHash,
      recipient,
      amount: amount,
      amountInWei: amountInWei.toString(),
      message: `Successfully credited ${amount} ETH to ${recipient}`,
      explorerUrl: `https://sepolia.arbiscan.io/tx/${txHash}`
    });

  } catch (err) {
    console.error('CreditWallet API Error:', err);

    // Handle specific contract errors
    if (err?.message?.includes('Only owner can call this function')) {
      return res.status(403).json({
        error: 'Unauthorized',
        details: 'Only the contract owner can credit wallets'
      });
    }

    if (err?.message?.includes('Cannot send to zero address')) {
      return res.status(400).json({
        error: 'Invalid recipient address',
        details: 'Cannot send ETH to zero address'
      });
    }

    if (err?.message?.includes('Insufficient contract balance')) {
      return res.status(400).json({
        error: 'Insufficient contract balance',
        details: 'Contract does not have enough ETH for this transfer'
      });
    }

    if (err?.message?.includes('Amount must be greater than zero')) {
      return res.status(400).json({
        error: 'Invalid amount',
        details: 'Amount must be greater than zero'
      });
    }

    res.status(500).json({
      error: 'Failed to credit wallet',
      details: err?.message ?? String(err)
    });
  }
}
