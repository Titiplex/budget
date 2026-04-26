# Tax reporting strategy

This feature is designed as a declarative tax review helper, not as a tax calculator.

The goal is to help the user avoid forgetting potentially reportable accounts, foreign income, withholding tax, credits or declaration forms. The app must not pretend to compute final tax liability or provide legal/tax advice.

## Initial jurisdictions

The MVP supports rule modules for:

- France
- Canada federal
- Quebec

A Canadian profile with `residenceCountry = CA` and `residenceRegion = QC` runs both Canada federal and Quebec checks.

## Data model

### Tax profile

A `TaxProfile` represents the user's tax residency for a specific tax year.

Important fields:

- `year`
- `residenceCountry`
- `residenceRegion`
- `currency`

Tax residency is intentionally annual because a user can move between jurisdictions from one tax year to another.

### Account metadata

Accounts can now carry jurisdiction metadata:

- `institutionCountry`
- `institutionRegion`
- `taxReportingType`
- `openedAt`
- `closedAt`

`institutionCountry` describes where the account or institution exists. It does not describe the user's tax residency.

### Transaction metadata

Income transactions can now carry tax metadata:

- `taxCategory`
- `taxSourceCountry`
- `taxSourceRegion`
- `taxTreatment`
- `taxWithheldAmount`
- `taxWithheldCurrency`
- `taxWithheldCountry`
- `taxDocumentRef`

The feature deliberately avoids a boolean such as `alreadyTaxed`. The safer model is explicit withholding metadata: amount, currency, country, document reference and review status.

## Report rules

The report engine lives in `src/utils/taxReport.ts`.

It returns structured sections with:

- jurisdiction
- severity
- items
- suggested forms or lines to verify
- confidence level

### France MVP

The France rules detect:

- accounts outside France, potentially reportable through 3916 / 3916-bis
- foreign-source income, potentially reportable through 2047 / 2042
- foreign tax withheld, potentially relevant for foreign tax credit or treaty mechanisms

### Canada federal MVP

The Canada federal rules detect:

- accounts or assets outside Canada, potentially relevant for T1135 review
- foreign-source income
- foreign tax withheld, potentially relevant for federal foreign tax credit review

### Quebec MVP

The Quebec rules detect:

- income earned outside Quebec
- foreign or non-Quebec tax withheld
- potential Quebec foreign tax credit or interprovincial transfer review

## UX rule

Wording must remain conservative:

- use “to verify” and “review required”
- do not say “you must declare X on line Y” unless the rule is made authoritative and maintained
- do not compute final tax owed

## Persistence

JSON backups are versioned as `version: 4` and include the tax metadata fields. Older backups remain accepted for restore parsing.

CSV import/export should expose the tax fields in a future follow-up so imports do not silently drop user-provided tax metadata.

## Tests

The rule engine is covered by `src/utils/taxReport.test.ts`.

The key covered cases are:

- French resident with foreign account, foreign income and foreign withholding
- tax-year filtering
- Quebec resident receiving Canada federal and Quebec sections
- Markdown export serialization
