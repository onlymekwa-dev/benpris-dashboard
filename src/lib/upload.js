import * as XLSX from 'xlsx';
import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function num(v, fallback = 0) {
  if (v == null || v === '') return fallback;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? fallback : n;
}

function txt(v) {
  return v != null ? String(v).trim() : '';
}

// Parse date — handles JS Date objects, ISO strings, DD/MM/YYYY and DD/MM/YY text
function parseDate(raw) {
  if (!raw || raw === '') return null;
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null;
    return raw.toISOString().slice(0, 10);
  }
  if (typeof raw === 'string') {
    // ISO format from cellDates
    if (raw.includes('T')) return raw.slice(0, 10);
    // DD/MM/YYYY or DD/MM/YY
    if (raw.includes('/')) {
      const p = raw.trim().split('/');
      if (p.length === 3) {
        const [d, m, y] = p;
        const year = y.length === 2 ? '20' + y : y;
        const iso = `${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
        if (!isNaN(Date.parse(iso))) return iso;
      }
    }
  }
  if (typeof raw === 'number') {
    try {
      const d = XLSX.SSF.parse_date_code(raw);
      return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
    } catch { return null; }
  }
  return null;
}

// Strip trailing/leading spaces from ALL keys AND preserve date objects as-is
// (do NOT convert dates to strings — parseDate handles them)
function cleanRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const key = k != null ? String(k).trim() : k;
    // Preserve Date objects — don't stringify them
    out[key] = (v instanceof Date) ? v : (typeof v === 'string' ? v.trim() : v);
  }
  return out;
}

// Parse sheet with correct range and clean all rows
// NOTE: after cleanRow, ALL keys have trailing spaces stripped.
// So 'Balance ' → 'Balance', 'Amt. Paid ' → 'Amt. Paid', etc.
function parseSheet(wb, name, skipRows = 0) {
  const ws = wb.Sheets[name];
  if (!ws) { console.warn('Sheet not found:', name); return []; }
  const raw = XLSX.utils.sheet_to_json(ws, { defval: null, range: skipRows });
  return raw.map(cleanRow);
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFINITIVE KEY MAP — confirmed by reading actual Excel file
// After cleanRow strips trailing spaces:
//
// Investor_Summary headers (stripped):
//   Full Name, Contact, Email, ID, No. of Vehicles, Capital Invested,
//   Future Value, Weekly Payout, Weeks Paid, Total Amount Paid,
//   Balance, Percentage, No. of Weeks to fully pay, End of Contract Date, Status
//
// Driver_Summary headers (stripped):
//   Full Name, Contact, email, Driver License, Vehicle (Make and Model),
//   Vehicle Registration, Investor, Cost of Vehicle, Weekly Amount,
//   Weeks Paid, Total Amount Paid, Balance, Percentage, Status
//
// Driver_Payments headers (stripped):
//   Name, Date, Amt. Paid, Payment Channel, Transaction ID
//
// Investor_Payouts row 2 headers (stripped, after range:1):
//   Inflow:  Name, Date, Amt. Paid, Payment Channel, Transaction ID
//   Outflow: Name_1, Date_1, Amt. Paid_1, Payment Channel_1, Transaction ID_1
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadWorkbook(file, onProgress) {
  onProgress('Reading workbook…');

  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

  const driverRows   = parseSheet(wb, 'Driver_Summary',   0);
  const investorRows = parseSheet(wb, 'Investor_Summary', 0);
  const dPayRows     = parseSheet(wb, 'Driver_Payments',  0);
  // Investor_Payouts: row 0 = merged "Inflow/Outflow", row 1 = real headers → skip 1 row
  const iPayRows     = parseSheet(wb, 'Investor_Payouts', 1);

  console.log('=== PARSED COUNTS ===');
  console.log('Investors:', investorRows.length);
  console.log('Drivers:', driverRows.length);
  console.log('Driver payments:', dPayRows.length);
  console.log('Investor payout rows:', iPayRows.length);
  console.log('=== SAMPLE KEYS ===');
  console.log('Investor[0] keys:', Object.keys(investorRows[0] || {}));
  console.log('Driver[0] keys:', Object.keys(driverRows[0] || {}));
  console.log('dPay[0] keys:', Object.keys(dPayRows[0] || {}));
  console.log('iPay[0] keys:', Object.keys(iPayRows[0] || {}));
  console.log('=== SAMPLE VALUES ===');
  console.log('Investor[0]:', JSON.stringify(investorRows[0]));
  console.log('Driver[0]:', JSON.stringify(driverRows[0]));
  console.log('dPay[0]:', JSON.stringify(dPayRows[0]));
  console.log('iPay[0]:', JSON.stringify(iPayRows[0]));

  // ── STEP 1: Full wipe in FK-safe order ────────────────────────────────────
  onProgress('Wiping existing data…');

  for (const table of [
    'driver_payments',
    'investor_payouts',
    'investor_inflows',
    'upload_history',
    'drivers',
    'vehicles',
    'investors',
  ]) {
    const { error } = await supabase
      .from(table)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) console.error(`Wipe ${table}:`, error.message);
    else console.log(`Wiped ${table}`);
  }

  // ── STEP 2: Insert investors ──────────────────────────────────────────────
  onProgress('Inserting investors…');

  const investorNameToId = {};

  for (const row of investorRows) {
    const name = txt(row['Full Name']);
    if (!name) continue;

    // Link to existing profile
    const { data: prof } = await supabase
      .from('profiles')
      .select('id')
      .ilike('full_name', name)
      .maybeSingle();

    // Contract end date — stored as datetime in Excel
    const contractEnd = parseDate(row['End of Contract Date']);

    const payload = {
      full_name       : name,
      id_number       : txt(row['ID'] || ''),
      contact         : txt(row['Contact'] || ''),
      email           : txt(row['Email'] || ''),
      profile_id      : prof?.id || null,
      // ── ALL KEYS USE STRIPPED NAMES (no trailing spaces) ──
      num_vehicles    : num(row['No. of Vehicles']),
      capital_invested: num(row['Capital Invested']),
      future_value    : num(row['Future Value']),
      weekly_payout   : num(row['Weekly Payout']),
      weeks_paid      : num(row['Weeks Paid']),
      total_paid_out  : num(row['Total Amount Paid']),
      balance         : num(row['Balance']),           // ← stripped: no trailing space
      pct_paid        : num(row['Percentage']),
      contract_end    : contractEnd,
      status          : txt(row['Status']) || 'In Progress',
    };

    console.log(`Investor: ${name} | capital=${payload.capital_invested} | paid=${payload.total_paid_out} | balance=${payload.balance}`);

    const { data: inv, error } = await supabase
      .from('investors')
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      console.error('Investor insert FAILED:', name, error.message, error.details);
    } else {
      investorNameToId[name] = inv.id;
      console.log('Investor OK:', name, inv.id);
    }
  }

  // ── STEP 3: Insert vehicles + drivers ─────────────────────────────────────
  onProgress('Inserting drivers…');

  const driverNameToId = {};

  for (const row of driverRows) {
    const name = txt(row['Full Name']);
    if (!name) continue;

    const investorName = txt(row['Investor'] || '');

    // Exact match first, then case-insensitive
    let investorId = investorNameToId[investorName];
    if (!investorId && investorName) {
      const found = Object.entries(investorNameToId)
        .find(([k]) => k.toLowerCase() === investorName.toLowerCase());
      if (found) investorId = found[1];
    }

    // ── ALL KEYS STRIPPED ──
    const cost      = num(row['Cost of Vehicle']);
    const makeModel = txt(row['Vehicle (Make and Model)']);  // ← stripped
    const regNo     = txt(row['Vehicle Registration']);       // ← stripped
    const weekly    = num(row['Weekly Amount']);
    const totalPaid = num(row['Total Amount Paid']);
    const balance   = num(row['Balance']);                    // ← stripped
    const pct       = num(row['Percentage']);
    const status    = txt(row['Status']) || 'In Progress';

    // Insert vehicle
    let vehicleId = null;
    if (cost > 0) {
      const { data: veh, error: vErr } = await supabase
        .from('vehicles')
        .insert({
          make_model  : makeModel || null,
          registration: regNo    || null,
          cost,
          investor_id : investorId || null,
        })
        .select('id')
        .single();
      if (vErr) console.error('Vehicle insert FAILED:', name, vErr.message);
      else vehicleId = veh.id;
    }

    // Link to profile
    const { data: prof } = await supabase
      .from('profiles')
      .select('id')
      .ilike('full_name', name)
      .maybeSingle();

    const { data: drv, error: dErr } = await supabase
      .from('drivers')
      .insert({
        full_name     : name,
        contact       : txt(row['Contact'] || ''),
        email         : txt(row['email']   || ''),
        driver_license: txt(row['Driver License'] || ''),
        investor_id   : investorId || null,
        vehicle_id    : vehicleId,
        weekly_amount : weekly,
        profile_id    : prof?.id || null,
        total_paid    : totalPaid,
        balance       : balance,
        pct_paid      : pct,
        status,
      })
      .select('id')
      .single();

    if (dErr) {
      console.error('Driver insert FAILED:', name, dErr.message, dErr.details, dErr.hint);
    } else {
      driverNameToId[name] = drv.id;
      console.log(`Driver OK: ${name} | investor=${investorName} | paid=${totalPaid} | balance=${balance}`);
    }
  }

  // ── STEP 4: Insert driver payments ────────────────────────────────────────
  onProgress('Inserting driver payments…');

  // Header 'Amt. Paid ' → stripped to 'Amt. Paid'
  const dpBatch = [];
  for (const row of dPayRows) {
    const name = txt(row['Name'] || '');
    const amt  = num(row['Amt. Paid']);         // ← stripped key
    const date = parseDate(row['Date']);
    if (!name || !amt) continue;

    dpBatch.push({
      driver_id      : driverNameToId[name] || null,
      driver_name    : name,
      payment_date   : date,
      amount         : amt,
      payment_channel: txt(row['Payment Channel'] || ''),  // ← stripped
      transaction_id : txt(row['Transaction ID']  || ''),
    });
  }

  if (dpBatch.length) {
    const { error } = await supabase.from('driver_payments').insert(dpBatch);
    if (error) console.error('Driver payments FAILED:', error.message);
    else console.log('Driver payments inserted:', dpBatch.length);
  }

  // ── STEP 5: Insert investor inflows + payouts ─────────────────────────────
  onProgress('Inserting investor transactions…');

  // After range:1 (skip merged header row) and cleanRow strips spaces:
  // Inflow cols A-E:  Name, Date, Amt. Paid, Payment Channel, Transaction ID
  // Outflow cols I-M: Name_1, Date_1, Amt. Paid_1, Payment Channel_1, Transaction ID_1
  // (XLSX.js appends _1 to duplicate header names)

  const inflowBatch = [];
  const payoutBatch = [];

  for (const row of iPayRows) {
    // ── INFLOW ──
    const iName = txt(row['Name'] || '');
    const iAmt  = num(row['Amt. Paid']);      // ← stripped
    const iDate = parseDate(row['Date']);

    if (iName && iAmt > 0) {
      let invId = investorNameToId[iName];
      if (!invId) {
        const found = Object.entries(investorNameToId)
          .find(([k]) => k.toLowerCase() === iName.toLowerCase());
        if (found) invId = found[1];
      }
      inflowBatch.push({
        investor_id    : invId || null,
        investor_name  : iName,
        investment_date: iDate,
        amount         : iAmt,
        payment_channel: txt(row['Payment Channel'] || ''),
        transaction_id : txt(row['Transaction ID']  || ''),
      });
    }

    // ── OUTFLOW ──
    // XLSX.js deduplicates repeated headers by appending _1
    // 'Amt. Paid ' (stripped) = 'Amt. Paid', second occurrence = 'Amt. Paid_1'
    const oName = txt(row['Name_1'] || '');
    const oAmt  = num(row['Amt. Paid_1']);    // ← stripped: 'Amt. Paid_1' NOT 'Amt. Paid _1'
    const oDate = parseDate(row['Date_1']);

    if (oName && oAmt > 0) {
      let invId = investorNameToId[oName];
      if (!invId) {
        const found = Object.entries(investorNameToId)
          .find(([k]) => k.toLowerCase() === oName.toLowerCase());
        if (found) invId = found[1];
      }
      payoutBatch.push({
        investor_id    : invId || null,
        investor_name  : oName,
        payout_date    : oDate,
        amount         : oAmt,
        payment_channel: txt(row['Payment Channel_1'] || ''),
        transaction_id : txt(row['Transaction ID_1']  || ''),
      });
    }
  }

  console.log('Inflows to insert:', inflowBatch.length, '| sample:', JSON.stringify(inflowBatch[0]));
  console.log('Payouts to insert:', payoutBatch.length, '| sample:', JSON.stringify(payoutBatch[0]));

  if (inflowBatch.length) {
    const { error } = await supabase.from('investor_inflows').insert(inflowBatch);
    if (error) console.error('Inflows FAILED:', error.message);
    else console.log('Inflows inserted:', inflowBatch.length);
  }
  if (payoutBatch.length) {
    const { error } = await supabase.from('investor_payouts').insert(payoutBatch);
    if (error) console.error('Payouts FAILED:', error.message);
    else console.log('Payouts inserted:', payoutBatch.length);
  }

  // ── STEP 6: Log upload ────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('upload_history').insert({
    id         : crypto.randomUUID(),
    uploaded_by: user?.id || null,
    filename   : file.name,
    uploaded_at: new Date().toISOString(),
    row_counts : {
      investors      : investorRows.length,
      drivers        : driverRows.length,
      driver_payments: dpBatch.length,
      inflows        : inflowBatch.length,
      payouts        : payoutBatch.length,
    },
  });

  onProgress('Done!');
  return {
    investors      : investorRows.length,
    drivers        : driverRows.length,
    driver_payments: dpBatch.length,
    inflows        : inflowBatch.length,
    payouts        : payoutBatch.length,
  };
}

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
