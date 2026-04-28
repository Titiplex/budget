# Wealth navigation scaffold

Issue #17 adds the first renderer-level entry point for the wealth domain.

## Scope

- Adds a dedicated `wealth` section key.
- Adds the section to the main in-app navigation.
- Adds desktop menu commands that route to the same section.
- Adds a placeholder `WealthSection` ready for assets, portfolios and net worth.
- Keeps the existing budget dashboard and cash-flow sections untouched.

## Boundary

The wealth page is intentionally not a budget dashboard. It reads the IPC contracts from the wealth layer and presents static patrimony data: assets, portfolios, liabilities and net worth. Cash-flow analytics stay in the existing overview, budgets, recurring and reports sections.

## Empty state

The page must render with an empty wealth database. The component therefore defaults every collection to an empty array and shows an explicit empty state when no assets, portfolios or liabilities exist yet.
