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

function txt(v) {
  return v != null ? String(v).trim() : '';
}

function cleanRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const cleanKey = k != null ? String(k).trim() : k;
    out[cleanKey] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

function parseSheet(wb, name, headerRow = 1) {
  const ws = wb.Sheets[name];
  if (!ws) { console.warn('Sheet not found:', name); return []; }
  const raw = XLSX.utils.sheet_to_json(ws, { defval: '', range: headerRow - 1 });
  return raw.map(cleanRow);
}

// ── Main upload function ────────────────────────────────────────────────────
export async function uploadWorkbook(file, onProgress) {
  onProgress('Reading workbook…');

  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });

  const sheets = {
    investor: parseSheet(wb, 'Investor_Summary'),
    driver  : parseSheet(wb, 'Driver_Summary'),
    dPay    : parseSheet(wb, 'Driver_Payments'),
    iPay    : parseSheet(wb, 'Investor_Payouts', 2),
  };

  console.log('=== SHEET COUNTS ===');
  console.log('Investors:', sheets.investor.length);
  console.log('Drivers:', sheets.driver.length);
  console.log('Driver payments:', sheets.dPay.length);
  console.log('Investor payouts:', sheets.iPay.length);
  console.log('=== SAMPLE ROWS ===');
  console.log('Investor[0]:', JSON.stringify(sheets.investor[0]));
  console.log('Driver[0]:', JSON.stringify(sheets.driver[0]));

  // ── 1. Archive and clear transaction tables ───────────────────────────────
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

  // ── 2. Clear and re-insert investors ─────────────────────────────────────
  onProgress('Syncing investors…');

  // Delete existing investors so we can re-insert cleanly
  const { error: delInvErr } = await supabase
    .from('investors')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (delInvErr) console.error('Delete investors error:', delInvErr);

  const investorNameToId = {};

  for (const rawRow of sheets.investor) {
    const name = txt(rawRow['Full Name']);
    if (!name) { console.log('Skipping investor row - no name:', rawRow); continue; }

    // Find matching profile by full_name
    const { data: prof } = await supabase
      .from('profiles')
      .select('id')
      .eq('full_name', name)
      .maybeSingle();

    const payload = {
      full_name : name,
      id_number : txt(rawRow['ID'] || rawRow['ID No.'] || ''),
      contact   : txt(rawRow['Contact'] || ''),
      email     : txt(rawRow['Email'] || rawRow['email'] || ''),
      profile_id: prof?.id || null,
    };

    console.log('Inserting investor:', name);
    const { data: inv, error: invErr } = await supabase
      .from('investors')
      .insert(payload)
      .select('id')
      .single();

    if (invErr) {
      console.error('Investor insert error for', name, ':', invErr.message, invErr.details);
    } else {
      investorNameToId[name] = inv.id;
      console.log('Investor inserted:', name, inv.id);
    }
  }

  console.log('Investor name map:', JSON.stringify(investorNameToId));

  // ── 3. Clear and re-insert drivers ───────────────────────────────────────
  onProgress('Syncing drivers…');

  const { error: delDrvErr } = await supabase
    .from('drivers')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (delDrvErr) console.error('Delete drivers error:', delDrvErr);

  const driverNameToId = {};

  for (const row of sheets.driver) {
    const name = txt(row['Full Name']);
    if (!name) { console.log('Skipping driver row - no name:', row); continue; }

    const investorName = txt(row['Investor'] || row['Investor Assigned'] || '');
    const investorId   = investorNameToId[investorName] || null;
    const vehicleCost  = num(row['Cost of Vehicle'] || row['Cost of Vehicle (GH₵)'] || 0);
    const makeModel    = txt(row['Vehicle (Make and Model)'] || row['Vehicle (Make and Model) '] || row['Vehicle (Make & Model)'] || '');
    const regNo        = txt(row['Vehicle Registration'] || row['Vehicle Registration '] || '');
    const weekly       = num(row['Weekly Amount'] || row['Weekly Amount (GH₵)'] || row['Weekly Payout'] || 0);

    // Find or create vehicle
    let vehicleId = null;
    if (vehicleCost > 0) {
      // First check if vehicle already exists
      if (regNo) {
        const { data: existingVeh } = await supabase
          .from('vehicles').select('id').eq('registration', regNo).maybeSingle();
        if (existingVeh) {
          vehicleId = existingVeh.id;
        } else {
          const { data: veh, error: vehErr } = await supabase
            .from('vehicles')
            .insert({ make_model: makeModel || null, registration: regNo, cost: vehicleCost, investor_id: investorId })
            .select('id').single();
          if (vehErr) console.error('Vehicle insert error:', vehErr.message);
          else vehicleId = veh.id;
        }
      } else {
        // No registration — just insert
        const { data: veh, error: vehErr } = await supabase
          .from('vehicles')
          .insert({ make_model: makeModel || null, registration: null, cost: vehicleCost, investor_id: investorId })
          .select('id').single();
        if (vehErr) console.error('Vehicle insert error (no reg):', vehErr.message);
        else vehicleId = veh?.id || null;
      }
    }

    const { data: prof } = await supabase
      .from('profiles').select('id').eq('full_name', name).maybeSingle();

    const dPayload = {
      full_name     : name,
      contact       : txt(row['Contact'] || ''),
      email         : txt(row['email'] || row['Email'] || ''),
      driver_license: txt(row['Driver License'] || ''),
      investor_id   : investorId,
      vehicle_id    : vehicleId,
      weekly_amount : weekly,
      profile_id    : prof?.id || null,
    };

    console.log('Inserting driver:', name, 'investor:', investorName, 'investorId:', investorId);
    const { data: drv, error: drvErr } = await supabase
      .from('drivers')
      .insert(dPayload)
      .select('id')
      .single();

    if (drvErr) {
      console.error('Driver insert error for', name, ':', drvErr.message, drvErr.details, drvErr.hint);
    } else {
      driverNameToId[name] = drv.id;
      console.log('Driver inserted:', name, drv.id);
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
  if (dpRows.length) {
    const { error: dpErr } = await supabase.from('driver_payments').insert(dpRows);
    if (dpErr) console.error('Driver payments insert error:', dpErr.message);
  }

  // ── 5. Insert Investor Inflows + Payouts ──────────────────────────────────
  onProgress('Uploading investor transactions…');
  const inflowRows = [];
  const payoutRows = [];

  for (const row of sheets.iPay) {
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

    const oName = txt(row['Name_1'] || row['Name__1'] || '');
    const oAmt  = num(row['Amt. Paid_1'] || row['Amt. Paid _1'] || row['Amt. Paid__1'] || 0);
    const oDate = parseDate(row['Date_1'] || row['Date__1'] || '');
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

  if (inflowRows.length) {
    const { error: infErr } = await supabase.from('investor_inflows').insert(inflowRows);
    if (infErr) console.error('Inflows insert error:', infErr.message);
  }
  if (payoutRows.length) {
    const { error: payErr } = await supabase.from('investor_payouts').insert(payoutRows);
    if (payErr) console.error('Payouts insert error:', payErr.message);
  }

  // ── 6. Update driver status from Excel Status column ────────────────────────
  // The Excel Status formula detects At Risk (no payment in 3+ weeks) automatically.
  // We trust that value — upload it directly to the database.
  onProgress('Updating driver statuses…');
  const validStatuses = ['Completed', 'On Track', 'In Progress', 'At Risk'];
  for (const row of sheets.driver) {
    const name   = txt(row['Full Name']);
    const status = txt(row['Status'] || '');
    if (!name || !validStatuses.includes(status)) continue;
    const drvId  = driverNameToId[name];
    if (drvId) {
      await supabase.from('drivers').update({ status }).eq('id', drvId);
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
