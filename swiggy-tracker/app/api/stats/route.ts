import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Helper function to get week key (YYYY-WW)
function getWeekKey(dateStr: string): string {
  const date = new Date(dateStr);
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  return `${date.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
}

// Helper function to aggregate by period
function aggregateByPeriod(ordersList: any[], period: string) {
  const map = new Map<string, { total: number; food: number; grocery: number; foodCount: number; groceryCount: number }>();
  
  ordersList.forEach(order => {
    let key: string;
    if (period === 'weekly') {
      key = getWeekKey(order.order_date);
    } else if (period === 'monthly') {
      key = order.order_date.substring(0, 7); // YYYY-MM
    } else {
      key = order.order_date; // daily
    }

    const existing = map.get(key) || { total: 0, food: 0, grocery: 0, foodCount: 0, groceryCount: 0 };
    const amount = parseFloat(order.total_amount);
    
    existing.total += amount;
    if (order.category === 'food') {
      existing.food += amount;
      existing.foodCount += 1;
    } else if (order.category === 'grocery') {
      existing.grocery += amount;
      existing.groceryCount += 1;
    }
    
    map.set(key, existing);
  });

  const sorted = Array.from(map.entries())
    .map(([period, data]) => ({
      period,
      amount: data.total,
      food: data.food,
      grocery: data.grocery,
      foodCount: data.foodCount,
      groceryCount: data.groceryCount,
      foodPercent: data.total > 0 ? (data.food / data.total) * 100 : 0,
      groceryPercent: data.total > 0 ? (data.grocery / data.total) * 100 : 0,
      avgOrderFood: data.foodCount > 0 ? data.food / data.foodCount : 0,
      avgOrderGrocery: data.groceryCount > 0 ? data.grocery / data.groceryCount : 0,
    }))
    .sort((a, b) => a.period.localeCompare(b.period));

  // Limit results based on period type
  let limit = sorted.length; // Default: show all
  if (period === 'daily') {
    limit = 14; // Last 14 days
  } else if (period === 'weekly') {
    limit = 12; // Last 12 weeks
  } else if (period === 'monthly') {
    limit = 12; // Last 12 months
  }

  return sorted.slice(-limit); // Take last N periods
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryFilter = searchParams.get('category') || 'all'; // all, food, grocery
    const periodFilter = searchParams.get('period') || 'monthly'; // daily, weekly, monthly

    // Get all orders with items
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, order_id, order_date, category, restaurant_name, store_name, subtotal, delivery_fee, taxes, discounts, total_amount');

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    // Filter by category
    let filteredOrders = orders || [];
    if (categoryFilter !== 'all') {
      filteredOrders = filteredOrders.filter(o => o.category === categoryFilter);
    }

    // Get all items
    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select('order_id, item_name, quantity, total_price');

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    // Basic stats (filtered)
    const totalOrders = filteredOrders.length;
    const totalSpent = filteredOrders.reduce((sum, o) => sum + parseFloat(o.total_amount), 0);
    const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;

    // Category breakdown (always show both for overview)
    const allOrders = orders || [];
    const foodOrders = allOrders.filter(o => o.category === 'food');
    const groceryOrders = allOrders.filter(o => o.category === 'grocery');
    
    const foodSpent = foodOrders.reduce((sum, o) => sum + parseFloat(o.total_amount), 0);
    const grocerySpent = groceryOrders.reduce((sum, o) => sum + parseFloat(o.total_amount), 0);
    // Spending trend (respects both filters)
    const spendingTrend = aggregateByPeriod(filteredOrders, periodFilter);

    // Category split over time (always uses all orders, but respects period)
    const categorySplitTrend = aggregateByPeriod(allOrders, periodFilter);

    // Monthly taxes breakdown by category (always uses all orders)
    const monthlyTaxesMap = new Map<string, { foodTaxes: number; groceryTaxes: number }>();
    allOrders.forEach(order => {
      const month = order.order_date.substring(0, 7); // YYYY-MM
      const existing = monthlyTaxesMap.get(month) || { foodTaxes: 0, groceryTaxes: 0 };
      const taxes = parseFloat(order.taxes);
      
      if (order.category === 'food') {
        existing.foodTaxes += taxes;
      } else if (order.category === 'grocery') {
        existing.groceryTaxes += taxes;
      }
      
      monthlyTaxesMap.set(month, existing);
    });

    const monthlyTaxesTrend = Array.from(monthlyTaxesMap.entries())
      .map(([month, data]) => ({
        month,
        foodTaxes: data.foodTaxes,
        groceryTaxes: data.groceryTaxes,
        totalTaxes: data.foodTaxes + data.groceryTaxes,
      }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12); // Last 12 months

    // Restaurant/Store rankings (respects category filter)
    const vendorMap = new Map<string, { count: number; total: number }>();
    filteredOrders.forEach(order => {
      const vendor = order.restaurant_name || order.store_name || 'Unknown';
      const existing = vendorMap.get(vendor) || { count: 0, total: 0 };
      vendorMap.set(vendor, {
        count: existing.count + 1,
        total: existing.total + parseFloat(order.total_amount),
      });
    });

    const vendorList = Array.from(vendorMap.entries()).map(([vendor, stats]) => ({
      vendor,
      orders: stats.count,
      total_spent: stats.total,
      avg_order: stats.total / stats.count,
    }));

    const topVendorsByVolume = [...vendorList]
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 10);

    const topVendorsBySpend = [...vendorList]
      .sort((a, b) => b.total_spent - a.total_spent)
      .slice(0, 10);

    // Top items (respects category filter)
    const orderIds = new Set(filteredOrders.map(o => o.id));
    const filteredItems = items?.filter(item => orderIds.has(item.order_id)) || [];

    const itemMap = new Map<string, { times_ordered: number; total_spent: number }>();
    filteredItems.forEach(item => {
      const existing = itemMap.get(item.item_name) || { times_ordered: 0, total_spent: 0 };
      itemMap.set(item.item_name, {
        times_ordered: existing.times_ordered + 1,
        total_spent: existing.total_spent + parseFloat(item.total_price),
      });
    });

    const itemList = Array.from(itemMap.entries()).map(([item_name, stats]) => ({
      item_name,
      times_ordered: stats.times_ordered,
      total_spent: stats.total_spent,
    }));

    const topItemsByVolume = [...itemList]
      .sort((a, b) => b.times_ordered - a.times_ordered)
      .slice(0, 10);

    const topItemsBySpend = [...itemList]
      .sort((a, b) => b.total_spent - a.total_spent)
      .slice(0, 10);

    // Cost breakdown (avg per order, respects category filter)
    const avgSubtotal = filteredOrders.reduce((sum, o) => sum + parseFloat(o.subtotal), 0) / totalOrders || 0;
    const avgDelivery = filteredOrders.reduce((sum, o) => sum + (parseFloat(o.delivery_fee || '0')), 0) / totalOrders || 0;
    const avgTaxes = filteredOrders.reduce((sum, o) => sum + parseFloat(o.taxes), 0) / totalOrders || 0;
    const avgDiscounts = filteredOrders.reduce((sum, o) => sum + (parseFloat(o.discounts || '0')), 0) / totalOrders || 0;

    // Recent orders (respects category filter)
    const recentOrders = filteredOrders
      .sort((a, b) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime())
      .slice(0, 10)
      .map(o => ({
        order_id: o.order_id,
        order_date: o.order_date,
        restaurant_name: o.restaurant_name || o.store_name,
        category: o.category,
        total_amount: parseFloat(o.total_amount),
      }));

    return NextResponse.json({
      totalOrders,
      totalSpent,
      avgOrderValue,
      categoryBreakdown: [
        { category: 'food', count: foodOrders.length, amount: foodSpent },
        { category: 'grocery', count: groceryOrders.length, amount: grocerySpent },
      ],
      spendingTrend,
      categorySplitTrend,
      monthlyTaxesTrend,
      topVendorsByVolume,
      topVendorsBySpend,
      topItemsByVolume,
      topItemsBySpend,
      costBreakdown: {
        avgSubtotal,
        avgDelivery,
        avgTaxes,
        avgDiscounts,
      },
      recentOrders,
    });
  } catch (error: any) {
    console.error('Stats API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
