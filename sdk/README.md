# @pulsegrid/sdk

The official Vue-based Web Components SDK for PulseGrid. This SDK provides native custom elements mapped from Vue components to allow seamless integration into any web application or SaaS without style bleed, thanks to Shadow DOM isolation.

## Installation

### Via NPM

```bash
npm install @pulsegrid/sdk
```

Then, import the SDK into your application to register the web components:

```javascript
import "@pulsegrid/sdk";
// The web components will be automatically registered
```

### Via CDN (Browser Embed)

You can instantly use the components without a build step by including the script from the PulseGrid CDN:

```html
<script src="https://cdn.pulsegrid.io/sdk/v1/pulsegrid-sdk.min.js"></script>
```

## Usage & Components

All components support `workspace-id`, `api-key`, `api-base-url`, and optional `theme` attributes. The trigger component also accepts `flow-id`.

### 1. Pulse Trigger (`<pulse-trigger>`)
Renders a configurable button that fires a flow via the public API.

```html
<pulse-trigger 
  workspace-id="ws_12345" 
  flow-id="flow_abc123"
  api-key="pk_live_123" 
  api-base-url="https://api.pulsegrid.io"
  theme="light">
  Run Pulse Flow
</pulse-trigger>
```

### 2. Pulse Status (`<pulse-status>`)
Shows the last run status and timestamp.

```html
<pulse-status 
  workspace-id="ws_12345" 
  api-key="pk_live_123" 
  api-base-url="https://api.pulsegrid.io"
  theme="dark">
</pulse-status>
```

### 3. Pulse Panel (`<pulse-panel>`)
Renders the full flow management panel embeddable in any SaaS app.

```html
<pulse-panel 
  workspace-id="ws_12345" 
  api-key="pk_live_123"
  api-base-url="https://api.pulsegrid.io">
</pulse-panel>
```

## API Authentication

The SDK sends the provided `api-key` as both `Authorization: Bearer ...` and `X-API-Key` so it can talk to PulseGrid deployments that validate either header.

## Automated Versioning
This repository uses `semantic-release` to automate version incrementation and NPM publishing. Commits pushed to the `main` branch will automatically trigger a release sequence.

## CDN Distribution
The SDK is packaged via Vite as an optimized (minified) UMD bundle which is automatically distributed to Cloudflare R2 + CDN. The CDN permanently serves the file with blazing speeds across the globe.

