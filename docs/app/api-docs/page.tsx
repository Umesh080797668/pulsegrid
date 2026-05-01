 'use client';

import React from 'react';
import { apiBase } from '../../../dashboard/lib/api';

export default function ApiDocsPage() {
  const docsUrl = `${apiBase}/api-docs`;
  const graphqlUrl = `${apiBase}/graphql`;

  return (
    <div>
      <div className="page-hd">
        <div>
          <div className="page-title">API Docs</div>
          <div className="page-sub">Swagger UI and GraphQL Playground</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
        <div className="card">
          <div className="card-hd"><div className="card-title">Swagger UI</div></div>
          <div style={{ height: '70vh' }}>
            <iframe title="Swagger UI" src={docsUrl} style={{ width: '100%', height: '100%', border: 'none' }} />
          </div>
        </div>

        <div className="card">
          <div className="card-hd"><div className="card-title">GraphQL Explorer</div></div>
          <div style={{ height: '70vh' }}>
            <iframe title="GraphQL" src={graphqlUrl} style={{ width: '100%', height: '100%', border: 'none' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
