import React from 'react';
import { DollarSign, Users, Activity, ExternalLink, Link as LinkIcon, Info } from 'lucide-react';
import Link from 'next/link';

export default function PartnerDashboard() {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Partner Dashboard</h1>
          <p className="text-gray-600 mt-1">Manage your SDK embeds and track your earnings.</p>
        </div>
        <Link 
          href="/partners" 
          className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 transition"
        >
          View Documentation
        </Link>
      </div>

      {/* Your SDK Embed Credentials */}
      <div className="p-6 bg-blue-50 border border-blue-100 rounded-xl">
        <h2 className="text-lg font-semibold text-blue-900 flex items-center gap-2">
          <LinkIcon className="w-5 h-5" />
          Your Partner Credentials
        </h2>
        <p className="text-sm text-blue-700 mt-1">
          Use this API key when mounting the &lt;pulse-panel&gt; SDK to automatically tag referrals to your partner account.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <code className="px-4 py-2 bg-white text-gray-800 rounded border border-blue-200 font-mono text-sm shadow-sm flex-1 max-w-md">
            pk_partner_9f8xyz_e2a1
          </code>
          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded shadow-sm transition">
            Copy Key
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Referred Users</p>
            <p className="text-2xl font-bold text-gray-900">42</p>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Active Workspaces</p>
            <p className="text-2xl font-bold text-gray-900">38</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">30-Day Earnings</p>
            <p className="text-2xl font-bold text-gray-900">$1,240.00</p>
          </div>
        </div>
      </div>

      {/* Referrals Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">Recent Referrals</h2>
          <div className="text-sm text-gray-500 flex items-center gap-1">
            <Info className="w-4 h-4" />
            Earning 20% MRR for 12 months
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">User / Workspace</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Joined via SDK</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Current MRR</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Your Cut (20%)</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              <tr className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-medium text-gray-900">AlphaCorp Store</td>
                <td className="px-6 py-4 text-sm text-gray-500">Oct 12, 2026</td>
                <td className="px-6 py-4 text-sm text-gray-900">$149.00</td>
                <td className="px-6 py-4 text-sm text-green-600 font-medium">$29.80 / mo</td>
                <td className="px-6 py-4 text-right">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Active
                  </span>
                </td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-medium text-gray-900">Beta Commerce</td>
                <td className="px-6 py-4 text-sm text-gray-500">Oct 05, 2026</td>
                <td className="px-6 py-4 text-sm text-gray-900">$299.00</td>
                <td className="px-6 py-4 text-sm text-green-600 font-medium">$59.80 / mo</td>
                <td className="px-6 py-4 text-right">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Active
                  </span>
                </td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-medium text-gray-900">Gamma Retail</td>
                <td className="px-6 py-4 text-sm text-gray-500">Sep 28, 2026</td>
                <td className="px-6 py-4 text-sm text-gray-900">$49.00</td>
                <td className="px-6 py-4 text-sm text-green-600 font-medium">$9.80 / mo</td>
                <td className="px-6 py-4 text-right">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Active
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
