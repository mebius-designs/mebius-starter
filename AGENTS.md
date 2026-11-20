# AGENTS.md: mebius starter

Rules for AI coding agents (Claude Code, Cursor, Codex and others) that add mebius.design items to a project. To give
your own project the same rules, copy the sections from "Add a starter item" to "The mebius MCP server" into its
AGENTS.md, or copy `.cursor/rules/mebius.mdc` into its `.cursor/rules/`.

## What this repository is

The source of the 20 open mebius.design starter items: 10 animated chart cards and 10 forms for shadcn/ui, in React 19
and Tailwind CSS v4, under the MIT license. The files are exactly what `npx shadcn@latest add` installs. Install them
with the shadcn CLI rather than copying files by hand: the CLI also adds their npm dependencies, fonts and theme
variables. README.md lists every item with its file and its install command.

## Add a starter item: no account, no token

1. The project needs React 19, Tailwind CSS v4 and a `components.json`. If it has none, run `npx shadcn@latest init`.
2. Install the item from its URL. Its theme, hooks and helpers come with it:

   ```bash
   npx shadcn@latest add https://www.mebius.design/r/charts-ethereum.json
   ```

3. Or install it by name. Add the registry to `components.json` without a header, as in this repository's
   `components.json`: `"registries": { "@mebius": "https://www.mebius.design/r/{name}.json" }`. Then run
   `npx shadcn@latest add @mebius/charts-ethereum`.
4. Import it from `@/components/<file>` and replace its sample data with the app's own. Its props are typed and
   documented in the file.

## Add any other mebius item: token, theme first

The other 170 free charts and forms need a free mebius.design account. UI kit items (`relivo-button`, `bitgo-…`) need
an account that owns the kit.

1. **Token.** The user creates a personal access token at https://www.mebius.design/settings/tokens and puts it in
   `.env.local` as `MEBIUS_TOKEN=…`. Never ask for the token in chat, print it or commit it.
2. **Registry.** Replace the plain `@mebius` entry in `components.json` with this one. The starter items keep working
   with it:

   ```json
   {
     "registries": {
       "@mebius": {
         "url": "https://www.mebius.design/r/{name}.json",
         "headers": { "Authorization": "Bearer ${MEBIUS_TOKEN}" }
       }
     }
   }
   ```

3. **Theme first, on its own.** Add the kit's theme before anything else: `charts-theme`, `forms-theme`,
   `forms-pro-theme`, `relivo-theme` and so on. Added on its own, a theme replaces shadcn's colors, radius and fonts.
   Pulled in as a dependency, it only adds the variables that are missing.

   ```bash
   npx shadcn@latest add @mebius/relivo-theme
   ```

4. **Then each item with `--overwrite`.** Kit files use shadcn's own file names, such as `components/ui/button.tsx`.
   Without `--overwrite`, the CLI keeps shadcn's version.

   ```bash
   npx shadcn@latest add @mebius/relivo-button --overwrite
   ```

A 401 from the registry means the token is missing, mistyped or revoked. A 403 means the account doesn't own that kit.

## Names

- Item names start with their kit: `charts-ethereum`, `forms-pro-cron-job`, `relivo-button`. The kit name on its own
  (`relivo`) installs the whole kit.
- Registry dependencies are written `@mebius/<name>`. `utils` is shadcn's `cn()` helper in `@/lib/utils`.

## The mebius MCP server instead of the CLI

The mebius MCP server reads the items of the signed-in account. Connect it in Claude Code with
`claude mcp add --transport http mebius https://www.mebius.design/api/mcp`. Setup for other clients is at
https://www.mebius.design/settings/tokens. Then:

- `search_items` finds an item by what it does, and `list_items` lists a kit.
- `get_install_instructions` returns the steps above with the exact commands for one item or kit.
- `get_item` returns every file with its target path, plus the item's usage docs. When you write the files by hand,
  also install its npm dependencies and its `@mebius/*` registry dependencies.

## Editing this repository

`components/`, `hooks/`, `lib/`, `styles/` and the tables in README.md are generated from the mebius.design registry
and replaced on every update, so hand edits there don't last.

## License

The code in this repository is MIT (LICENSE). Other mebius.design items and the Figma files keep the
[mebius.design license](https://www.mebius.design/license).
