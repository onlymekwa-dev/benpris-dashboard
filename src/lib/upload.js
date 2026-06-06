import * as XLSX from 'xlsx';
import { supabase } from './supabase';

// ── Helpers ────────────────────────────────────────────────────────────────
function num(v, fallback = 0) {
  if (v == null || v === '') return fallback;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? fallback : n;
}

function txt(v) {
  return v != null ? String(v).trim() : '';
}

function parseDate(raw) {
  if (!raw) return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === 'number') {
    try {
      const d = XLSX.SSF.parse_date_code(raw);
      return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
    } catch { return null; }
  }
  const s = String(raw).trim();
  // DD/MM/YYYY or DD/MM/YY
  const p = s.split('/');
  if (p.length === 3) {
    const [d, m, y] = p;
    const year = y.length === 2 ? '20' + y : y;
    return `${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  return null;
}

// Strip trailing spaces from all keys in a parsed row
function cleanRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const key = k != null ? String(k).trim() : k;
    out[key] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

function parseSheet(wb, name, skipRows = 0) {
  const ws = wb.Sheets[name];
  if (!ws) { console.warn('Sheet not found:', name); return []; }
  const raw = XLSX.utils.sheet_to_json(ws, { defval: '', range: skipRows });
  return raw.map(cleanRow);
}

// ── Main upload ─────────────────────────────────────────────────────────────
export async function uploadWorkbook(file, onProgress) {
  onProgress('Reading workbook…');

  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

  const sheets = {
    driver  : parseSheet(wb, 'Driver_Summary'),
    investor: parseSheet(wb, 'Investor_Summary'),
    dPay    : parseSheet(wb, 'Driver_Payments'),
    iPay    : parseSheet(wb, 'Investor_Payouts', 1), // skip merged header row
  };

  console.log('=== PARSED ROWS ===');
  console.log('Drivers:', sheets.driver.length, '| Sample:', JSON.stringify(sheets.driver[0]));
  console.log('Investors:', sheets.investor.length, '| Sample:', JSON.stringify(sheets.investor[0]));
  console.log('Driver payments:', sheets.dPay.length, '| Sample:', JSON.stringify(sheets.dPay[0]));
  console.log('Investor payouts:', sheets.iPay.length, '| Sample:', JSON.stringify(sheets.iPay[0]));

  // ── STEP 1: Full wipe — delete everything and start fresh ─────────────────
  onProgress('Clearing existing data…');

  // Delete in FK-safe order: child tables first
  const deleteSteps = [
    'driver_payments',
    'investor_payouts',
    'investor_inflows',
    'upload_history',
  ];

  for (const table of deleteSteps) {
    const { error } = await supabase
      .from(table)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) console.error(`Delete ${table} error:`, error.message);
  }

  // Delete drivers and vehicles (drivers reference vehicles)
  const { error: dErr } = await supabase.from('drivers')
    .delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (dErr) console.error('Delete drivers error:', dErr.message);

  const { error: vErr } = await supabase.from('vehicles')
    .delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (vErr) console.error('Delete vehicles error:', vErr.message);

  // Delete investors last (drivers reference investors)
  const { error: iErr } = await supabase.from('investors')
    .delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (iErr) console.error('Delete investors error:', iErr.message);

  // ── STEP 2: Insert investors ───────────────────────────────────────────────
  onProgress('Inserting investors…');

  const investorNameToId = {}; // normalized name → uuid

  for (const row of sheets.investor) {
    const name = txt(row['Full Name']);
    if (!name) continue;

    // Match profile by name — trim both sides
    const { data: prof } = await supabase
      .from('profiles')
      .select('id')
      .ilike('full_name', name) // case+space insensitive match
      .maybeSingle();

    const contractEnd = parseDate(row['End of Contract Date'] || row['End of Contract Date '] || null);

    const payload = {
      full_name       : name,
      id_number       : txt(row['ID'] || row['ID No.'] || ''),
      contact         : txt(row['Contact'] || ''),
      email           : txt(row['Email'] || row['email'] || ''),
      profile_id      : prof?.id || null,
      // Pre-computed values from Excel — trust these directly
      num_vehicles    : num(row['No. of Vehicles'] || 0),
      capital_invested: num(row['Capital Invested'] || 0),
      future_value    : num(row['Future Value'] || 0),
      weekly_payout   : num(row['Weekly Payout'] || row['Weekly Amount'] || 0),
      weeks_paid      : num(row['Weeks Paid'] || 0),
      total_paid_out  : num(row['Total Amount Paid'] || 0),
      balance         : num(row['Balance'] || row['Balance '] || 0),
      pct_paid        : num(row['Percentage'] || 0),
      contract_end    : contractEnd,
      status          : txt(row['Status'] || 'In Progress') || 'In Progress',
    };

    console.log('Inserting investor:', name, '| capital:', payload.capital_invested, '| paid:', payload.total_paid_out);

    const { data: inv, error: invErr } = await supabase
      .from('investors')
      .insert(payload)
      .select('id')
      .single();

    if (invErr) {
      console.error('Investor insert error:', name, invErr.message, invErr.details);
    } else {
      investorNameToId[name] = inv.id;
      console.log('Investor inserted:', name, inv.id);
    }
  }

  // ── STEP 3: Insert vehicles and drivers ───────────────────────────────────
  onProgress('Inserting drivers…');

  const driverNameToId = {};

  for (const row of sheets.driver) {
    const name = txt(row['Full Name']);
    if (!name) continue;

    const investorName = txt(row['Investor'] || row['Investor Assigned'] || '');
    // Try exact match first, then trimmed
    let investorId = investorNameToId[investorName] || null;
    if (!investorId) {
      // Try case-insensitive match
      const match = Object.entries(investorNameToId)
        .find(([k]) => k.toLowerCase() === investorName.toLowerCase());
      if (match) investorId = match[1];
    }

    const vehicleCost = num(row['Cost of Vehicle'] || row['Cost of Vehicle (GH₵)'] || 0);
    const makeModel   = txt(row['Vehicle (Make and Model)'] || row['Vehicle (Make and Model) '] || row['Vehicle (Make & Model)'] || '');
    const regNo       = txt(row['Vehicle Registration'] || row['Vehicle Registration '] || '');
    const weekly      = num(row['Weekly Amount'] || row['Weekly Amount (GH₵)'] || 0);
    const totalPaid   = num(row['Total Amount Paid'] || 0);
    const balance     = num(row['Balance'] || row['Balance '] || 0);
    const pct         = num(row['Percentage'] || 0);
    const status      = txt(row['Status'] || 'In Progress');

    // Insert vehicle
    let vehicleId = null;
    if (vehicleCost > 0) {
      const vPayload = {
        make_model  : makeModel || null,
        registration: regNo    || null,
        cost        : vehicleCost,
        investor_id : investorId,
      };
      const { data: veh, error: vehErr } = await supabase
        .from('vehicles')
        .insert(vPayload)
        .select('id')
        .single();
      if (vehErr) console.error('Vehicle insert error:', name, vehErr.message);
      else vehicleId = veh.id;
    }

    const { data: prof } = await supabase
      .from('profiles')
      .select('id')
      .ilike('full_name', name)
      .maybeSingle();

    const dPayload = {
      full_name     : name,
      contact       : txt(row['Contact'] || ''),
      email         : txt(row['email'] || row['Email'] || ''),
      driver_license: txt(row['Driver License'] || ''),
      investor_id   : investorId,
      vehicle_id    : vehicleId,
      weekly_amount : weekly,
      profile_id    : prof?.id || null,
      // Pre-computed from Excel
      total_paid    : totalPaid,
      balance       : balance,
      pct_paid      : pct,
      status        : status || 'In Progress',
    };

    console.log('Inserting driver:', name, '| investor:', investorName, '| investorId:', investorId, '| paid:', totalPaid);

    const { data: drv, error: drvErr } = await supabase
      .from('drivers')
      .insert(dPayload)
      .select('id')
      .single();

    if (drvErr) {
      console.error('Driver insert error:', name, drvErr.message, drvErr.details, drvErr.hint);
    } else {
      driverNameToId[name] = drv.id;
      console.log('Driver inserted:', name, drv.id);
    }
  }

  // ── STEP 4: Insert driver payments ────────────────────────────────────────
  onProgress('Inserting driver payments…');

  const dpRows = [];
  for (const row of sheets.dPay) {
    const name = txt(row['Name']);
    const amt  = num(row['Amt. Paid'] || row['Amt. Paid '] || 0);
    const date = parseDate(row['Date']);
    if (!name || !amt) continue;

    dpRows.push({
      driver_id      : driverNameToId[name] || null,
      driver_name    : name,
      payment_date   : date,
      amount         : amt,
      payment_channel: txt(row['Payment Channel'] || row['Payment Channel '] || ''),
      transaction_id : txt(row['Transaction ID'] || ''),
    });
  }

  if (dpRows.length) {
    const { error: dpErr } = await supabase.from('driver_payments').insert(dpRows);
    if (dpErr) console.error('Driver payments insert error:', dpErr.message);
    else console.log('Driver payments inserted:', dpRows.length);
  }

  // ── STEP 5: Insert investor inflows and payouts ───────────────────────────
  onProgress('Inserting investor transactions…');

  const inflowRows = [];
  const payoutRows = [];

  for (const row of sheets.iPay) {
    // Inflow side (cols A-E): Name, Date, Amt. Paid, Payment Channel, Transaction ID
    const iName = txt(row['Name'] || '');
    const iAmt  = num(row['Amt. Paid'] || row['Amt. Paid '] || 0);
    const iDate = parseDate(row['Date'] || null);

    if (iName && iAmt > 0) {
      // Match investor name with trimmed comparison
      let invId = investorNameToId[iName] || null;
      if (!invId) {
        const match = Object.entries(investorNameToId)
          .find(([k]) => k.toLowerCase() === iName.toLowerCase());
        if (match) invId = match[1];
      }
      inflowRows.push({
        investor_id    : invId,
        investor_name  : iName,
        investment_date: iDate,
        amount         : iAmt,
        payment_channel: txt(row['Payment Channel'] || row['Payment Channel '] || ''),
        transaction_id : txt(row['Transaction ID'] || ''),
      });
    }

    // Outflow side (cols I-M): duplicate headers come through as Name_1, Date_1 etc.
    // Check multiple possible key names
    const oName = txt(
      row['Name_1'] || row['Name__1'] || row['Name.1'] || ''
    );
    const oAmt = num(
      row['Amt. Paid_1'] || row['Amt. Paid __1'] || row['Amt. Paid .1'] ||
      row['Amt. Paid_1 '] || row['Amt. Paid  _1'] || 0
    );
    const oDate = parseDate(
      row['Date_1'] || row['Date__1'] || row['Date.1'] || null
    );

    if (oName && oAmt > 0) {
      let invId = investorNameToId[oName] || null;
      if (!invId) {
        const match = Object.entries(investorNameToId)
          .find(([k]) => k.toLowerCase() === oName.toLowerCase());
        if (match) invId = match[1];
      }
      payoutRows.push({
        investor_id    : invId,
        investor_name  : oName,
        payout_date    : oDate,
        amount         : oAmt,
        payment_channel: txt(row['Payment Channel_1'] || row['Payment Channel __1'] || ''),
        transaction_id : txt(row['Transaction ID_1'] || ''),
      });
    }
  }

  console.log('Inflow rows to insert:', inflowRows.length);
  console.log('Payout rows to insert:', payoutRows.length);
  console.log('Sample inflow:', JSON.stringify(inflowRows[0]));
  console.log('Sample payout:', JSON.stringify(payoutRows[0]));

  if (inflowRows.length) {
    const { error } = await supabase.from('investor_inflows').insert(inflowRows);
    if (error) console.error('Inflows insert error:', error.message);
  }
  if (payoutRows.length) {
    const { error } = await supabase.from('investor_payouts').insert(payoutRows);
    if (error) console.error('Payouts insert error:', error.message);
  }

  // ── STEP 6: Re-link profiles ──────────────────────────────────────────────
  onProgress('Linking user accounts…');

  // Link investors
  const { error: linkInvErr } = await supabase.rpc('link_profiles_to_investors');
  if (linkInvErr) {
    // Fallback: do it manually
    for (const [name, id] of Object.entries(investorNameToId)) {
      const { data: prof } = await supabase
        .from('profiles').select('id').ilike('full_name', name).maybeSingle();
      if (prof) {
        await supabase.from('investors').update({ profile_id: prof.id }).eq('id', id);
      }
    }
  }

  // Link drivers
  for (const [name, id] of Object.entries(driverNameToId)) {
    const { data: prof } = await supabase
      .from('profiles').select('id').ilike('full_name', name).maybeSingle();
    if (prof) {
      await supabase.from('drivers').update({ profile_id: prof.id }).eq('id', id);
    }
  }

  // ── STEP 7: Log upload ────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser();
  const uploadId = crypto.randomUUID();

  await supabase.from('upload_history').insert({
    id         : uploadId,
    uploaded_by: user?.id,
    filename   : file.name,
    uploaded_at: new Date().toISOString(),
    row_counts : {
      investors      : sheets.investor.length,
      drivers        : sheets.driver.length,
      driver_payments: dpRows.length,
      inflows        : inflowRows.length,
      payouts        : payoutRows.length,
    },
  });

  onProgress('Done!');

  return {
    investors      : sheets.investor.length,
    drivers        : sheets.driver.length,
    driver_payments: dpRows.length,
    inflows        : inflowRows.length,
    payouts        : payoutRows.length,
  };
}

// ── Post-upload: unlinked records ──────────────────────────────────────────
export async function getUnlinkedRecords() {
  const [{ data: drivers }, { data: investors }] = await Promise.all([
    supabase.from('drivers').select('id,full_name,email,contact').is('profile_id', null),
    supabase.from('investors').select('id,full_name,email,contact').is('profile_id', null),
  ]);
  return {
    drivers  : drivers   || [],
    investors: investors || [],
    total    : (drivers?.length || 0) + (investors?.length || 0),
  };
}
