import { NextResponse } from 'next/server';

type EventPayload = {
  type?: string;
  table?: string;
  record?: {
    id?: string;
  };
};

export async function POST(request: Request) {
  try {
    const expectedSecret = process.env.PARSE_TRIGGER_SECRET;
    if (!expectedSecret) {
      console.error('Missing PARSE_TRIGGER_SECRET for event ingest route');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: 'Unauthorized request' }, { status: 401 });
    }

    const payload = (await request.json().catch(() => ({}))) as EventPayload;
    if (payload.table !== 'invoices_raw') {
      return NextResponse.json({ error: 'Unsupported table event' }, { status: 400 });
    }
    if (payload.type !== 'INSERT') {
      return NextResponse.json({ error: 'Unsupported event type' }, { status: 400 });
    }
    if (!payload.record?.id) {
      return NextResponse.json({ error: 'Missing record identifier' }, { status: 400 });
    }

    const parseResponse = await fetch(`${new URL(request.url).origin}/api/parse-invoices`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${expectedSecret}`,
        'x-parse-source': 'auto',
      },
      cache: 'no-store',
    });

    if (!parseResponse.ok) {
      console.error('Event-triggered parse failed with status:', parseResponse.status);
      return NextResponse.json({ error: 'Failed to trigger parser' }, { status: 502 });
    }

    const parsePayload = await parseResponse.json();
    return NextResponse.json({
      message: 'Event accepted',
      event: {
        type: payload.type ?? 'unknown',
        table: payload.table ?? 'invoices_raw',
        invoiceId: payload.record?.id ?? null,
      },
      parse: parsePayload,
    });
  } catch (error) {
    console.error('Event ingest route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
