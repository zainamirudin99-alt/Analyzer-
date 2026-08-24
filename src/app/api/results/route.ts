import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET: Ambil daftar seluruh hasil analisis
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = (searchParams.get('code') || '').trim().toUpperCase();
    const year = (searchParams.get('year') || '').trim();

    const supabase = getSupabaseServerClient();
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

    return NextResponse.json({
      success: true,
      data: data || []
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

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({
        success: false,
        error: 'Supabase belum dikonfigurasi.'
      }, { status: 400 });
    }

    let deleteQuery = supabase.from('ced_results').delete();

    if (id) {
      deleteQuery = deleteQuery.eq('id', id);
    } else if (code && year) {
      deleteQuery = deleteQuery.eq('company_code', code.toUpperCase()).eq('fiscal_year', year);
    } else {
      return NextResponse.json({
        success: false,
        error: 'Parameter ID atau (code & year) wajib disertakan.'
      }, { status: 400 });
    }

    const { error } = await deleteQuery;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
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
