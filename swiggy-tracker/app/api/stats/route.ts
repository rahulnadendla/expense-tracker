import { NextResponse } from 'next/server';
import { computeStatsSnapshot } from '@/lib/compute-stats';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { stats } = await computeStatsSnapshot(searchParams.get('category'), searchParams.get('period'));
    return NextResponse.json(stats, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error: any) {
    console.error('Stats API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
