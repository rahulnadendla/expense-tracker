import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryFilter = searchParams.get('category') || 'all';
    const dateRange = searchParams.get('dateRange') || '365'; // days

    // Calculate date threshold
    const daysAgo = parseInt(dateRange);
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - daysAgo);
    const dateThresholdStr = dateThreshold.toISOString().split('T')[0];

    // Get all orders within date range
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, order_date, category, total_amount')
      .gte('order_date', dateThresholdStr);

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    // Filter by category
    let filteredOrders = orders || [];
    if (categoryFilter !== 'all') {
      filteredOrders = filteredOrders.filter(o => o.category === categoryFilter);
    }

    const orderIds = new Set(filteredOrders.map(o => o.id));

    // Get all items for these orders
    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select('order_id, item_name, quantity, unit_price, total_price');

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    // Filter items to only those in filtered orders
    const filteredItems = items?.filter(item => orderIds.has(item.order_id)) || [];

    // Build order date map
    const orderDateMap = new Map<number, string>();
    filteredOrders.forEach(order => {
      orderDateMap.set(order.id, order.order_date);
    });

    // Calculate metrics per item
    const itemMetrics = new Map<string, {
      times_ordered: number;
      total_spent: number;
      total_quantity: number;
      first_order_date: string;
      last_order_date: string;
      avg_unit_price: number;
      orders_per_month: number;
    }>();

    filteredItems.forEach(item => {
      const orderDate = orderDateMap.get(item.order_id);
      if (!orderDate) return;

      const existing = itemMetrics.get(item.item_name) || {
        times_ordered: 0,
        total_spent: 0,
        total_quantity: 0,
        first_order_date: orderDate,
        last_order_date: orderDate,
        avg_unit_price: 0,
        orders_per_month: 0,
      };

      existing.times_ordered += 1;
      existing.total_spent += parseFloat(item.total_price);
      existing.total_quantity += item.quantity;
      existing.avg_unit_price = existing.total_spent / existing.total_quantity;

      // Update date range
      if (orderDate < existing.first_order_date) {
        existing.first_order_date = orderDate;
      }
      if (orderDate > existing.last_order_date) {
        existing.last_order_date = orderDate;
      }

      itemMetrics.set(item.item_name, existing);
    });

    // Calculate units per month for each item (actual consumption)
    const itemDetailsList = Array.from(itemMetrics.entries()).map(([item_name, metrics]) => {
      const firstDate = new Date(metrics.first_order_date);
      const lastDate = new Date(metrics.last_order_date);
      const daysDiff = Math.max(1, (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
      const monthsSpan = Math.max(1, daysDiff / 30);
      const unitsPerMonth = metrics.total_quantity / monthsSpan;

      return {
        item_name,
        times_ordered: metrics.times_ordered,
        total_spent: metrics.total_spent,
        total_quantity: metrics.total_quantity,
        avg_unit_price: metrics.avg_unit_price,
        avg_order_value: metrics.total_spent / metrics.times_ordered,
        units_per_month: unitsPerMonth,
        first_order_date: metrics.first_order_date,
        last_order_date: metrics.last_order_date,
      };
    });

    return NextResponse.json({
      items: itemDetailsList,
      total_items: itemDetailsList.length,
      date_range_days: daysAgo,
      category: categoryFilter,
    });
  } catch (error: any) {
    console.error('Items detail API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
