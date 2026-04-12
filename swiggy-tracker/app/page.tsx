'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AdminStats } from '@/lib/types';

const COLORS = ['#FC8019', '#E23744', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6'];

function getCurrentIstMonth(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  return `${year}-${month}`;
}

export default function Home() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'analytics' | 'advisor' | 'orders' | 'admin'>('overview');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'food' | 'grocery'>('all');
  const [periodFilter, setPeriodFilter] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminMonth, setAdminMonth] = useState(getCurrentIstMonth());

  useEffect(() => {
    fetchStats();
  }, [categoryFilter, periodFilter]);

  useEffect(() => {
    if (activeTab === 'admin') {
      fetchAdminStats();
    }
  }, [activeTab, adminMonth]);

  async function fetchAdminStats() {
    setAdminLoading(true);
    try {
      const params = new URLSearchParams({ month: adminMonth });
      const res = await fetch(`/api/admin/stats?${params}`, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) setAdminStats(data);
    } catch (err) {
      console.error('Failed to fetch admin stats:', err);
    } finally {
      setAdminLoading(false);
    }
  }

  async function fetchStats() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        category: categoryFilter,
        period: periodFilter,
      });
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      const res = await fetch(`/api/stats?${params}`, { cache: 'no-store', signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
      setStats(null);
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

  if (!stats) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-gray-700 font-medium">Failed to load analytics</p>
          <p className="text-sm text-gray-500 mt-2">The request timed out or the server returned an error. Check your network and that the app is running (e.g. npm run dev).</p>
          <button
            onClick={() => fetchStats()}
            className="mt-4 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
          >
            Retry
          </button>
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 overflow-x-auto">
          <nav className="flex space-x-8 min-w-max">
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
            <button
              onClick={() => setActiveTab('advisor')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'advisor'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              AI Advisor
            </button>
            <button
              onClick={() => setActiveTab('admin')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'admin'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Admin
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
            adminOrdersCount={adminStats?.ordersCount ?? null}
          />
        )}
        {activeTab === 'analytics' && <AnalyticsTab stats={stats} />}
        {activeTab === 'advisor' && (
          <AdvisorTab
            categoryFilter={categoryFilter}
            periodFilter={periodFilter}
          />
        )}
        {activeTab === 'orders' && <OrdersTab stats={stats} adminOrdersCount={adminStats?.ordersCount ?? null} />}
        {activeTab === 'admin' && (
          <AdminTab
            adminStats={adminStats}
            adminLoading={adminLoading}
            adminMonth={adminMonth}
            setAdminMonth={setAdminMonth}
          />
        )}
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
  adminOrdersCount,
}: {
  stats: any;
  categoryFilter: string;
  setCategoryFilter: (v: any) => void;
  periodFilter: string;
  setPeriodFilter: (v: any) => void;
  adminOrdersCount: number | null;
}) {
  const totalOrdersDisplay = categoryFilter === 'all' && adminOrdersCount !== null ? adminOrdersCount : stats.totalOrders;
  return (
    <div className="space-y-8">
      {/* Key Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 mb-1">Total Orders</p>
          <p className="text-3xl font-bold text-gray-900">{totalOrdersDisplay}</p>
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
            <Link
              href="/items"
              className="px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
            >
              View All
            </Link>
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
            <Link
              href="/items"
              className="px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
            >
              View All
            </Link>
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

type AdvisorMessage = {
  role: 'user' | 'assistant';
  content: string;
};

function AdvisorMarkdown({ content }: { content: string }) {
  return (
    <div className="space-y-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border border-gray-300 rounded">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-gray-100">{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr className="border-t border-gray-200">{children}</tr>,
          th: ({ children }) => <th className="px-2 py-1 text-left font-semibold border-r border-gray-200 last:border-r-0">{children}</th>,
          td: ({ children }) => <td className="px-2 py-1 border-r border-gray-200 last:border-r-0 align-top">{children}</td>,
          code: ({ children, className }) => (
            <code className={`px-1 py-0.5 rounded bg-gray-200 text-gray-900 ${className || ''}`}>{children}</code>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function AdvisorTab({
  categoryFilter,
  periodFilter,
}: {
  categoryFilter: 'all' | 'food' | 'grocery';
  periodFilter: 'daily' | 'weekly' | 'monthly';
}) {
  const [messages, setMessages] = useState<AdvisorMessage[]>([
    {
      role: 'assistant',
      content: 'I can help with spending trends, practical savings ideas, and wellness-oriented product choices from your current dashboard data. Ask me a question and I will ask clarifying questions when needed instead of guessing.',
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage() {
    const content = input.trim();
    if (!content || sending) return;

    setError(null);
    setInput('');
    const userMessage: AdvisorMessage = { role: 'user', content };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setSending(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const res = await fetch('/api/analyst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: nextMessages,
          category: categoryFilter,
          period: periodFilter,
        }),
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to get advisor response.');
      }

      const reply = typeof data.reply === 'string' ? data.reply.trim() : '';
      if (!reply) throw new Error('Advisor returned an empty response.');
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (err: any) {
      setError(err?.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  }

  function clearChat() {
    setError(null);
    setMessages([
      {
        role: 'assistant',
        content: 'Chat cleared. Ask me a new question and I will base answers on the currently selected filters.',
      },
    ]);
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6 space-y-3">
        <h2 className="text-xl font-semibold text-gray-900">AI Advisor</h2>
        <p className="text-sm text-gray-600">
          Answers use aggregated dashboard data for your selected filters:
          <span className="font-medium text-gray-900"> {categoryFilter}</span> category and
          <span className="font-medium text-gray-900"> {periodFilter}</span> period.
        </p>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-3">
          Educational information only. This is not professional financial, medical, or nutrition advice.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Conversation</h3>
          <button
            onClick={clearChat}
            disabled={sending}
            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400"
          >
            Clear Chat
          </button>
        </div>

        <div className="p-6 h-[440px] overflow-y-auto space-y-4">
          {messages.map((message, index) => (
            <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                  message.role === 'user'
                    ? 'bg-orange-500 text-white whitespace-pre-wrap'
                    : 'bg-gray-100 text-gray-800 border border-gray-200'
                }`}
              >
                {message.role === 'assistant' ? <AdvisorMarkdown content={message.content} /> : message.content}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-lg px-4 py-3 text-sm bg-gray-100 text-gray-800 border border-gray-200">
                Thinking...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="px-6 pb-6 space-y-3">
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <div className="flex gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Ask about trends, savings ideas, or healthier order choices..."
              className="flex-1 min-h-[64px] max-h-44 resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              disabled={sending}
            />
            <button
              onClick={() => void sendMessage()}
              disabled={sending || !input.trim()}
              className="self-end px-5 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 font-medium"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrdersTab({ stats, adminOrdersCount }: { stats: any; adminOrdersCount: number | null }) {
  const orderCount = adminOrdersCount !== null ? adminOrdersCount : stats.totalOrders;
  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900">All Orders</h2>
        <p className="text-sm text-gray-500 mt-1">{orderCount} orders • ₹{stats.totalSpent.toFixed(2)} total</p>
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

function AdminTab({
  adminStats,
  adminLoading,
  adminMonth,
  setAdminMonth,
}: {
  adminStats: AdminStats | null;
  adminLoading: boolean;
  adminMonth: string;
  setAdminMonth: (month: string) => void;
}) {
  const monthOptions = Array.from({ length: 18 }, (_, idx) => {
    const date = new Date();
    date.setMonth(date.getMonth() - idx);
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    return `${year}-${month}`;
  });

  function formatMonthLabel(month: string): string {
    const [year, mon] = month.split('-').map((value) => Number.parseInt(value, 10));
    const date = new Date(year, mon - 1, 1);
    return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }

  function formatDateTime(value: string | null): string {
    if (!value) return '—';
    return new Date(value).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  function formatDate(value: string | null): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('en-IN', {
      dateStyle: 'medium',
    });
  }

  if (adminLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500"></div>
          <p className="mt-3 text-gray-600">Loading admin stats...</p>
        </div>
      </div>
    );
  }

  if (!adminStats) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
        Failed to load admin stats.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Monthly Pipeline Observability</h2>
            <p className="text-sm text-gray-500 mt-1">
              Metrics for {formatMonthLabel(adminStats.selectedMonth)} (IST month window)
            </p>
          </div>
          <div className="w-full sm:w-64">
            <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
            <select
              value={adminMonth}
              onChange={(e) => setAdminMonth(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {monthOptions.map((month) => (
                <option key={month} value={month}>
                  {formatMonthLabel(month)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {adminStats.reconciliation.isMismatch && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-4">
          <p className="text-sm text-amber-900">
            Reconciliation mismatch for {formatMonthLabel(adminStats.selectedMonth)}: parsed invoices ({adminStats.reconciliation.invoicesParsed}) vs
            orders ({adminStats.reconciliation.ordersCreated}).
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 mb-1">Invoices Uploaded</p>
          <p className="text-3xl font-bold text-gray-900">{adminStats.reconciliation.invoicesUploaded}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 mb-1">Invoices Parsed</p>
          <p className="text-3xl font-bold text-green-600">{adminStats.reconciliation.invoicesParsed}</p>
          <p className="text-xs text-gray-500 mt-1">{adminStats.parsing.successRate.toFixed(1)}% success rate</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 mb-1">Orders Created</p>
          <p className="text-3xl font-bold text-orange-600">{adminStats.reconciliation.ordersCreated}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 mb-1">Parse Failures</p>
          <p className="text-3xl font-bold text-red-600">{adminStats.parsing.failed}</p>
          <p className="text-xs text-gray-500 mt-1">
            Pending: {adminStats.parsing.pending} | Processing: {adminStats.parsing.processing}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6 space-y-3">
          <h3 className="text-lg font-semibold text-gray-900">Category Split (Order Count)</h3>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Food</span>
            <span className="font-semibold text-orange-600">{adminStats.categorySplit.food}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Grocery</span>
            <span className="font-semibold text-green-600">{adminStats.categorySplit.grocery}</span>
          </div>
          <div className="pt-2 border-t border-gray-200 flex items-center justify-between text-sm">
            <span className="text-gray-700 font-medium">Total</span>
            <span className="font-bold text-gray-900">{adminStats.categorySplit.total}</span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 space-y-3">
          <h3 className="text-lg font-semibold text-gray-900">Freshness</h3>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Last invoice uploaded</span>
            <span className="text-gray-900">{formatDateTime(adminStats.freshness.lastInvoiceUploadedAt)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Last invoice parsed</span>
            <span className="text-gray-900">{formatDateTime(adminStats.freshness.lastParsedAt)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Last order date</span>
            <span className="text-gray-900">{formatDate(adminStats.freshness.lastOrderAt)}</span>
          </div>
          <div className="pt-2 border-t border-gray-200">
            <p className={`text-sm font-medium ${adminStats.freshness.isStale ? 'text-amber-700' : 'text-green-700'}`}>
              {adminStats.freshness.staleHours === null
                ? 'No recent parsing activity found for this month.'
                : `Last parse activity is ${adminStats.freshness.staleHours} hours old.`}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Top Failure Reasons</h3>
          {adminStats.parsing.topFailureReasons.length === 0 ? (
            <p className="text-sm text-gray-500">No parsing failures for this month.</p>
          ) : (
            <div className="space-y-2">
              {adminStats.parsing.topFailureReasons.map((reason, idx) => (
                <div key={`${reason.reason}-${idx}`} className="flex items-start justify-between gap-3 text-sm">
                  <p className="text-gray-700 break-words">{reason.reason}</p>
                  <span className="font-semibold text-red-600">{reason.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Last Parsed Invoice</h3>
          {adminStats.lastParsedInvoice ? (
            <>
              <p className="text-base font-semibold text-gray-900">
                {formatDateTime(adminStats.lastParsedInvoice.parsed_at)}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Status: <span className="font-medium capitalize text-gray-700">{adminStats.lastParsedInvoice.parsed_status}</span>
              </p>
              {adminStats.lastParsedInvoice.file_name && (
                <p className="text-sm text-gray-500 mt-1 truncate" title={adminStats.lastParsedInvoice.file_name}>
                  {adminStats.lastParsedInvoice.file_name}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500">No invoices parsed in this month.</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Failed Parsing Logs</h2>
          <p className="text-sm text-gray-500 mt-1">Timestamps and failure reasons for {formatMonthLabel(adminStats.selectedMonth)}</p>
        </div>
        <div className="overflow-x-auto">
          {adminStats.failedParsingLogs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No failed parsing logs for this month.</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">File</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Failure reason</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {adminStats.failedParsingLogs.map((log, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(log.created_at).toLocaleString('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {log.order_date
                        ? new Date(log.order_date).toLocaleDateString('en-IN', { dateStyle: 'medium' })
                        : '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate" title={log.file_name ?? undefined}>
                      {log.file_name ?? '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-red-600">{log.error_message ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
