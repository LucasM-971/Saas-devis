# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: building-trade SMEs of every trade (2–20 people), where someone, often in the office, handles quotes. Inside a company, roles are separated (members, invitations).

Secondary: the end client of those companies, a private individual or business that describes its project to a chatbot on the company's site or through a hosted link (`/c/:id`).

## Product Purpose

Devis AI turns a chat conversation into a priced draft quote. The chatbot qualifies the request (service, postcode, quantities, contact details), the system prices it from the company's own price grid, and the artisan reviews, edits and sends the quote from the dashboard. Success means less time spent on quotes and fewer leads lost between the first contact and the quote being sent.

## Positioning

The AI never calculates a price. It understands and extracts the request, and a deterministic engine (Python `Decimal`, rounded to the cent) prices it from the company's own grid: the same inputs always produce the same quote. Services and line items are constrained by an enum, so the model cannot invent any. A request that can't be quoted (service not offered, area not served, missing information, quota reached) becomes a lead with its reason instead of a made-up quote.

## Operating Context

- Three surfaces: the artisan dashboard (React SPA, including the landing page and the hosted chat), the embeddable widget (vanilla JS, Shadow DOM), and quote e-mails and PDFs (WeasyPrint).
- Quote lifecycle: draft → pending → validated → sent → accepted / rejected / expired, with every change versioned and logged.
- Setup: price grid, service areas, FAQ / knowledge base, quote templates, company legal notices, plans and quotas.

## Capabilities and Constraints

- Interface and copy in **French only**; no i18n planned.
- The dashboard must stay **usable on mobile** (reviewing and sending quotes from a phone).
- The widget is embedded on artisan sites it doesn't control: it has to look right and stay isolated on any host site.
- Stack in place: React 19 + TypeScript + Vite + Tailwind v4 (dashboard), vanilla JS (widget), FastAPI + MySQL (backend).

## Brand Commitments

- Name: **Devis AI**. Existing logo: `dashboard/src/components/Logo.tsx`, `dashboard/public/favicon.svg`.

## Evidence on Hand

- **Pilot stage, no public clients.** Only seed / demo data exists.
- No testimonials, client logos, usage figures or case studies: **never invent any**.

## Product Principles

1. Price is deterministic and auditable; the AI never presents a figure as its own judgement.
2. The artisan keeps control: nothing goes to the client without being reviewed.
3. Every request that can't be quoted becomes a qualified lead, never a dead end.
4. Speak in the language of the building trades, not tech jargon.

## Accessibility & Inclusion

WCAG 2.2 AA required on the dashboard, the widget and the public pages.
