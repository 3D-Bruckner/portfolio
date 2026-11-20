# Order flow: from the order form to the A1 and back

Status: draft, decisions marked **D1–D6** wait for Marcel. Date: 2026-11-20.

## Goal

An order on 3dbruckner.de moves through every system without being typed twice: noticebox (the request), Invoice Ninja (client,
quote, invoice), Bambuddy (the print queue at home), Spoolman (the filament it uses), and back to the customer as "ready". Marcel
stays the one who decides: nothing is sent to a customer and nothing starts printing without his tap.

## Where things run

| Part | Where | Why |
|---|---|---|
| noticebox, Invoice Ninja | gewerbe-1 (as today) | unchanged |
| **Orders in upload** | products-1 | the catalogue and the orders in one place, with its MCP; no new app on a full server (D1) |
| Bambuddy, Spoolman | homelab | they talk to the A1 on the home network |
| **print-bridge** (new, small) | homelab | carries jobs home and results back; **polls**, so nothing at home is reachable from outside (option A, Marcel 2026-11-20) |

## The flow

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant N as noticebox (gewerbe-1)
    participant U as upload: orders (products-1)
    participant I as Invoice Ninja (gewerbe-1)
    actor M as Marcel
    participant H as print-bridge (home)
    participant B as Bambuddy (home)
    participant S as Spoolman (home)
    C->>N: order form
    N->>U: webhook: form, id (no content)
    U->>N: GET submission (token)
    U->>I: client by email (find or create), quote draft
    U->>N: state "angebot" (decide)
    M->>I: checks and sends the quote
    C-->>M: accepts (mail, phone)
    M->>U: "Auftrag annehmen" (or the quote is approved in Invoice Ninja, D2)
    Note over U: jobs: one per print and colour, state "to print"
    loop every 30–60 s
        H->>U: GET jobs to print
    end
    H->>B: queue the print's 3MF (D3)
    M->>B: plate clear, start
    B->>S: filament used (Bambuddy does this itself)
    H->>B: poll queue and archive
    H->>U: job printing / finished: time, grams
    U->>N: state "fertig" when all jobs are done
    U->>I: quote to invoice draft
    M->>I: sends the invoice; ships
    M->>U: "verschickt"
    U->>N: state "verschickt" (closed)
```

## What upload stores

Only references and states, **no personal data** (D1): an order is `{id, noticeboxSubmissionId, invoiceNinjaClientId,
invoiceNinjaQuoteId, invoiceId, state, createdAt}` with items `{printId?, colour, quantity}` and jobs `{orderItemId, state,
bambuddyQueueId, startedAt, finishedAt, minutes, grams}`. Name, address and email stay in noticebox (deleted after its retention)
and in Invoice Ninja (where they must be, for the invoice). upload shows them by reading noticebox when the page is opened.

States: `neu` → `angebot` → `angenommen` → `im Druck` → `fertig` → `verschickt` (or `abgesagt` from any). noticebox's form gets the
same states, so its inbox shows where each request is.

## Pieces to build

1. **upload: orders.** Migration (orders, items, jobs); domain `orders.ts`; webhook route `/hooks/noticebox/<secret>`; a noticebox
   client (`GET /submissions/{id}`, `POST /submissions/{id}/decisions`) with `UPLOAD_NOTICEBOX_URL` and `UPLOAD_NOTICEBOX_TOKEN`; an
   Invoice Ninja client (find or create client by email, quote draft with one line per item, convert to invoice) with
   `UPLOAD_INVOICENINJA_URL` and `UPLOAD_INVOICENINJA_TOKEN`; pages "Aufträge" (list) and one order (its customer read live, its
   jobs, the buttons); MCP tools and REST operations for the same; jobs API for the bridge with its own token scope.
2. **noticebox form `3dbruckner-order`:** the six states, the webhook target (URL with the secret from the vault).
3. **print-bridge (homelab stack):** a small Node or Python service, one loop: fetch jobs to print from upload, queue them in
   Bambuddy (its REST API with an API key), poll Bambuddy for their progress, report back. Its own upload token (jobs only).
4. **Bambuddy and Spoolman (homelab stacks):** the A1 in LAN mode; Bambuddy archives every file sent to the printer (D3);
   Bambuddy syncs Spoolman.
5. **The order form (site):** optional field "Druck aus dem Portfolio" (slug) and a colour from Spoolman's stock (D4, later).

## Decisions for Marcel

- **D1 Orders inside upload, personal data stays out.** Recommended. The alternative is a separate order service (one more app on
  products-1, ~150 MB) or keeping orders only in noticebox (no place for jobs and results).
- **D2 What starts printing:** a button "Auftrag annehmen" in upload (recommended: one clear moment), or the quote's "approved" in
  Invoice Ninja (upload would poll it).
- **D3 Which file Bambuddy prints:** Bambuddy's archive, which keeps every file sent to the printer from Bambu Studio. A catalogue
  print points to its archive entry (picked once, in upload, from Bambuddy's list through the bridge); an order for it queues that
  entry again. A custom order (no catalogue print) gets its job once Marcel has sliced it and sent it to the printer, which archives
  it: he links that entry to the order. No shared folder. Recommended. (Marcel 2026-11-20: no Nextcloud.)
- **D4 Colours from stock on the order form:** later, after Spoolman runs (it needs the site's form and noticebox's field to change).
- **D5 Invoice Ninja is only ever a draft:** upload never sends a quote or an invoice; Marcel does, in Invoice Ninja. Recommended.
- **D6 The customer hears from Marcel, not from the system:** no automatic mails; "fertig" is a state and a push to his phone (ntfy).
  Recommended for now.

## Order of work

1. Bambuddy and Spoolman in the homelab (spec there, with the Claude gateway).
2. upload: orders without the bridge (noticebox → order → Invoice Ninja draft → states), tested end to end with noticebox's test
   posts.
3. print-bridge and the link from a catalogue print to its Bambuddy archive entry (D3).
4. Results back (time, grams) into the order and the print's numbers (the "real print" feature).
