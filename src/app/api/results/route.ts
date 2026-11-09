import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase';
import { decodeRecordAnalyzerMeta } from '@/lib/types';
import { getSessionFromRequest, normalizeUsername } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

// GET: Ambil daftar hasil analisis terisolasi per akun pengguna aktif
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = (searchParams.get('code') || '').trim().toUpperCase();
    const year = (searchParams.get('year') || '').trim();
    const session = await getSessionFromRequest(req);
    const activeOwner = normalizeUsername(session?.username || searchParams.get('owner') || '');

    const supabase = getSupabaseServerClient(req);
    if (!supabase) {
      return NextResponse.json({
        success: true,
        data: [],
        message: 'Supabase belum dikonfigurasi. Hasil baru akan muncul di browser.'
      });
    }

    let query = supabase
      .from('ced_results')
      .select('*')
      .order('created_at', { ascending: false });

    if (code) {
      query = query.ilike('company_code', `%${code}%`);
    }
    if (year) {
      query = query.eq('fiscal_year', year);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const unpackedData = Array.isArray(data) ? data.map(row => decodeRecordAnalyzerMeta(row)) : [];

    // Isolasi ketat per akun: jika ada user aktif, hanya kembalikan baris milik akun tersebut
    const isolatedData = activeOwner
      ? unpackedData.filter(row => normalizeUsername(row.owner_username) === activeOwner)
      : unpackedData;

    return NextResponse.json({
      success: true,
      data: isolatedData
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err?.message || 'Gagal memuat hasil.'
    }, { status: 500 });
  }
}

// DELETE: Hapus baris hasil berdasarkan ID atau (company_code + fiscal_year)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const code = searchParams.get('code');
    const year = searchParams.get('year');
    const session = await getSessionFromRequest(req);
    const activeOwner = normalizeUsername(session?.username || searchParams.get('owner') || '');

    const supabase = getSupabaseServerClient(req);
    if (!supabase) {
      return NextResponse.json({
        success: false,
        error: 'Supabase belum dikonfigurasi.'
      }, { status: 400 });
    }

    if (id) {
      if (activeOwner) {
        const { data: existingRow } = await supabase
          .from('ced_results')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (existingRow) {
          const decoded = decodeRecordAnalyzerMeta(existingRow);
          const rowOwner = normalizeUsername(decoded.owner_username);
          if (rowOwner && rowOwner !== activeOwner) {
            return NextResponse.json(
              { success: false, error: 'Anda tidak memiliki akses untuk menghapus data milik akun lain.' },
              { status: 403 }
            );
          }
        }
      }
      const { error } = await supabase.from('ced_results').delete().eq('id', id);
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
    } else if (code && year) {
      const { error } = await supabase
        .from('ced_results')
        .delete()
        .eq('company_code', code.toUpperCase())
        .eq('fiscal_year', year);
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
    } else {
      return NextResponse.json({
        success: false,
        error: 'Parameter ID atau (code & year) wajib disertakan.'
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Data berhasil dihapus dari database.'
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err?.message || 'Gagal menghapus data.'
    }, { status: 500 });
  }
}
