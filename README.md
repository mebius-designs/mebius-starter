# mebius starter: 10 charts and 10 forms for shadcn/ui

Twenty animated React 19 + Tailwind CSS v4 components from [mebius.design](https://www.mebius.design), open source
under the MIT license: 10 chart cards and 10 forms, each one file you install with the shadcn CLI, no account and no
token. Each one is designed in Figma first and animated with anime.js.

[Browse the charts](https://www.mebius.design/freebies/charts) · [Browse the forms](https://www.mebius.design/freebies/forms) · [License](LICENSE)

## Install

In a React 19 project with Tailwind CSS v4 and a `components.json` (run `npx shadcn@latest init` first if it has none),
add an item by its URL:

```bash
npx shadcn@latest add https://www.mebius.design/r/charts-ethereum.json
```

The CLI writes the item to `components/`, with the small UI parts, hooks, helpers, fonts and theme variables it uses.
Then render it:

```tsx
import { EthereumChart } from "@/components/ethereum-chart"

export default function Page() {
  return <EthereumChart />
}
```

Every item ships with sample data, and its props are typed and documented in the file: swap the sample for your own.
Works in the Next.js App Router, Vite and any other React 19 setup with the shadcn `@/` aliases.

To install by name instead, add the registry to your `components.json` (as in [the example](components.json)):

```json
{
  "registries": {
    "@mebius": "https://www.mebius.design/r/{name}.json"
  }
}
```

```bash
npx shadcn@latest add @mebius/charts-ethereum @mebius/forms-invoice
```

Each item page also has an **Open in v0** button that opens the item in [v0](https://v0.dev).

## The 20 items

<!-- generated:items -->
### Charts

| Preview | Item | Install |
| --- | --- | --- |
| [<img src="https://www.mebius.design/kits/charts/previews/charts-ethereum.webp" width="240" alt="Ethereum Chart preview">](https://www.mebius.design/freebies/charts/ethereum) | [Ethereum Chart](https://www.mebius.design/freebies/charts/ethereum)<br>`components/ethereum-chart.tsx` | `npx shadcn@latest add https://www.mebius.design/r/charts-ethereum.json` |
| [<img src="https://www.mebius.design/kits/charts/previews/charts-category-breakdown.webp" width="240" alt="Category Breakdown Chart preview">](https://www.mebius.design/freebies/charts/category-breakdown) | [Category Breakdown Chart](https://www.mebius.design/freebies/charts/category-breakdown)<br>`components/category-breakdown-chart.tsx` | `npx shadcn@latest add https://www.mebius.design/r/charts-category-breakdown.json` |
| [<img src="https://www.mebius.design/kits/charts/previews/charts-financial-trends.webp" width="240" alt="Financial Trends Chart preview">](https://www.mebius.design/freebies/charts/financial-trends) | [Financial Trends Chart](https://www.mebius.design/freebies/charts/financial-trends)<br>`components/financial-trends-chart.tsx` | `npx shadcn@latest add https://www.mebius.design/r/charts-financial-trends.json` |
| [<img src="https://www.mebius.design/kits/charts/previews/charts-asset-allocation.webp" width="240" alt="Asset Allocation Chart preview">](https://www.mebius.design/freebies/charts/asset-allocation) | [Asset Allocation Chart](https://www.mebius.design/freebies/charts/asset-allocation)<br>`components/asset-allocation-chart.tsx` | `npx shadcn@latest add https://www.mebius.design/r/charts-asset-allocation.json` |
| [<img src="https://www.mebius.design/kits/charts/previews/charts-asset-overview-bar.webp" width="240" alt="Asset Overview Bar Chart preview">](https://www.mebius.design/freebies/charts/asset-overview-bar) | [Asset Overview Bar Chart](https://www.mebius.design/freebies/charts/asset-overview-bar)<br>`components/asset-overview-bar-chart.tsx` | `npx shadcn@latest add https://www.mebius.design/r/charts-asset-overview-bar.json` |
| [<img src="https://www.mebius.design/kits/charts/previews/charts-expenses.webp" width="240" alt="Expenses Chart preview">](https://www.mebius.design/freebies/charts/expenses) | [Expenses Chart](https://www.mebius.design/freebies/charts/expenses)<br>`components/expenses-chart.tsx` | `npx shadcn@latest add https://www.mebius.design/r/charts-expenses.json` |
| [<img src="https://www.mebius.design/kits/charts/previews/charts-finance-overview-timeline.webp" width="240" alt="Finance Overview Timeline Chart preview">](https://www.mebius.design/freebies/charts/finance-overview-timeline) | [Finance Overview Timeline Chart](https://www.mebius.design/freebies/charts/finance-overview-timeline)<br>`components/finance-overview-timeline-chart.tsx` | `npx shadcn@latest add https://www.mebius.design/r/charts-finance-overview-timeline.json` |
| [<img src="https://www.mebius.design/kits/charts/previews/charts-income-overview.webp" width="240" alt="Income Overview Chart preview">](https://www.mebius.design/freebies/charts/income-overview) | [Income Overview Chart](https://www.mebius.design/freebies/charts/income-overview)<br>`components/income-overview-chart.tsx` | `npx shadcn@latest add https://www.mebius.design/r/charts-income-overview.json` |
| [<img src="https://www.mebius.design/kits/charts/previews/charts-revenue-overview.webp" width="240" alt="Revenue Overview Chart preview">](https://www.mebius.design/freebies/charts/revenue-overview) | [Revenue Overview Chart](https://www.mebius.design/freebies/charts/revenue-overview)<br>`components/revenue-overview-chart.tsx` | `npx shadcn@latest add https://www.mebius.design/r/charts-revenue-overview.json` |
| [<img src="https://www.mebius.design/kits/charts/previews/charts-total-expenses.webp" width="240" alt="Total Expenses Chart preview">](https://www.mebius.design/freebies/charts/total-expenses) | [Total Expenses Chart](https://www.mebius.design/freebies/charts/total-expenses)<br>`components/total-expenses-chart.tsx` | `npx shadcn@latest add https://www.mebius.design/r/charts-total-expenses.json` |

### Forms

| Preview | Item | Install |
| --- | --- | --- |
| [<img src="https://www.mebius.design/kits/forms/previews/forms-invoice.webp" width="240" alt="Invoice Form preview">](https://www.mebius.design/freebies/forms/invoice) | [Invoice Form](https://www.mebius.design/freebies/forms/invoice)<br>`components/invoice-form.tsx` | `npx shadcn@latest add https://www.mebius.design/r/forms-invoice.json` |
| [<img src="https://www.mebius.design/kits/forms-pro/previews/forms-pro-session-scheduling.webp" width="240" alt="Schedule a Session Form preview">](https://www.mebius.design/freebies/forms/session-scheduling) | [Schedule a Session Form](https://www.mebius.design/freebies/forms/session-scheduling)<br>`components/session-scheduling-form.tsx` | `npx shadcn@latest add https://www.mebius.design/r/forms-pro-session-scheduling.json` |
| [<img src="https://www.mebius.design/kits/forms-pro/previews/forms-pro-terminal-workspace.webp" width="240" alt="Create a Workspace Form preview">](https://www.mebius.design/freebies/forms/terminal-workspace) | [Create a Workspace Form](https://www.mebius.design/freebies/forms/terminal-workspace)<br>`components/terminal-workspace-form.tsx` | `npx shadcn@latest add https://www.mebius.design/r/forms-pro-terminal-workspace.json` |
| [<img src="https://www.mebius.design/kits/forms-pro/previews/forms-pro-new-product.webp" width="240" alt="New Product Form preview">](https://www.mebius.design/freebies/forms/new-product) | [New Product Form](https://www.mebius.design/freebies/forms/new-product)<br>`components/new-product-form.tsx` | `npx shadcn@latest add https://www.mebius.design/r/forms-pro-new-product.json` |
| [<img src="https://www.mebius.design/kits/forms-pro/previews/forms-pro-mural-booking.webp" width="240" alt="Paint a Wall Form preview">](https://www.mebius.design/freebies/forms/mural-booking) | [Paint a Wall Form](https://www.mebius.design/freebies/forms/mural-booking)<br>`components/mural-booking-form.tsx` | `npx shadcn@latest add https://www.mebius.design/r/forms-pro-mural-booking.json` |
| [<img src="https://www.mebius.design/kits/forms/previews/forms-new-project.webp" width="240" alt="New Project Form preview">](https://www.mebius.design/freebies/forms/new-project) | [New Project Form](https://www.mebius.design/freebies/forms/new-project)<br>`components/new-project-form.tsx` | `npx shadcn@latest add https://www.mebius.design/r/forms-new-project.json` |
| [<img src="https://www.mebius.design/kits/forms-pro/previews/forms-pro-cron-job.webp" width="240" alt="New Cron Job Form preview">](https://www.mebius.design/freebies/forms/cron-job) | [New Cron Job Form](https://www.mebius.design/freebies/forms/cron-job)<br>`components/cron-job-form.tsx` | `npx shadcn@latest add https://www.mebius.design/r/forms-pro-cron-job.json` |
| [<img src="https://www.mebius.design/kits/forms-pro/previews/forms-pro-pixel-checkout.webp" width="240" alt="Pixel Checkout Form preview">](https://www.mebius.design/freebies/forms/pixel-checkout) | [Pixel Checkout Form](https://www.mebius.design/freebies/forms/pixel-checkout)<br>`components/pixel-checkout-form.tsx` | `npx shadcn@latest add https://www.mebius.design/r/forms-pro-pixel-checkout.json` |
| [<img src="https://www.mebius.design/kits/forms-pro/previews/forms-pro-retro-os-account.webp" width="240" alt="New User Account Form preview">](https://www.mebius.design/freebies/forms/retro-os-account) | [New User Account Form](https://www.mebius.design/freebies/forms/retro-os-account)<br>`components/retro-os-account-form.tsx` | `npx shadcn@latest add https://www.mebius.design/r/forms-pro-retro-os-account.json` |
| [<img src="https://www.mebius.design/kits/forms-pro/previews/forms-pro-token-transfer.webp" width="240" alt="Secure Transfer Form preview">](https://www.mebius.design/freebies/forms/token-transfer) | [Secure Transfer Form](https://www.mebius.design/freebies/forms/token-transfer)<br>`components/token-transfer-form.tsx` | `npx shadcn@latest add https://www.mebius.design/r/forms-pro-token-transfer.json` |
<!-- /generated:items -->

The public registry index of these items and everything they depend on is at
[`/r/starter.json`](https://www.mebius.design/r/starter.json).

## What's in this repository

The items' source exactly as `npx shadcn@latest add` installs it, so you can read it before you install:

| Folder | What |
| --- | --- |
| `components/` | The 20 items (one file each) |
| `components/ui/` | The chart cards' small parts: card, buttons, segmented control, menu, legends, tooltips |
| `hooks/` | Motion, sizing, form submit and controllable-state hooks |
| `lib/` | Number formatting, chart series helpers and shadcn's `cn()` |
| `styles/` | Each kit's theme variables, which the CLI merges into your `globals.css` |
| `components.json` | An example config with the `@mebius` registry |

The charts' variables are scoped to the charts (`data-charts`), so they never change your app's own colours. The forms
come in light and dark.

### Fonts

The CLI adds each item's fonts to your root layout with `next/font` in Next.js; elsewhere install the package shown.
The charts use SF Pro Rounded through `ui-rounded` (Apple devices) with the system font as fallback.

<!-- generated:fonts -->
| Font | CSS variable | Outside Next.js |
| --- | --- | --- |
| Geist Mono Variable | `--font-geist-mono` | `@fontsource-variable/geist-mono` |
| Geist Variable | `--font-geist-sans` | `@fontsource-variable/geist` |
| Instrument Sans Variable | `--font-instrument-sans` | `@fontsource-variable/instrument-sans` |
| JetBrains Mono Variable | `--font-jetbrains-mono` | `@fontsource-variable/jetbrains-mono` |
| Montserrat Variable | `--font-montserrat` | `@fontsource-variable/montserrat` |
| Silkscreen | `--font-silkscreen` | `@fontsource/silkscreen` |
| Unbounded Variable | `--font-unbounded` | `@fontsource-variable/unbounded` |
| VT323 | `--font-vt323` | `@fontsource/vt323` |
<!-- /generated:fonts -->

## More: 170 free items and the Figma files

These 20 are a sample. mebius.design has 62 animated charts and 128 forms in all, light and dark, plus the Figma file
each one comes from. The other 170 items and every Figma file are free with a
[mebius.design account](https://www.mebius.design/signup), installed with the same CLI and a personal access token.

Working in Claude Code, Cursor or VS Code? The mebius MCP server lets your agent search the items and install them for
you:

```bash
claude mcp add --transport http mebius https://www.mebius.design/api/mcp
```

Setup for other clients and access tokens: [mebius.design/settings/tokens](https://www.mebius.design/settings/tokens).

mebius.design also sells Figma UI kits for dashboards, mobile apps and websites with the matching React + Tailwind code
for shadcn.

## License

The code in this repository is [MIT](LICENSE). The Figma files, the other mebius.design items and the paid kits keep the
[mebius.design license](https://www.mebius.design/license).

Made by [Keitoto Studio](https://www.mebius.design).
