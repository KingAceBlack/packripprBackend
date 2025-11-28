// api/pacman.js
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
      id, sku, grader, grade, cert, description, image_url, 
      fair_value_usd, acquisition_cost_usd, storage_location, 
      vault_ref, status 
    } = body;

    const SUPABASE_URL = process.env.PACKRIPPR_SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.PACKRIPPR_SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return res.status(500).json({ error: 'Supabase configuration missing' });
    }

    if (req.method === 'POST') {
      console.log('Creating inventory item with data:', body);
      
      // Validate required fields
      if (!sku || !grader || !grade) {
        return res.status(400).json({ 
          error: 'Required fields missing',
          details: 'sku, grader, and grade are required'
        });
      }

      const createData = {
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

      const response = await fetch(`${SUPABASE_URL}/rest/v1/inventory_items`, {
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
        data: data[0]
      });

    } else if (req.method === 'GET') {
      // GET inventory items with filtering
      const { id, sku, grader, grade, status, cert, vault_ref } = req.query;
      
      let url = `${SUPABASE_URL}/rest/v1/inventory_items?select=*`;
      
      // Add filters if provided
      if (id) url += `&id=eq.${id}`;
      if (sku) url += `&sku=eq.${sku}`;
      if (grader) url += `&grader=eq.${grader}`;
      if (grade) url += `&grade=eq.${grade}`;
      if (status) url += `&status=eq.${status}`;
      if (cert) url += `&cert=eq.${cert}`;
      if (vault_ref) url += `&vault_ref=eq.${vault_ref}`;
      
      // Order by creation date
      url += '&order=created_at.desc';

      console.log('Fetching inventory from:', url);

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
        data: data,
        count: data.length
      });

    } else if (req.method === 'PUT') {
      // UPDATE inventory item by ID
      if (!id) {
        return res.status(400).json({ error: 'id is required for update' });
      }

      const updateData = {};
      
      // Only include provided fields
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

      console.log('Updating inventory item:', id, 'with data:', updateData);

      const response = await fetch(`${SUPABASE_URL}/rest/v1/inventory_items?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
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
        return res.status(404).json({ error: `Inventory item not found with id: ${id}` });
      }

      return res.status(200).json({
        success: true,
        action: 'updated',
        data: data[0]
      });

    } else if (req.method === 'DELETE') {
      // DELETE inventory item by ID
      if (!id) {
        return res.status(400).json({ error: 'id is required for deletion' });
      }

      console.log('Deleting inventory item:', id);

      const response = await fetch(`${SUPABASE_URL}/rest/v1/inventory_items?id=eq.${id}`, {
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
        deleted_count: data.length
      });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (err) {
    console.error('Pacman API Error:', err);
    
    res.status(500).json({
      error: 'Inventory operation failed',
      details: err?.message || String(err)
    });
  }
}