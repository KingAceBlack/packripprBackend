// api/pacman.js - Now handles both inventory_items and nfts
export default async function handler(req, res) {
  // --- CORS HEADERS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, PUT, GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Debug logging
  console.log('Method:', req.method);
  console.log('Query:', req.query);

  try {
    // Parse JSON body if it exists
    let body = {};
    if (req.body && typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else if (req.body && typeof req.body === 'object') {
      body = req.body;
    }
    
    console.log('Parsed body:', body);

    const { 
      // Inventory fields
      id, sku, grader, grade, cert, description, image_url, 
      fair_value_usd, acquisition_cost_usd, storage_location, 
      vault_ref, status,
      // NFT fields
      token_id, inventory_item_id, user_id, rarity, metadata_url
    } = body;

    const SUPABASE_URL = process.env.PACKRIPPR_SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.PACKRIPPR_SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return res.status(500).json({ error: 'Supabase configuration missing' });
    }

    // Determine which table to operate on
    const targetTable = req.query.table || 'inventory_items';

    if (!['inventory_items', 'nfts'].includes(targetTable)) {
      return res.status(400).json({ 
        error: 'Invalid table specified',
        details: 'Table must be either "inventory_items" or "nfts"'
      });
    }

    if (req.method === 'POST') {
      console.log(`Creating ${targetTable} with data:`, body);
      
      let createData = {};
      
      if (targetTable === 'inventory_items') {
        // Validate required fields for inventory
        if (!sku || !grader || !grade) {
          return res.status(400).json({ 
            error: 'Required fields missing',
            details: 'sku, grader, and grade are required for inventory items'
          });
        }

        createData = {
          sku: sku,
          grader: grader,
          grade: grade,
          cert: cert || null,
          description: description || null,
          image_url: image_url || null,
          fair_value_usd: fair_value_usd || 0.000000,
          acquisition_cost_usd: acquisition_cost_usd || 0.000000,
          storage_location: storage_location || null,
          vault_ref: vault_ref || null,
          status: status || 'in_pool'
        };
      } else if (targetTable === 'nfts') {
        // Validate required fields for NFTs
        if (!token_id) {
          return res.status(400).json({ 
            error: 'Required fields missing',
            details: 'token_id is required for NFTs'
          });
        }

        createData = {
          token_id: token_id,
          inventory_item_id: inventory_item_id || null,
          user_id: user_id || null,
          rarity: rarity || null,
          metadata_url: metadata_url || null,
          image_url: image_url || null
        };
      }

      const response = await fetch(`${SUPABASE_URL}/rest/v1/${targetTable}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(createData)
      });

      console.log('Supabase response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log('Supabase error response:', errorText);
        throw new Error(`Supabase error: ${errorText}`);
      }

      const data = await response.json();

      return res.status(200).json({
        success: true,
        action: 'created',
        table: targetTable,
        data: data[0]
      });

    } else if (req.method === 'GET') {
      // GET data from specified table
      const { id, sku, grader, grade, status, cert, vault_ref, token_id, user_id, rarity } = req.query;
      
      let url = `${SUPABASE_URL}/rest/v1/${targetTable}?select=*`;
      
      // Add filters based on table
      if (id) url += `&id=eq.${id}`;
      
      if (targetTable === 'inventory_items') {
        if (sku) url += `&sku=eq.${sku}`;
        if (grader) url += `&grader=eq.${grader}`;
        if (grade) url += `&grade=eq.${grade}`;
        if (status) url += `&status=eq.${status}`;
        if (cert) url += `&cert=eq.${cert}`;
        if (vault_ref) url += `&vault_ref=eq.${vault_ref}`;
        url += '&order=created_at.desc';
      } else if (targetTable === 'nfts') {
        if (token_id) url += `&token_id=eq.${token_id}`;
        if (user_id) url += `&user_id=eq.${user_id}`;
        if (rarity) url += `&rarity=eq.${rarity}`;
        if (inventory_item_id) url += `&inventory_item_id=eq.${inventory_item_id}`;
        url += '&order=created_at.desc';
      }

      console.log('Fetching from:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Supabase error: ${errorText}`);
      }

      const data = await response.json();
      
      return res.status(200).json({
        success: true,
        table: targetTable,
        data: data,
        count: data.length
      });

    } else if (req.method === 'PUT') {
      // UPDATE data in specified table
      if (!id) {
        return res.status(400).json({ error: 'id is required for update' });
      }

      const updateData = {};
      
      if (targetTable === 'inventory_items') {
        // Only include provided fields for inventory
        if (sku !== undefined) updateData.sku = sku;
        if (grader !== undefined) updateData.grader = grader;
        if (grade !== undefined) updateData.grade = grade;
        if (cert !== undefined) updateData.cert = cert;
        if (description !== undefined) updateData.description = description;
        if (image_url !== undefined) updateData.image_url = image_url;
        if (fair_value_usd !== undefined) updateData.fair_value_usd = fair_value_usd;
        if (acquisition_cost_usd !== undefined) updateData.acquisition_cost_usd = acquisition_cost_usd;
        if (storage_location !== undefined) updateData.storage_location = storage_location;
        if (vault_ref !== undefined) updateData.vault_ref = vault_ref;
        if (status !== undefined) updateData.status = status;
      } else if (targetTable === 'nfts') {
        // Only include provided fields for NFTs
        if (token_id !== undefined) updateData.token_id = token_id;
        if (inventory_item_id !== undefined) updateData.inventory_item_id = inventory_item_id;
        if (user_id !== undefined) updateData.user_id = user_id;
        if (rarity !== undefined) updateData.rarity = rarity;
        if (metadata_url !== undefined) updateData.metadata_url = metadata_url;
        if (image_url !== undefined) updateData.image_url = image_url;
      }

      console.log(`Updating ${targetTable}:`, id, 'with data:', updateData);

      const response = await fetch(`${SUPABASE_URL}/rest/v1/${targetTable}?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type: 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Supabase error: ${errorText}`);
      }

      const data = await response.json();

      if (data.length === 0) {
        return res.status(404).json({ error: `${targetTable} not found with id: ${id}` });
      }

      return res.status(200).json({
        success: true,
        action: 'updated',
        table: targetTable,
        data: data[0]
      });

    } else if (req.method === 'DELETE') {
      // DELETE from specified table
      if (!id) {
        return res.status(400).json({ error: 'id is required for deletion' });
      }

      console.log(`Deleting from ${targetTable}:`, id);

      const response = await fetch(`${SUPABASE_URL}/rest/v1/${targetTable}?id=eq.${id}`, {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'return=representation'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Supabase error: ${errorText}`);
      }

      const data = await response.json();

      return res.status(200).json({
        success: true,
        action: 'deleted',
        table: targetTable,
        deleted_count: data.length
      });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (err) {
    console.error('Pacman API Error:', err);
    
    res.status(500).json({
      error: 'Operation failed',
      details: err?.message || String(err)
    });
  }
}
