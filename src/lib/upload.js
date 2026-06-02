import * as XLSX from 'xlsx';
import { supabase } from './supabase';

// ── helpers ────────────────────────────────────────────────────────────────
function parseDate(raw) {
  if (!raw) return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  // Excel serial number
  if (typeof raw === 'number') {
    const date = XLSX.SSF.parse_date_code(raw);
    return `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`;
  }
  // Text like "23/01/24" or "13/06/2024"
  const parts = String(raw).split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts;
    const year = y.length === 2 ? '20' + y : y;
    return `${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  return null;
}

function num(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function txt(v) {
  return v != null ? String(v).trim() : '';
}

// ── Main upload function ────────────────────────────────────────────────────
export async function uploadWorkbook(file, onProgress) {
  onProgress('Reading workbook…');

  const buffer = await file.arrayBuffer();
  const wb     = XLSX.read(buffer, { type: 'array', cellDates: false });

  const sheets = {
    investor : XLSX.utils.sheet_to_json(wb.Sheets['Investor_Summary']  || {}, { defval: '' }),
    driver   : XLSX.utils.sheet_to_json(wb.Sheets['Driver_Summary']    || {}, { defval: '' }),
    dPay     : XLSX.utils.sheet_to_json(wb.Sheets['Driver_Payments']   || {}, { defval: '' }),
    iPay     : XLSX.utils.sheet_to_json(wb.Sheets['Investor_Payouts']  || {}, { defval: '' }),
  };

  // ── 1. Archive existing transaction data before wipe ─────────────────────
  onProgress('Archiving existing records…');

  const uploadId = crypto.randomUUID();

  async function archiveAndClear(table, archiveTable) {
    // Copy rows to archive with upload_id stamp
    const { data: existing } = await supabase.from(table).select('*');
    if (existing && existing.length > 0) {
      const rows = existing.map(r => ({ ...r, id: crypto.randomUUID(), upload_id: uploadId, archived_at: new Date().toISOString() }));
      await supabase.from(archiveTable).insert(rows);
    }
    await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  }

  await archiveAndClear('driver_payments',     'driver_payments_archive');
  await archiveAndClear('investor_payouts',    'investor_payouts_archive');
  await archiveAndClear('investor_inflows',    'investor_inflows_archive');

  // ── 2. Upsert Investors ──────────────────────────────────────────────────
  onProgress('Syncing investors…');

  const investorNameToId = {};

  for (const row of sheets.investor) {
    const name = txt(row['Full Name']);
    if (!name) continue;

    // Find matching profile
    const { data: prof } = await supabase
      .from('profiles')
      .select('id')
      .eq('full_name', name)
      .single();

    const payload = {
      full_name : name,
      id_number : txt(row['ID'] || row['ID No.']),
      contact   : txt(row['Contact']),
      email     : txt(row['Email']),
      profile_id: prof?.id || null,
    };

    // Upsert by full_name (idempotent)
    const { data: inv, error } = await supabase
      .from('investors')
      .upsert(payload, { onConflict: 'full_name', ignoreDuplicates: false })
      .select('id')
      .single();

    if (!error && inv) investorNameToId[name] = inv.id;
    else {
      // fallback: fetch existing
      const { data: existing } = await supabase.from('investors').select('id').eq('full_name', name).single();
      if (existing) investorNameToId[name] = existing.id;
    }
  }

  // Also register BenPris as investor if not already
  if (!investorNameToId['BenPris']) {
    const { data: bp } = await supabase.from('investors').select('id').eq('full_name', 'BenPris').single();
    if (bp) investorNameToId['BenPris'] = bp.id;
  }

  // ── 3. Upsert Vehicles + Drivers ─────────────────────────────────────────
  onProgress('Syncing drivers & vehicles…');

  const driverNameToId = {};

  for (const row of sheets.driver) {
    const name = txt(row['Full Name']);
    if (!name) continue;

    const investorName = txt(row['Investor'] || row['Investor Assigned']);
    const investorId   = investorNameToId[investorName] || null;
    const vehicleCost  = num(row['Cost of Vehicle'] || row['Cost of Vehicle (GH₵)'] || 0);
    const makeModel    = txt(row['Vehicle (Make and Model)'] || row['Vehicle (Make & Model)'] || '');
    const regNo        = txt(row['Vehicle Registration'] || '');

    // Upsert vehicle
    let vehicleId = null;
    if (vehicleCost > 0) {
      const vPayload = {
        make_model   : makeModel || null,
        registration : regNo || null,
        cost         : vehicleCost,
        investor_id  : investorId,
      };
      const { data: veh } = await supabase
        .from('vehicles')
        .upsert(vPayload, { onConflict: 'registration', ignoreDuplicates: false })
        .select('id')
        .single();
      vehicleId = veh?.id || null;

      if (!vehicleId && regNo) {
        const { data: ev } = await supabase.from('vehicles').select('id').eq('registration', regNo).single();
        vehicleId = ev?.id || null;
      }
    }

    const { data: prof } = await supabase.from('profiles').select('id').eq('full_name', name).single();

    const dPayload = {
      full_name     : name,
      contact       : txt(row['Contact']),
      email         : txt(row['email'] || row['Email'] || ''),
      driver_license: txt(row['Driver License'] || ''),
      investor_id   : investorId,
      vehicle_id    : vehicleId,
      weekly_amount : num(row['Weekly Amount'] || row['Weekly Amount (GH₵)'] || 0),
      profile_id    : prof?.id || null,
    };

    const { data: drv } = await supabase
      .from('drivers')
      .upsert(dPayload, { onConflict: 'full_name', ignoreDuplicates: false })
      .select('id')
      .single();

    if (drv) driverNameToId[name] = drv.id;
    else {
      const { data: ed } = await supabase.from('drivers').select('id').eq('full_name', name).single();
      if (ed) driverNameToId[name] = ed.id;
    }
  }

  // ── 4. Insert Driver Payments ────────────────────────────────────────────
  onProgress('Uploading driver payments…');

  const dpRows = [];
  for (const row of sheets.dPay) {
    const name = txt(row['Name']);
    const amt  = num(row['Amt. Paid'] || row['Amt. Paid '] || 0);
    const date = parseDate(row['Date']);
    if (!name || !amt || !date) continue;
    dpRows.push({
      driver_id      : driverNameToId[name] || null,
      driver_name    : name,
      payment_date   : date,
      amount         : amt,
      payment_channel: txt(row['Payment Channel'] || row['Payment Channel '] || ''),
      transaction_id : txt(row['Transaction ID'] || ''),
    });
  }
  if (dpRows.length) await supabase.from('driver_payments').insert(dpRows);

  // ── 5. Insert Investor Inflows + Payouts ─────────────────────────────────
  onProgress('Uploading investor transactions…');

  const inflowRows = [];
  const payoutRows = [];

  for (const row of sheets.iPay) {
    // Inflow (columns A–E)
    const iName = txt(row['Name'] || row['__EMPTY'] || '');
    const iAmt  = num(row['Amt. Paid'] || row['Amt. Paid '] || 0);
    const iDate = parseDate(row['Date'] || '');
    if (iName && iAmt && iDate) {
      inflowRows.push({
        investor_id    : investorNameToId[iName] || null,
        investor_name  : iName,
        investment_date: iDate,
        amount         : iAmt,
        payment_channel: txt(row['Payment Channel'] || row['Payment Channel '] || ''),
        transaction_id : txt(row['Transaction ID'] || ''),
      });
    }

    // Outflow (columns I–M)
    const oName = txt(row['Name_1'] || row['__EMPTY_7'] || '');
    const oAmt  = num(row['Amt. Paid_1'] || row['Amt. Paid _1'] || 0);
    const oDate = parseDate(row['Date_1'] || '');
    if (oName && oAmt) {
      payoutRows.push({
        investor_id    : investorNameToId[oName] || null,
        investor_name  : oName,
        payout_date    : oDate || null,
        amount         : oAmt,
        payment_channel: '',
        transaction_id : '',
      });
    }
  }

  if (inflowRows.length) await supabase.from('investor_inflows').insert(inflowRows);
  if (payoutRows.length) await supabase.from('investor_payouts').insert(payoutRows);

  // ── 6. Log upload ─────────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('upload_history').insert({
    id          : uploadId,
    uploaded_by : user?.id,
    filename    : file.name,
    uploaded_at : new Date().toISOString(),
    row_counts  : {
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


// ── Post-upload: return list of newly unlinked records ─────────────────────
// Called by the UI after uploadWorkbook() so admin can see who needs an account
export async function getUnlinkedRecords() {
  const [{ data: drivers }, { data: investors }] = await Promise.all([
    supabase.from('drivers').select('id, full_name, email, contact').is('profile_id', null),
    supabase.from('investors').select('id, full_name, email, contact').is('profile_id', null),
  ]);
  return {
    drivers  : drivers   || [],
    investors: investors || [],
    total    : (drivers?.length || 0) + (investors?.length || 0),
  };
}
