# Product

## Register

product

## Platform

web

## Users

A solo Forex/crypto trader (single-user personal tool, not multi-tenant) running a
multi-monitor trading desk with charts open on several screens throughout the
session. Uses the app in three phases each day: pre-market planning (bias, goals,
plan screenshots), live logging during market hours (trades, session-log notes and
screenshots, trading-sin tally), and post-session review (reflection, self-rating,
weekly/analytics review afterward). Needs low-friction capture during market hours
— anything that interrupts focus on live charts is a cost — and a dense, scannable
record for reflective review later.

## Product Purpose

A trading journal that reinforces discipline and surfaces patterns: plan adherence,
tilt, and recurring mistakes, alongside standard performance tracking (equity curve,
win rate, R, performance by symbol/session/strategy/emotion). Success looks like the
trader catching a bad pattern (a recurring "sin," a tilt spiral, a broken plan) before
it costs more money, and having a fast, honest daily record to review weekly.

## Brand Personality

Precise, disciplined, professional. A Bloomberg Terminal-style trading-desk tool, not
a consumer app — data-dense, no-nonsense, confidence earned through competence and
clarity rather than decoration. Dark theme, cyan accent, monospace for numbers.

## Anti-references

The generic SaaS dashboard cliché: templated gradient cards, rounded-everything
pastel admin-panel look, decorative motion, cutesy illustrations, marketing-style
hero sections. This is a working tool used under time pressure, not a product being
sold.

## Design Principles

- Data density over whitespace for its own sake — the trader needs to scan numbers fast, not admire negative space.
- Every screen should read like a professional trading terminal, not a consumer dashboard.
- Speed of logging beats visual flourish — friction during market hours is the enemy.
- Color communicates state (P&L, win/loss, tilt, bias) — never used as decoration.
- Consistency across views (journal, trades, weekly, analytics) so the tool disappears into the workflow.

## Accessibility & Inclusion

Colorblind-safe P&L / win-loss coloring: red/green is used throughout for
profit/loss and win/loss, so it must not be the only signal — pair with +/− signs,
icons, or text labels (already the pattern via `pnlSign()` in utils.js). Standard
WCAG AA contrast for a dark theme is the bar; single-user personal tool, no other
known accessibility requirements.
