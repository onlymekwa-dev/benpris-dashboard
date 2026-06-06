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

function parseDate(raw) {
  if (!raw || raw === '') return null;
  // Already a JS Date from cellDates:true
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null;
    return raw.toISOString().slice(0, 10);
  }
  // ISO string from XLSX cellDates
  if (typeof raw === 'string' && raw.includes('T')) {
    return raw.slice(0, 10);
  }
  // Text: DD/MM/YYYY or DD/MM/YY
  if (typeof raw === 'string' && raw.includes('/')) {
    const p = raw.trim().split('/');
    if (p.length === 3) {
      const [d, m, y] = p;
      const year = y.length === 2 ? '20' + y : y;
      const date = `${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
      if (!isNaN(Date.parse(date))) return date;
    }
  }
  // Excel serial number
  if (typeof raw === 'number') {
    try {
      const d = XLSX.SSF.parse_date_code(raw);
      return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
    } catch { return null; }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN UPLOAD
// This file structure is FIXED — same sheet layout every upload:
//
// Driver_Summary:    row 1 = headers, rows 2-15 = drivers (14 drivers)
// Investor_Summary:  row 1 = headers, rows 2-11 = investors (10 investors)
// Driver_Payments:   row 1 = headers (Name/Date/Amt.Paid /...), rows 2+ = payments
// Investor_Payouts:  row 1 = merged "Inflow/Outflow", row 2 = headers, rows 3+ = data
//                    Inflow:  cols A(Name) B(Date) C(Amt. Paid ) D(PayCh) E(TxID)
//                    Outflow: cols I(Name_1) J(Date_1) K(Amt. Paid _1) L(PayCh_1) M(TxID_1)
// ─────────────────────────────────────────────────────────────────────────────
export async function uploadWorkbook(file, onProgress) {
  onProgress('Reading workbook…');

  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

  // Parse sheets with correct range offsets
  const driverRows   = XLSX.utils.sheet_to_json(wb.Sheets['Driver_Summary'],   { defval: '', range: 0 });
  const investorRows = XLSX.utils.sheet_to_json(wb.Sheets['Investor_Summary'],  { defval: '', range: 0 });
  const dPayRows     = XLSX.utils.sheet_to_json(wb.Sheets['Driver_Payments'],   { defval: '', range: 0 });
  // Investor_Payouts: row 0 is "Inflow/Outflow", row 1 is real headers → range:1
  const iPayRows     = XLSX.utils.sheet_to_json(wb.Sheets['Investor_Payouts'],  { defval: '', range: 1 });

  console.log(`Drivers: ${driverRows.length}, Investors: ${investorRows.length}`);
  console.log(`Driver payments: ${dPayRows.length}, Investor payouts: ${iPayRows.length}`);
  console.log('iPayRows[0] keys:', Object.keys(iPayRows[0] || {}));
  console.log('iPayRows[0]:', JSON.stringify(iPayRows[0]));
  console.log('dPayRows[0]:', JSON.stringify(dPayRows[0]));

  // ── STEP 1: Full wipe ────────────────────────────────────────────────────
  onProgress('Clearing all existing data…');

  for (const table of [
    'driver_payments', 'investor_payouts', 'investor_inflows',
    'upload_history', 'drivers', 'vehicles', 'investors'
  ]) {
    const { error } = await supabase
      .from(table)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) console.error(`Wipe ${table}:`, error.message);
    else console.log(`Wiped ${table}`);
  }

  // ── STEP 2: Insert investors ─────────────────────────────────────────────
  onProgress('Inserting investors…');

  const investorNameToId = {};

  for (const row of investorRows) {
    const name = txt(row['Full Name']);
    if (!name) continue;

    const { data: prof } = await supabase
      .from('profiles').select('id')
      .ilike('full_name', name).maybeSingle();

    const contractEnd = parseDate(row['End of Contract Date'] || row['End of Contract Date '] || null);

    const { data: inv, error } = await supabase
      .from('investors')
      .insert({
        full_name       : name,
        id_number       : txt(row['ID'] || ''),
        contact         : txt(row['Contact'] || ''),
        email           : txt(row['Email'] || ''),
        profile_id      : prof?.id || null,
        num_vehicles    : num(row['No. of Vehicles']),
        capital_invested: num(row['Capital Invested']),
        future_value    : num(row['Future Value']),
        weekly_payout   : num(row['Weekly Payout'] || row['Weekly Amount'] || 0),
        weeks_paid      : num(row['Weeks Paid']),
        total_paid_out  : num(row['Total Amount Paid']),
        balance         : num(row['Balance'] || row['Balance ']),
        pct_paid        : num(row['Percentage']),
        contract_end    : contractEnd,
        status          : txt(row['Status']) || null,
      })
      .select('id').single();

    if (error) console.error('Investor insert error:', name, error.message);
    else {
      investorNameToId[name] = inv.id;
      console.log('Investor OK:', name, inv.id);
    }
  }

  // ── STEP 3: Insert vehicles + drivers ────────────────────────────────────
  onProgress('Inserting drivers…');

  const driverNameToId = {};

  for (const row of driverRows) {
    const name = txt(row['Full Name']);
    if (!name) continue;

    const investorName = txt(row['Investor'] || row['Investor Assigned'] || '');
    // Exact match first, then case-insensitive
    let investorId = investorNameToId[investorName];
    if (!investorId) {
      const found = Object.entries(investorNameToId)
        .find(([k]) => k.toLowerCase() === investorName.toLowerCase());
      if (found) investorId = found[1];
    }

    const cost     = num(row['Cost of Vehicle'] || row['Cost of Vehicle (GH₵)']);
    const makeModel= txt(row['Vehicle (Make and Model)'] || row['Vehicle (Make and Model) '] || row['Vehicle (Make & Model)'] || '');
    const regNo    = txt(row['Vehicle Registration'] || row['Vehicle Registration '] || '');

    // Insert vehicle
    let vehicleId = null;
    if (cost > 0) {
      const { data: veh, error: vErr } = await supabase
        .from('vehicles')
        .insert({ make_model: makeModel || null, registration: regNo || null, cost, investor_id: investorId })
        .select('id').single();
      if (vErr) console.error('Vehicle insert error:', name, vErr.message);
      else vehicleId = veh.id;
    }

    const { data: prof } = await supabase
      .from('profiles').select('id')
      .ilike('full_name', name).maybeSingle();

    const { data: drv, error: dErr } = await supabase
      .from('drivers')
      .insert({
        full_name     : name,
        contact       : txt(row['Contact'] || ''),
        email         : txt(row['email'] || row['Email'] || ''),
        driver_license: txt(row['Driver License'] || ''),
        investor_id   : investorId || null,
        vehicle_id    : vehicleId,
        weekly_amount : num(row['Weekly Amount'] || row['Weekly Amount (GH₵)']),
        profile_id    : prof?.id || null,
        // Trust Excel pre-computed values
        total_paid    : num(row['Total Amount Paid']),
        balance       : num(row['Balance'] || row['Balance ']),
        pct_paid      : num(row['Percentage']),
        status        : txt(row['Status']) || 'In Progress',
      })
      .select('id').single();

    if (dErr) console.error('Driver insert error:', name, dErr.message);
    else {
      driverNameToId[name] = drv.id;
      console.log('Driver OK:', name, '| investor:', investorName, '| paid:', num(row['Total Amount Paid']));
    }
  }

  // ── STEP 4: Insert driver payments ───────────────────────────────────────
  onProgress('Inserting driver payments…');

  // Exact keys from XLSX.js: Name, Date, Amt. Paid , Payment Channel , Transaction ID
  const dpBatch = [];
  for (const row of dPayRows) {
    const name = txt(row['Name']);
    const amt  = num(row['Amt. Paid '] || row['Amt. Paid']);
    const date = parseDate(row['Date']);
    if (!name || !amt) continue;

    dpBatch.push({
      driver_id      : driverNameToId[name] || null,
      driver_name    : name,
      payment_date   : date,
      amount         : amt,
      payment_channel: txt(row['Payment Channel '] || row['Payment Channel'] || ''),
      transaction_id : txt(row['Transaction ID'] || ''),
    });
  }

  if (dpBatch.length) {
    const { error } = await supabase.from('driver_payments').insert(dpBatch);
    if (error) console.error('Driver payments batch insert error:', error.message);
    else console.log('Driver payments inserted:', dpBatch.length);
  }

  // ── STEP 5: Insert investor inflows + payouts ─────────────────────────────
  onProgress('Inserting investor transactions…');

  // EXACT keys confirmed by XLSX.js parser:
  // Inflow:  Name, Date, "Amt. Paid ", "Payment Channel ", "Transaction ID"
  // Outflow: Name_1, Date_1, "Amt. Paid _1", "Payment Channel _1", "Transaction ID_1"

  const inflowBatch = [];
  const payoutBatch = [];

  for (const row of iPayRows) {
    // ── Inflow ──
    const iName = txt(row['Name'] || '');
    const iAmt  = num(row['Amt. Paid '] || row['Amt. Paid'] || 0);
    const iDate = parseDate(row['Date'] || null);

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
        payment_channel: txt(row['Payment Channel '] || row['Payment Channel'] || ''),
        transaction_id : txt(row['Transaction ID'] || ''),
      });
    }

    // ── Outflow — EXACT key: "Name_1", "Date_1", "Amt. Paid _1" ──
    const oName = txt(row['Name_1'] || '');
    const oAmt  = num(row['Amt. Paid _1'] || row['Amt. Paid_1'] || 0);
    const oDate = parseDate(row['Date_1'] || null);

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
        payment_channel: txt(row['Payment Channel _1'] || row['Payment Channel_1'] || ''),
        transaction_id : txt(row['Transaction ID_1'] || ''),
      });
    }
  }

  console.log('Inflows to insert:', inflowBatch.length, '| Sample:', JSON.stringify(inflowBatch[0]));
  console.log('Payouts to insert:', payoutBatch.length, '| Sample:', JSON.stringify(payoutBatch[0]));

  if (inflowBatch.length) {
    const { error } = await supabase.from('investor_inflows').insert(inflowBatch);
    if (error) console.error('Inflows insert error:', error.message);
    else console.log('Inflows inserted:', inflowBatch.length);
  }

  if (payoutBatch.length) {
    const { error } = await supabase.from('investor_payouts').insert(payoutBatch);
    if (error) console.error('Payouts insert error:', error.message);
    else console.log('Payouts inserted:', payoutBatch.length);
  }

  // ── STEP 6: Log upload ───────────────────────────────────────────────────
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

// ── Unlinked records ─────────────────────────────────────────────────────────
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
