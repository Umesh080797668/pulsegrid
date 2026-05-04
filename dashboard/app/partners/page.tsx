import React from 'react';
import Link from 'next/link';
import { Terminal, LayoutDashboard, Zap, Code2, DollarSign, Users, ExternalLink } from 'lucide-react';

export default function PartnersLandingPage() {
  return (
    <div className="max-w-6xl mx-auto py-12 px-4 sm:px-6 lg:px-8 space-y-16">
      
      {/* Hero Section */}
      <section className="text-center space-y-6">
        <h1 className="text-5xl font-extrabold tracking-tight text-gray-900">
          PulseGrid Partner Program
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Embed the PulseGrid SDK in your platform or SaaS and earn <span className="font-semibold text-blue-600">20% MRR</span> for 12 months for every user you bring in. Setup takes 5 minutes.
        </p>
        <div className="flex justify-center gap-4 pt-6">
          <Link 
            href="/partners/dashboard" 
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm transition-all"
          >
            <LayoutDashboard className="w-5 h-5" />
            Partner Dashboard
          </Link>
          <a 
            href="#integration-guide"
            className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-300 hover:border-gray-400 text-gray-700 rounded-lg font-medium shadow-sm transition-all"
          >
            <Code2 className="w-5 h-5" />
            View SDK Docs
          </a>
        </div>
      </section>

      {/* Revenue Share Program Details */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center pt-8 border-t border-gray-200">
        <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="mx-auto w-12 h-12 bg-green-100 text-green-600 flex items-center justify-center rounded-full mb-4">
            <DollarSign className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">20% Revenue Share</h3>
          <p className="text-gray-600">Earn 20% of the Monthly Recurring Revenue for the first 12 months of any paying customer you refer via the SDK.</p>
        </div>
        <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="mx-auto w-12 h-12 bg-blue-100 text-blue-600 flex items-center justify-center rounded-full mb-4">
            <Zap className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Instant Embedding</h3>
          <p className="text-gray-600">Give your users powerful automation dashboards natively within your own app without iframe restrictions.</p>
        </div>
        <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="mx-auto w-12 h-12 bg-purple-100 text-purple-600 flex items-center justify-center rounded-full mb-4">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Automated Payouts</h3>
          <p className="text-gray-600">Track referrals, generated MRR, and commission payouts in real time via our Partner Dashboard.</p>
        </div>
      </section>

      {/* Integration Guide */}
      <section id="integration-guide" className="pt-16 max-w-4xl mx-auto space-y-12">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">SDK Integration Guide</h2>
          <p className="mt-4 text-lg text-gray-600">Native Web Components for every stack. The &lt;pulse-panel&gt; auto-tracks referrals via your Developer API Key.</p>
        </div>

        {/* React / Next.js */}
        <div className="bg-gray-900 rounded-xl overflow-hidden shadow-lg border border-gray-800">
          <div className="bg-gray-800 px-4 py-3 flex items-center gap-2 border-b border-gray-700">
            <Terminal className="w-4 h-4 text-blue-400" />
            <span className="text-gray-200 font-mono text-sm font-semibold">React / Next.js / Remix</span>
          </div>
          <div className="p-6 overflow-x-auto text-sm">
            <pre className="text-gray-300 font-mono">
              <span className="text-gray-500">// 1. Install via npm</span><br/>
              <span className="text-pink-400">npm</span> install @pulsegrid/sdk<br/>
              <br/>
              <span className="text-gray-500">// 2. Import in your top-level component or layout</span><br/>
              <span className="text-purple-400">import</span> <span className="text-yellow-300">"@pulsegrid/sdk"</span>;<br/>
              <br/>
              <span className="text-gray-500">// 3. Render the Component in your React app</span><br/>
              <span className="text-blue-400">export default function</span> <span className="text-yellow-200">App</span>() {`{`}<br/>
              {'  '}<span className="text-purple-400">return</span> (<br/>
              {'    '}<span className="text-gray-500">{`{/* @ts-ignore - React custom elements bypass */}`}</span><br/>
              {'    '}<span className="text-blue-300">&lt;pulse-panel</span><br/>
              {'      '}<span className="text-blue-200">workspace-id</span>=<span className="text-yellow-300">{`"user_workspace_id"`}</span><br/>
              {'      '}<span className="text-blue-200">api-key</span>=<span className="text-yellow-300">{`"your_partner_api_key"`}</span><br/>
              {'      '}<span className="text-blue-200">theme</span>=<span className="text-yellow-300">{`"light"`}</span><br/>
              {'    '}<span className="text-blue-300">&gt;&lt;/pulse-panel&gt;</span><br/>
              {'  '});<br/>
              {`}`}
            </pre>
          </div>
        </div>

        {/* Vue */}
        <div className="bg-gray-900 rounded-xl overflow-hidden shadow-lg border border-gray-800">
          <div className="bg-gray-800 px-4 py-3 flex items-center gap-2 border-b border-gray-700">
            <Terminal className="w-4 h-4 text-green-400" />
            <span className="text-gray-200 font-mono text-sm font-semibold">Vue.js</span>
          </div>
          <div className="p-6 overflow-x-auto text-sm">
            <pre className="text-gray-300 font-mono">
              <span className="text-blue-300">&lt;script</span> <span className="text-blue-200">setup</span><span className="text-blue-300">&gt;</span><br/>
              <span className="text-purple-400">import</span> <span className="text-yellow-300">"@pulsegrid/sdk"</span>;<br/>
              <span className="text-blue-300">&lt;/script&gt;</span><br/>
              <br/>
              <span className="text-blue-300">&lt;template&gt;</span><br/>
              {'  '}<span className="text-blue-300">&lt;pulse-panel</span><br/>
              {'    '}<span className="text-blue-200">:workspace-id</span>=<span className="text-yellow-300">"currentUser.workspaceId"</span><br/>
              {'    '}<span className="text-blue-200">api-key</span>=<span className="text-yellow-300">"PARTNER_KEY"</span><br/>
              {'    '}<span className="text-blue-200">theme</span>=<span className="text-yellow-300">"dark"</span><br/>
              {'  '}<span className="text-blue-300">&gt;&lt;/pulse-panel&gt;</span><br/>
              <span className="text-blue-300">&lt;/template&gt;</span>
            </pre>
          </div>
        </div>

        {/* Plain HTML / Webflow */}
        <div className="bg-gray-900 rounded-xl overflow-hidden shadow-lg border border-gray-800">
          <div className="bg-gray-800 px-4 py-3 flex items-center gap-2 border-b border-gray-700">
            <Terminal className="w-4 h-4 text-orange-400" />
            <span className="text-gray-200 font-mono text-sm font-semibold">HTML / Webflow / Vanilla JS</span>
          </div>
          <div className="p-6 overflow-x-auto text-sm">
            <pre className="text-gray-300 font-mono">
              <span className="text-gray-500">&lt;!-- 1. Include the CDN Script in your &lt;head&gt; or before body close --&gt;</span><br/>
              <span className="text-blue-300">&lt;script</span> <span className="text-blue-200">src</span>=<span className="text-yellow-300">"https://cdn.pulsegrid.io/sdk/v1/pulsegrid-sdk.min.js"</span><span className="text-blue-300">&gt;&lt;/script&gt;</span><br/>
              <br/>
              <span className="text-gray-500">&lt;!-- 2. Render the components directly in HTML --&gt;</span><br/>
              <span className="text-blue-300">&lt;pulse-panel</span><br/>
              {'  '}<span className="text-blue-200">workspace-id</span>=<span className="text-yellow-300">"ws_customer_01"</span><br/>
              {'  '}<span className="text-blue-200">api-key</span>=<span className="text-yellow-300">"pk_partner_01"</span><br/>
              {'  '}<span className="text-blue-200">theme</span>=<span className="text-yellow-300">"light"</span><br/>
              <span className="text-blue-300">&gt;&lt;/pulse-panel&gt;</span><br/>
            </pre>
          </div>
        </div>

      </section>
    </div>
  );
}
