'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type SortField = 'item_name' | 'times_ordered' | 'total_spent' | 'total_quantity' | 'avg_unit_price' | 'avg_order_value' | 'units_per_month';
type SortDirection = 'asc' | 'desc';

interface ItemDetail {
  item_name: string;
  times_ordered: number;
  total_spent: number;
  total_quantity: number;
  avg_unit_price: number;
  avg_order_value: number;
  units_per_month: number;
  first_order_date: string;
  last_order_date: string;
}

export default function ItemsDetailPage() {
  const router = useRouter();
  const [items, setItems] = useState<ItemDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'food' | 'grocery'>('all');
  const [dateRange, setDateRange] = useState('365');
  const [sortField, setSortField] = useState<SortField>('total_spent');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  useEffect(() => {
    fetchItems();
  }, [categoryFilter, dateRange]);

  async function fetchItems() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        category: categoryFilter,
        dateRange: dateRange,
      });
      const res = await fetch(`/api/items-detail?${params}`);
      const data = await res.json();
      setItems(data.items || []);
    } catch (err) {
      console.error('Failed to fetch items:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  }

  const sortedItems = [...items].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDirection === 'asc' 
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }
    
    return sortDirection === 'asc' 
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number);
  });

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <span className="text-gray-400">⇅</span>;
    }
    return <span className="text-orange-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
          <p className="mt-4 text-gray-600">Loading items...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => router.push('/')}
                className="text-orange-100 hover:text-white mb-2 flex items-center gap-2"
              >
                ← Back to Dashboard
              </button>
              <h1 className="text-4xl font-bold">Items Detail View</h1>
              <p className="mt-2 text-orange-100">{items.length} items found</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Category Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setCategoryFilter('all')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    categoryFilter === 'all'
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setCategoryFilter('food')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    categoryFilter === 'food'
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Food
                </button>
                <button
                  onClick={() => setCategoryFilter('grocery')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    categoryFilter === 'grocery'
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Grocery
                </button>
              </div>
            </div>

            {/* Date Range Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              >
                <option value="30">Last 30 Days</option>
                <option value="60">Last 60 Days</option>
                <option value="90">Last 90 Days</option>
                <option value="180">Last 6 Months</option>
                <option value="365">Last 1 Year</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    onClick={() => handleSort('item_name')}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-2">
                      Item Name
                      <SortIcon field="item_name" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('times_ordered')}
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center justify-center gap-2">
                      Order Volume
                      <SortIcon field="times_ordered" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('total_spent')}
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center justify-end gap-2">
                      Total Spent
                      <SortIcon field="total_spent" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('total_quantity')}
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center justify-center gap-2">
                      Total Qty
                      <SortIcon field="total_quantity" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('avg_unit_price')}
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center justify-end gap-2">
                      Avg Unit Price
                      <SortIcon field="avg_unit_price" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('avg_order_value')}
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center justify-end gap-2">
                      Avg Order Value
                      <SortIcon field="avg_order_value" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('units_per_month')}
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center justify-center gap-2">
                      Units/Month
                      <SortIcon field="units_per_month" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedItems.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                      {item.item_name}
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-gray-900">
                      {item.times_ordered}
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-semibold text-orange-600">
                      ₹{item.total_spent.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-gray-600">
                      {item.total_quantity}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-600">
                      ₹{item.avg_unit_price.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-600">
                      ₹{item.avg_order_value.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-gray-600">
                      {item.units_per_month.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {items.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">No items found for the selected filters.</p>
            </div>
          )}
        </div>

        {/* Summary Stats */}
        {items.length > 0 && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-600">Total Items</p>
              <p className="text-2xl font-bold text-gray-900">{items.length}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-600">Total Orders</p>
              <p className="text-2xl font-bold text-gray-900">
                {sortedItems.reduce((sum, item) => sum + item.times_ordered, 0)}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-600">Total Spent</p>
              <p className="text-2xl font-bold text-orange-600">
                ₹{sortedItems.reduce((sum, item) => sum + item.total_spent, 0).toFixed(2)}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-600">Avg Item Price</p>
              <p className="text-2xl font-bold text-gray-900">
                ₹{(sortedItems.reduce((sum, item) => sum + item.avg_unit_price, 0) / items.length).toFixed(2)}
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
