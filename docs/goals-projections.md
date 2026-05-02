# Goals and projections

The goals module is a local-first planning tool. It stores user-defined financial goals, reusable projection scenarios and deterministic monthly projections.

It is not a financial advisor, robo-advisor, investment recommendation engine, or market forecast.

## What the projection engine does

The pure projection engine receives explicit inputs:

- initial value
- target amount
- monthly contribution or surplus
- horizon in months
- annual growth rate
- annual inflation rate
- currency
- scenario metadata
- start date

It then generates one monthly row per projected month:

- contribution amount
- estimated growth amount
- estimated inflation impact
- projected value
- remaining amount
- progress percentage

The engine returns a structured status:

- `alreadyReached`
- `reachable`
- `unreachableWithinHorizon`
- `invalidInput`

Invalid business inputs are returned as recoverable validation errors instead of raw exceptions.

## Calculation model

For each month, the engine applies this simplified deterministic model:

1. Add the monthly contribution to the previous value.
2. Convert annual growth into an effective monthly rate.
3. Apply monthly growth.
4. Convert annual inflation into an effective monthly rate.
5. Subtract the estimated inflation impact.
6. Clamp the projected value to zero.
7. Compare the projected value with the target.

This is intentionally simple and auditable. It is designed to answer “what happens with these assumptions?” rather than “what will happen?”.

## Scenarios

The default demo/test scenarios are:

| Scenario | Monthly surplus | Growth | Inflation | Purpose |
| --- | ---: | ---: | ---: | --- |
| Pessimistic | Lower | Low | Higher | Stress a conservative path |
| Base | Medium | Medium | Medium | Neutral baseline |
| Optimistic | Higher | Higher | Medium | Show an upside path |

Scenario names, rates and surplus values are assumptions. They are not recommendations.

## Demo data

The test fixtures define sample goals such as:

- emergency fund
- house down payment
- already reached savings goal

They also include pessimistic, base and optimistic scenarios. These fixtures are deterministic and require no external service.

## Limits

The projection does not:

- fetch real-time prices
- forecast markets
- model taxes
- model contribution limits
- model account-specific fees
- model stochastic risk
- recommend buying or selling assets
- guarantee any future result

Growth and inflation are simple scalar assumptions. Real portfolios and expenses can behave very differently.

## Projection versus guarantee

A projection is a calculated path from assumptions. A guarantee is a promise about a future outcome.

This app only provides projections. The output should be read as “with these inputs, the math gives this path”, not as “this is expected to happen”.

## Validation and tests

The goals/projections test suite covers:

- goal creation validation
- invalid target amounts
- invalid horizons
- invalid monthly contribution
- monthly projection rows
- estimated reach date
- already reached goals
- unreachable targets
- zero monthly contribution
- negative growth
- multiple scenarios
- IPC envelopes
- UI rendering of charts and detail tables
- JSON backup and restore of goals/scenarios
