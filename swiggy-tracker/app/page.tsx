'use client';

import { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#FC8019', '#E23744', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6'];

export default function Home() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'analytics' | 'orders'>('overview');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'food' | 'grocery'>('all');
  const [periodFilter, setPeriodFilter] = useState<'daily' | 'weekly' | 'monthly'>('monthly');

  useEffect(() => {
    fetchStats();
  }, [categoryFilter, periodFilter]);

  async function fetchStats() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        category: categoryFilter,
        period: periodFilter,
      });
      const res = await fetch(`/api/stats?${params}`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  }

  async function triggerParsing() {
    setParsing(true);
    try {
      await fetch('/api/parse-invoices');
      await fetchStats();
    } catch (err) {
      console.error('Failed to parse:', err);
    } finally {
      setParsing(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
          <p className="mt-4 text-gray-600">Loading analytics...</p>
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
              <h1 className="text-4xl font-bold">Swiggy Expense Tracker</h1>
              <p className="mt-2 text-orange-100">Track and analyze your food delivery spending</p>
            </div>
            <button
              onClick={triggerParsing}
              disabled={parsing}
              className="px-6 py-3 bg-white text-orange-600 rounded-lg hover:bg-orange-50 disabled:bg-gray-200 disabled:text-gray-400 font-semibold shadow-lg transition-colors"
            >
              {parsing ? 'Parsing...' : 'Parse New Invoices'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'analytics'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Analytics
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'orders'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Orders
            </button>
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <OverviewTab
            stats={stats}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            periodFilter={periodFilter}
            setPeriodFilter={setPeriodFilter}
          />
        )}
        {activeTab === 'analytics' && <AnalyticsTab stats={stats} />}
        {activeTab === 'orders' && <OrdersTab stats={stats} />}
      </div>
    </main>
  );
}

function OverviewTab({
  stats,
  categoryFilter,
  setCategoryFilter,
  periodFilter,
  setPeriodFilter,
}: {
  stats: any;
  categoryFilter: string;
  setCategoryFilter: (v: any) => void;
  periodFilter: string;
  setPeriodFilter: (v: any) => void;
}) {
  return (
    <div className="space-y-8">
      {/* Key Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 mb-1">Total Orders</p>
          <p className="text-3xl font-bold text-gray-900">{stats.totalOrders}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 mb-1">Total Spent</p>
          <p className="text-3xl font-bold text-orange-600">₹{stats.totalSpent.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 mb-1">Avg Order</p>
          <p className="text-3xl font-bold text-gray-900">₹{stats.avgOrderValue.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 mb-1">Food Orders</p>
          <p className="text-3xl font-bold text-orange-500">
            {stats.categoryBreakdown.find((c: any) => c.category === 'food')?.count || 0}
          </p>
          {stats.categoryBreakdown.find((c: any) => c.category === 'grocery')?.count > 0 && (
            <p className="text-sm text-gray-500 mt-1">
              Grocery: {stats.categoryBreakdown.find((c: any) => c.category === 'grocery')?.count}
            </p>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col sm:flex-row gap-6">
          {/* Category Filter */}
          <div className="flex-1">
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

          {/* Period Filter */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Time Period</label>
            <div className="flex gap-2">
              <button
                onClick={() => setPeriodFilter('daily')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  periodFilter === 'daily'
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Daily
              </button>
              <button
                onClick={() => setPeriodFilter('weekly')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  periodFilter === 'weekly'
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Weekly
              </button>
              <button
                onClick={() => setPeriodFilter('monthly')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  periodFilter === 'monthly'
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Monthly
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Spending Trend */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Spending Over Time
          {categoryFilter !== 'all' && (
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({categoryFilter === 'food' ? 'Food only' : 'Grocery only'})
            </span>
          )}
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={stats.spendingTrend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" />
            <YAxis />
            <Tooltip formatter={(value) => `₹${Number(value).toFixed(2)}`} />
            <Legend />
            <Line type="monotone" dataKey="amount" name="Total Spent" stroke="#FC8019" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Category Split (Stacked Bar Chart - only show when "All" is selected) */}
      {categoryFilter === 'all' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Food vs Grocery Split (%)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stats.categorySplitTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} />
              <Legend />
              <Bar dataKey="foodPercent" stackId="a" fill="#FC8019" name="Food %" />
              <Bar dataKey="groceryPercent" stackId="a" fill="#10B981" name="Grocery %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Average Order Value Trend */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Average Order Value Trend</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={stats.categorySplitTrend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" />
            <YAxis />
            <Tooltip formatter={(value) => `₹${Number(value).toFixed(2)}`} />
            <Legend />
            {categoryFilter !== 'grocery' && (
              <Line
                type="monotone"
                dataKey="avgOrderFood"
                name="Avg Order (Food)"
                stroke="#FC8019"
                strokeWidth={2}
              />
            )}
            {categoryFilter !== 'food' && (
              <Line
                type="monotone"
                dataKey="avgOrderGrocery"
                name="Avg Order (Grocery)"
                stroke="#10B981"
                strokeWidth={2}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Top Items and Restaurants - By Volume */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Items by Volume */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Top Items (by Volume)</h2>
              <p className="text-xs text-gray-500 mt-1">Most frequently ordered</p>
            </div>
            <a
              href="/items"
              className="px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
            >
              View All
            </a>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {stats.topItemsByVolume.slice(0, 5).map((item: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 text-sm">{item.item_name}</p>
                    <p className="text-xs text-gray-500">Ordered {item.times_ordered}x</p>
                  </div>
                  <p className="text-sm font-semibold text-orange-600">₹{item.total_spent.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Restaurants by Volume */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Top Restaurants (by Volume)</h2>
            <p className="text-xs text-gray-500 mt-1">Most orders placed</p>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {stats.topVendorsByVolume.slice(0, 5).map((vendor: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 text-sm">{vendor.vendor}</p>
                    <p className="text-xs text-gray-500">{vendor.orders} orders • Avg ₹{vendor.avg_order.toFixed(0)}</p>
                  </div>
                  <p className="text-sm font-semibold text-orange-600">₹{vendor.total_spent.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Top Items and Restaurants - By Spend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Items by Spend */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Top Items (by Spend)</h2>
              <p className="text-xs text-gray-500 mt-1">Highest total spending</p>
            </div>
            <a
              href="/items"
              className="px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
            >
              View All
            </a>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {stats.topItemsBySpend.slice(0, 5).map((item: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 text-sm">{item.item_name}</p>
                    <p className="text-xs text-gray-500">Ordered {item.times_ordered}x</p>
                  </div>
                  <p className="text-sm font-semibold text-orange-600">₹{item.total_spent.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Restaurants by Spend */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Top Restaurants (by Spend)</h2>
            <p className="text-xs text-gray-500 mt-1">Highest total spending</p>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {stats.topVendorsBySpend.slice(0, 5).map((vendor: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 text-sm">{vendor.vendor}</p>
                    <p className="text-xs text-gray-500">{vendor.orders} orders • Avg ₹{vendor.avg_order.toFixed(0)}</p>
                  </div>
                  <p className="text-sm font-semibold text-orange-600">₹{vendor.total_spent.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalyticsTab({ stats }: { stats: any }) {
  const pieData = stats.categoryBreakdown
    .filter((c: any) => c.count > 0)
    .map((c: any) => ({
      name: c.category === 'food' ? 'Food' : 'Grocery',
      value: c.amount,
      count: c.count,
    }));

  return (
    <div className="space-y-8">
      {/* Monthly Comparison */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Monthly Spending</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={stats.categorySplitTrend.filter((d: any) => d.period.length === 7)}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" />
            <YAxis />
            <Tooltip formatter={(value) => `₹${Number(value).toFixed(2)}`} />
            <Bar dataKey="amount" fill="#FC8019" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly Taxes Breakdown */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Monthly Taxes Paid (Food vs Grocery)</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={stats.monthlyTaxesTrend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip formatter={(value) => `₹${Number(value).toFixed(2)}`} />
            <Legend />
            <Bar dataKey="foodTaxes" stackId="taxes" fill="#FC8019" name="Food Taxes" />
            <Bar dataKey="groceryTaxes" stackId="taxes" fill="#10B981" name="Grocery Taxes" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Category Split and Cost Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Pie */}
        {pieData.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Food vs Grocery</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `₹${Number(value).toFixed(2)}`} />
              </PieChart>
            </ResponsiveContainer>
            {pieData.length === 1 && (
              <p className="text-center text-sm text-gray-500 mt-2">
                Grocery data will appear when Instamart orders are parsed
              </p>
            )}
          </div>
        )}

        {/* Cost Breakdown */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Average Cost Breakdown</h2>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-gray-600">Subtotal</span>
                <span className="text-sm font-semibold">₹{stats.costBreakdown.avgSubtotal.toFixed(2)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-orange-500 h-2 rounded-full"
                  style={{ width: `${(stats.costBreakdown.avgSubtotal / stats.avgOrderValue) * 100}%` }}
                ></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-gray-600">Delivery Fees</span>
                <span className="text-sm font-semibold">₹{stats.costBreakdown.avgDelivery.toFixed(2)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-red-500 h-2 rounded-full"
                  style={{ width: `${(stats.costBreakdown.avgDelivery / stats.avgOrderValue) * 100}%` }}
                ></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-gray-600">Taxes</span>
                <span className="text-sm font-semibold">₹{stats.costBreakdown.avgTaxes.toFixed(2)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-yellow-500 h-2 rounded-full"
                  style={{ width: `${(stats.costBreakdown.avgTaxes / stats.avgOrderValue) * 100}%` }}
                ></div>
              </div>
            </div>
            {stats.costBreakdown.avgDiscounts > 0 && (
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-gray-600">Discounts</span>
                  <span className="text-sm font-semibold text-green-600">-₹{stats.costBreakdown.avgDiscounts.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* All Top Items */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Most Ordered Items</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stats.topItemsByVolume.map((item: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div className="flex-1">
                  <p className="font-medium text-gray-900 text-sm">{item.item_name}</p>
                  <p className="text-xs text-gray-500">Ordered {item.times_ordered} times</p>
                </div>
                <p className="text-sm font-semibold text-orange-600">₹{item.total_spent.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Restaurant Rankings Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">All Restaurants Ranked</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rank</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Restaurant/Store</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Orders</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Spent</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Order</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stats.topVendorsByVolume.map((vendor: any, idx: number) => (
                <tr key={idx}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">#{idx + 1}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{vendor.vendor}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-500">{vendor.orders}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-orange-600">
                    ₹{vendor.total_spent.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">
                    ₹{vendor.avg_order.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function OrdersTab({ stats }: { stats: any }) {
  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900">All Orders</h2>
        <p className="text-sm text-gray-500 mt-1">{stats.totalOrders} orders • ₹{stats.totalSpent.toFixed(2)} total</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Restaurant/Store</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Category</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {stats.recentOrders.map((order: any, idx: number) => (
              <tr key={idx} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-mono">
                  {order.order_id}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(order.order_date).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">{order.restaurant_name || 'N/A'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <span className={`px-2 py-1 text-xs font-semibold rounded ${
                    order.category === 'food' ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'
                  }`}>
                    {order.category}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-orange-600">
                  ₹{order.total_amount.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
