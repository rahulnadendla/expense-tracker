import { supabase } from '@/lib/supabase';

export type CategoryFilter = 'all' | 'food' | 'grocery';
export type PeriodFilter = 'daily' | 'weekly' | 'monthly';

type OrderRow = {
  id: string;
  order_id: string;
  order_date: string;
  category: 'food' | 'grocery';
  restaurant_name: string | null;
  store_name: string | null;
  subtotal: string;
  delivery_fee: string | null;
  taxes: string;
  discounts: string | null;
  total_amount: string;
};

type OrderItemRow = {
  order_id: string;
  item_name: string;
  quantity: number;
  total_price: string;
};

type PeriodPoint = {
  period: string;
  amount: number;
  food: number;
  grocery: number;
  foodCount: number;
  groceryCount: number;
  foodPercent: number;
  groceryPercent: number;
  avgOrderFood: number;
  avgOrderGrocery: number;
};

export type StatsSnapshot = {
  totalOrders: number;
  totalSpent: number;
  avgOrderValue: number;
  categoryBreakdown: { category: 'food' | 'grocery'; count: number; amount: number }[];
  spendingTrend: PeriodPoint[];
  categorySplitTrend: PeriodPoint[];
  monthlyTaxesTrend: { month: string; foodTaxes: number; groceryTaxes: number; totalTaxes: number }[];
  topVendorsByVolume: { vendor: string; orders: number; total_spent: number; avg_order: number }[];
  topVendorsBySpend: { vendor: string; orders: number; total_spent: number; avg_order: number }[];
  topItemsByVolume: { item_name: string; times_ordered: number; total_spent: number }[];
  topItemsBySpend: { item_name: string; times_ordered: number; total_spent: number }[];
  costBreakdown: { avgSubtotal: number; avgDelivery: number; avgTaxes: number; avgDiscounts: number };
  recentOrders: {
    order_id: string;
    order_date: string;
    restaurant_name: string | null;
    category: 'food' | 'grocery';
    total_amount: number;
  }[];
};

function toAmount(value: string | null | undefined): number {
  const parsed = Number.parseFloat(value || '0');
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCategoryFilter(categoryFilter: string | null | undefined): CategoryFilter {
  if (categoryFilter === 'food' || categoryFilter === 'grocery') {
    return categoryFilter;
  }
  return 'all';
}

function normalizePeriodFilter(periodFilter: string | null | undefined): PeriodFilter {
  if (periodFilter === 'daily' || periodFilter === 'weekly') {
    return periodFilter;
  }
  return 'monthly';
}

// Helper function to get week key (YYYY-WW)
function getWeekKey(dateStr: string): string {
  const date = new Date(dateStr);
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  return `${date.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
}

function aggregateByPeriod(ordersList: OrderRow[], period: PeriodFilter): PeriodPoint[] {
  const map = new Map<string, { total: number; food: number; grocery: number; foodCount: number; groceryCount: number }>();

  ordersList.forEach((order) => {
    let key: string;
    if (period === 'weekly') {
      key = getWeekKey(order.order_date);
    } else if (period === 'monthly') {
      key = order.order_date.substring(0, 7);
    } else {
      key = order.order_date;
    }

    const existing = map.get(key) || { total: 0, food: 0, grocery: 0, foodCount: 0, groceryCount: 0 };
    const amount = toAmount(order.total_amount);

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
    .map(([periodKey, data]) => ({
      period: periodKey,
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

  let limit = sorted.length;
  if (period === 'daily') {
    limit = 14;
  } else if (period === 'weekly' || period === 'monthly') {
    limit = 12;
  }

  return sorted.slice(-limit);
}

export async function computeStatsSnapshot(
  categoryInput: string | null | undefined,
  periodInput: string | null | undefined
): Promise<{ stats: StatsSnapshot; categoryFilter: CategoryFilter; periodFilter: PeriodFilter }> {
  const categoryFilter = normalizeCategoryFilter(categoryInput);
  const periodFilter = normalizePeriodFilter(periodInput);

  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, order_id, order_date, category, restaurant_name, store_name, subtotal, delivery_fee, taxes, discounts, total_amount');

  if (ordersError) {
    throw new Error(ordersError.message);
  }

  const allOrders = (orders || []) as OrderRow[];
  let filteredOrders = allOrders;
  if (categoryFilter !== 'all') {
    filteredOrders = allOrders.filter((order) => order.category === categoryFilter);
  }

  let totalOrders: number;
  if (categoryFilter === 'all') {
    const { count: exactCount, error: countError } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true });
    const countNum = typeof exactCount === 'number' && !Number.isNaN(exactCount) ? exactCount : null;
    totalOrders = !countError && countNum !== null ? countNum : filteredOrders.length;
  } else {
    totalOrders = filteredOrders.length;
  }

  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .select('order_id, item_name, quantity, total_price');

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  const itemRows = (items || []) as OrderItemRow[];
  const totalSpent = filteredOrders.reduce((sum, order) => sum + toAmount(order.total_amount), 0);
  const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;

  const foodOrders = allOrders.filter((order) => order.category === 'food');
  const groceryOrders = allOrders.filter((order) => order.category === 'grocery');
  const foodSpent = foodOrders.reduce((sum, order) => sum + toAmount(order.total_amount), 0);
  const grocerySpent = groceryOrders.reduce((sum, order) => sum + toAmount(order.total_amount), 0);

  const spendingTrend = aggregateByPeriod(filteredOrders, periodFilter);
  const categorySplitTrend = aggregateByPeriod(allOrders, periodFilter);

  const monthlyTaxesMap = new Map<string, { foodTaxes: number; groceryTaxes: number }>();
  allOrders.forEach((order) => {
    const month = order.order_date.substring(0, 7);
    const existing = monthlyTaxesMap.get(month) || { foodTaxes: 0, groceryTaxes: 0 };
    const taxes = toAmount(order.taxes);

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
    .slice(-12);

  const vendorMap = new Map<string, { count: number; total: number }>();
  filteredOrders.forEach((order) => {
    const vendor = order.restaurant_name || order.store_name || 'Unknown';
    const existing = vendorMap.get(vendor) || { count: 0, total: 0 };
    vendorMap.set(vendor, {
      count: existing.count + 1,
      total: existing.total + toAmount(order.total_amount),
    });
  });

  const vendorList = Array.from(vendorMap.entries()).map(([vendor, stats]) => ({
    vendor,
    orders: stats.count,
    total_spent: stats.total,
    avg_order: stats.total / stats.count,
  }));

  const topVendorsByVolume = [...vendorList].sort((a, b) => b.orders - a.orders).slice(0, 10);
  const topVendorsBySpend = [...vendorList].sort((a, b) => b.total_spent - a.total_spent).slice(0, 10);

  const orderIds = new Set(filteredOrders.map((order) => order.id));
  const filteredItems = itemRows.filter((item) => orderIds.has(item.order_id));

  const itemMap = new Map<string, { times_ordered: number; total_spent: number }>();
  filteredItems.forEach((item) => {
    const existing = itemMap.get(item.item_name) || { times_ordered: 0, total_spent: 0 };
    itemMap.set(item.item_name, {
      times_ordered: existing.times_ordered + 1,
      total_spent: existing.total_spent + toAmount(item.total_price),
    });
  });

  const itemList = Array.from(itemMap.entries()).map(([item_name, stats]) => ({
    item_name,
    times_ordered: stats.times_ordered,
    total_spent: stats.total_spent,
  }));

  const topItemsByVolume = [...itemList].sort((a, b) => b.times_ordered - a.times_ordered).slice(0, 10);
  const topItemsBySpend = [...itemList].sort((a, b) => b.total_spent - a.total_spent).slice(0, 10);

  const avgSubtotal = (filteredOrders.reduce((sum, order) => sum + toAmount(order.subtotal), 0) / totalOrders) || 0;
  const avgDelivery = (filteredOrders.reduce((sum, order) => sum + toAmount(order.delivery_fee), 0) / totalOrders) || 0;
  const avgTaxes = (filteredOrders.reduce((sum, order) => sum + toAmount(order.taxes), 0) / totalOrders) || 0;
  const avgDiscounts = (filteredOrders.reduce((sum, order) => sum + toAmount(order.discounts), 0) / totalOrders) || 0;

  const recentOrders = [...filteredOrders]
    .sort((a, b) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime())
    .slice(0, 10)
    .map((order) => ({
      order_id: order.order_id,
      order_date: order.order_date,
      restaurant_name: order.restaurant_name || order.store_name,
      category: order.category,
      total_amount: toAmount(order.total_amount),
    }));

  const stats: StatsSnapshot = {
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
  };

  return { stats, categoryFilter, periodFilter };
}
