import * as XLSX from 'xlsx';
import { supabase } from './supabase';

// ── helpers ────────────────────────────────────────────────────────────────
function parseDate(raw) {
  if (!raw) return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === 'number') {
    const date = XLSX.SSF.parse_date_code(raw);
    return `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`;
  }
  const s = String(raw).trim();
  // dd/mm/yy or dd/mm/yyyy
  const parts = s.split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts;
    const year = y.length === 2 ? '20' + y : y;
    return `${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  return null;
}

function num(v) {
  const n = parseFloat(String(v).replace(/,/g,''));
  return isNaN(n) ? 0 : n;
}

// Trim whitespace from all keys in a row object
function cleanRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const cleanKey = k != null ? String(k).trim() : k;
    out[cleanKey] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

function txt(v) {
  return v != null ? String(v).trim() : '';
}

// ── Main upload function ────────────────────────────────────────────────────
export async function uploadWorkbook(file, onProgress) {
  onProgress('Reading workbook…');

  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });

  // Parse each sheet — clean all row keys to remove trailing spaces
  function parseSheet(name, headerRow = 1) {
    const ws = wb.Sheets[name];
    if (!ws) return [];
    const raw = XLSX.utils.sheet_to_json(ws, {
      defval: '',
      range: headerRow - 1, // 0-indexed
    });
    return raw.map(cleanRow);
  }

  // Investor_Payouts has a merged "Inflow/Outflow" label in row 1
  // and actual column headers in row 2 — so we start from row 2
  const sheets = {
    investor : parseSheet('Investor_Summary'),
    driver   : parseSheet('Driver_Summary'),
    dPay     : parseSheet('Driver_Payments'),
    iPay     : parseSheet('Investor_Payouts', 2), // skip the merged header row
  };

  console.log('Driver sheet sample:', sheets.driver[0]);
  console.log('Investor sheet sample:', sheets.investor[0]);
  console.log('Driver payments sample:', sheets.dPay[0]);
  console.log('Investor payouts sample:', sheets.iPay[0]);

  // ── 1. Archive existing transaction data ──────────────────────────────────
  onProgress('Archiving existing records…');
  const uploadId = crypto.randomUUID();

  async function archiveAndClear(table, archiveTable) {
    const { data: existing } = await supabase.from(table).select('*');
    if (existing && existing.length > 0) {
      const rows = existing.map(r => ({
        ...r,
        id: crypto.randomUUID(),
        upload_id: uploadId,
        archived_at: new Date().toISOString(),
      }));
      await supabase.from(archiveTable).insert(rows);
    }
    await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  }

  await archiveAndClear('driver_payments',  'driver_payments_archive');
  await archiveAndClear('investor_payouts', 'investor_payouts_archive');
  await archiveAndClear('investor_inflows', 'investor_inflows_archive');

  // ── 2. Upsert Investors ───────────────────────────────────────────────────
  onProgress('Syncing investors…');
  const investorNameToId = {};

  for (const rawRow of sheets.investor) {
    const row = rawRow;
    const name = txt(row['Full Name']);
    if (!name) continue;

    const { data: prof } = await supabase
      .from('profiles').select('id').eq('full_name', name).single();

    const payload = {
      full_name : name,
      id_number : txt(row['ID'] || row['ID No.'] || ''),
      contact   : txt(row['Contact'] || ''),
      email     : txt(row['Email'] || row['email'] || ''),
      profile_id: prof?.id || null,
    };

    const { data: inv } = await supabase
      .from('investors')
      .upsert(payload, { onConflict: 'full_name' })
      .select('id').single();

    if (inv) {
      investorNameToId[name] = inv.id;
    } else {
      const { data: existing } = await supabase
        .from('investors').select('id').eq('full_name', name).single();
      if (existing) investorNameToId[name] = existing.id;
    }
  }

  // ── 3. Upsert Vehicles + Drivers ──────────────────────────────────────────
  onProgress('Syncing drivers & vehicles…');
  const driverNameToId = {};

  for (const row of sheets.driver) {
    const name = txt(row['Full Name']);
    if (!name) continue;

    const investorName = txt(row['Investor'] || row['Investor Assigned'] || '');
    const investorId   = investorNameToId[investorName] || null;
    const vehicleCost  = num(row['Cost of Vehicle'] || row['Cost of Vehicle (GH₵)'] || 0);
    // Handle trailing spaces in header names
    const makeModel    = txt(
      row['Vehicle (Make and Model)'] ||
      row['Vehicle (Make & Model)']   ||
      row['Vehicle (Make and Model) ']||
      ''
    );
    const regNo = txt(
      row['Vehicle Registration']   ||
      row['Vehicle Registration ']  ||
      ''
    );

    // Upsert vehicle
    let vehicleId = null;
    if (vehicleCost > 0) {
      const vPayload = {
        make_model  : makeModel || null,
        registration: regNo || null,
        cost        : vehicleCost,
        investor_id : investorId,
      };

      if (regNo) {
        const { data: veh } = await supabase
          .from('vehicles')
          .upsert(vPayload, { onConflict: 'registration' })
          .select('id').single();
        vehicleId = veh?.id || null;

        if (!vehicleId) {
          const { data: ev } = await supabase
            .from('vehicles').select('id').eq('registration', regNo).single();
          vehicleId = ev?.id || null;
        }
      } else {
        // No registration — insert without conflict check
        const { data: veh } = await supabase
          .from('vehicles').insert(vPayload).select('id').single();
        vehicleId = veh?.id || null;
      }
    }

    const { data: prof } = await supabase
      .from('profiles').select('id').eq('full_name', name).single();

    const dPayload = {
      full_name     : name,
      contact       : txt(row['Contact'] || ''),
      email         : txt(row['email'] || row['Email'] || ''),
      driver_license: txt(row['Driver License'] || ''),
      investor_id   : investorId,
      vehicle_id    : vehicleId,
      weekly_amount : num(row['Weekly Amount'] || row['Weekly Amount (GH₵)'] || 0),
      profile_id    : prof?.id || null,
    };

    const { data: drv } = await supabase
      .from('drivers')
      .upsert(dPayload, { onConflict: 'full_name' })
      .select('id').single();

    if (drv) {
      driverNameToId[name] = drv.id;
    } else {
      const { data: ed } = await supabase
        .from('drivers').select('id').eq('full_name', name).single();
      if (ed) driverNameToId[name] = ed.id;
    }
  }

  // ── 4. Insert Driver Payments ─────────────────────────────────────────────
  onProgress('Uploading driver payments…');
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
  if (dpRows.length) await supabase.from('driver_payments').insert(dpRows);

  // ── 5. Insert Investor Inflows + Payouts ──────────────────────────────────
  onProgress('Uploading investor transactions…');
  const inflowRows = [];
  const payoutRows = [];

  for (const row of sheets.iPay) {
    // Inflow side (columns A–E): Name, Date, Amt. Paid, Payment Channel, Transaction ID
    const iName = txt(row['Name'] || '');
    const iAmt  = num(row['Amt. Paid'] || row['Amt. Paid '] || 0);
    const iDate = parseDate(row['Date'] || '');

    if (iName && iAmt) {
      inflowRows.push({
        investor_id    : investorNameToId[iName] || null,
        investor_name  : iName,
        investment_date: iDate || null,
        amount         : iAmt,
        payment_channel: txt(row['Payment Channel'] || row['Payment Channel '] || ''),
        transaction_id : txt(row['Transaction ID'] || ''),
      });
    }

    // Outflow side (columns I–M): Name, Date, Amt. Paid, Payment Channel, Transaction ID
    // After cleanRow these come through as 'Name_1', 'Date_1' etc if duplicate headers
    // OR as the same names if XLSX deduplicated them
    const oName = txt(row['Name_1'] || row['Name__1'] || '');
    const oAmt  = num(row['Amt. Paid_1'] || row['Amt. Paid _1'] || row['Amt. Paid__1'] || 0);
    const oDate = parseDate(row['Date_1'] || row['Date__1'] || '');

    if (oName && oAmt) {
      payoutRows.push({
        investor_id    : investorNameToId[oName] || null,
        investor_name  : oName,
        payout_date    : oDate || null,
        amount         : oAmt,
        payment_channel: txt(row['Payment Channel_1'] || ''),
        transaction_id : txt(row['Transaction ID_1'] || ''),
      });
    }
  }

  if (inflowRows.length) await supabase.from('investor_inflows').insert(inflowRows);
  if (payoutRows.length) await supabase.from('investor_payouts').insert(payoutRows);

  // ── 6. Update driver status based on payment percentage ───────────────────
  onProgress('Updating payment statuses…');
  const { data: allDrivers } = await supabase
    .from('v_driver_summary').select('id, pct_paid');

  if (allDrivers) {
    for (const d of allDrivers) {
      const pct = parseFloat(d.pct_paid) || 0;
      const status =
        pct >= 1    ? 'Completed'   :
        pct >= 0.5  ? 'On Track'    :
        pct >= 0.1  ? 'In Progress' : 'At Risk';

      await supabase.from('drivers').update({ status }).eq('id', d.id);
    }
  }

  // ── 7. Log upload ─────────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser();
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

// ── Post-upload: return unlinked records ───────────────────────────────────
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
