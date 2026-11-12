# Sealed Market: a briefing for writers

*Background for anyone writing about the product. Everything here reflects the code and documents in this repository as of November 2026. The "Status and limits" section matters as much as the rest: please read it before describing the product as live.*

## In one sentence

Sealed Market is a marketplace where people sell **answers about their data** instead of the data itself: a buyer can test a dataset's quality for free, pay a few dollars per question, and never see a single row.

Its own tagline is "Sell answers, not spreadsheets."

## The problem it goes after

Selling data has a built-in contradiction, known in economics as Arrow's information paradox. A buyer cannot judge what a dataset is worth without looking at it, and once they have looked at it they no longer need to buy it.

That leaves both sides in a bad position:

- **Sellers** who share a file lose control of it. It can be copied and passed on forever.
- **Buyers** are asked to pay on the strength of a description and perhaps an outdated sample. They buy blind.
- **Contributors**, the people whose records make up a pooled dataset, usually see little or none of the money.
- **Software agents** that need data have no way to check quality before they spend.

## How it works

The product calls its protected computing environment "the vault". Data goes in and stays in; only results come out.

1. **Seal.** A seller chooses a CSV file. It is encrypted in their own browser before it is uploaded, locked to the vault's public key. The seller sets a price per answer, a cap on how many questions can ever be answered, and who contributed which rows. No crypto wallet is needed: signing up with an email creates a free account.
2. **Free quality check.** Before paying anything, a buyer states what they want to predict. Inside the vault, the dataset is measured: how complete it is, how many rows are duplicates, how recent it is, whether it looks copy-pasted, and how much it improves a prediction model for the buyer's goal. The buyer receives a signed report with a quality score and a fair price range. The buyer's browser checks the signature.
3. **Pay per answer.** The buyer purchases a small number of answers (one to five). The payment is held in escrow, not sent to the seller.
4. **Ask.** The buyer asks for an average, total, count, lowest or highest value of any column, with an optional filter. Each answer comes back with a small amount of deliberate random noise and a 95% range.
5. **Settle.** When the buyer is done, the order is settled. If the data met its quality guarantee, 95% of the payment is split among the contributors and 5% is the platform fee. If it fell short, the buyer gets 100% back with no fee. The service decides which, from the signed quality report the order was bought against; the buyer cannot choose a refund for good data.

A worked example from the bundled sample data (a fictional bike-rental dataset of 120 rows from three contributors): quality score 96%, fair price $3.76 to $4.50, so $4.13 per answer. Three answers cost $12.39. On settlement the fee is $0.62 and $11.77 is paid out as $5.99, $3.59 and $2.19. A second, deliberately poor sample scores 38% and settles as a full refund.

## The four ideas underneath

**1. A vault that can prove what it is (trusted execution environment, attestation).** The data is meant to be decrypted only inside a hardware-isolated environment. Before trusting it, a browser sends a fresh random challenge and checks the signed response, so it knows it is talking to the genuine vault and not a replay.

**2. Try before you buy.** The headline feature. The quality check runs the buyer's own task on the sealed data and releases only scores. This follows published research ("Try Before You Buy", Azcoitia and Laoutaris, 2020) showing that knowing how much a dataset improves your model gets close to optimal purchasing.

**3. Privacy that is metered (differential privacy).** Two guards protect individuals. Any question that matches fewer than 20 rows is refused, and does not use up a paid answer. Every answer has calibrated noise added, and each one spends part of a fixed "privacy budget" for that dataset. When the budget is spent, the dataset stops answering. This stops someone reconstructing a person's record by asking many overlapping questions.

**4. Paying people by contribution (Shapley values).** For pooled data, the split is not by row count. The vault estimates how much each contributor's rows actually improved the result and divides the payout in that proportion. In the sample, the contributor with 50% of the rows receives 51% of the payout and the one with 20% receives 19%.

## Who it is for

- **Individuals and data collectives** who want to earn from data without handing over a copy.
- **Analysts, researchers and startups** who want an answer, not custody of raw data and the liability that comes with it.
- **Software agents.** An "auto-buy" mode lets a bot run the whole purchase by itself under rules the owner sets: minimum quality, maximum price, and a key that cannot spend more than a fixed limit.

## How it differs from existing options

- **Traditional data marketplaces** deliver a file or an API. The buyer ends up with a copy.
- **Compute-to-data systems** keep data in place, but generally do not give the buyer a signed, independent quality appraisal before purchase.
- **Data-pool projects** pay contributors for pooled training data; per-person payouts have been reported as small. Sealed Market pays per answer to any buyer and splits by measured contribution.
- **Agent payment rails** move money but carry no quality signal and no privacy protection.

The claim to newness is the combination: an appraisal the buyer can verify before paying, pay-per-answer with a privacy budget, and an automatic contribution-based split.

## Where it runs

Sealed Market is built on the NEAR blockchain ecosystem. The design uses NEAR for named accounts created without fees, an escrow contract, tokens that represent a pass for a number of answers, capped keys for agents, and "NEAR Intents" so a buyer can pay in USDC from Base, Arbitrum, Solana or NEAR. It was drafted on 31 October 2026 with a 14-day build plan for a hackathon in its agents and privacy tracks.

## Status and limits

This is an early preview, and an article should say so.

- **No real money moves yet.** Payments in the web app are simulated. No wallet signs a transaction, and the escrow ledger is kept by the service, mirroring a smart contract that exists in the repository but is not what the app calls.
- **The vault's proof is not yet hardware-backed.** The attestation is currently signed by the service's own key. Verifying a genuine hardware quote is marked in the code as still to be confirmed.
- **Sample data is fictional.** The three bundled datasets are invented, and their privacy budgets refill hourly so the demo stays usable. Real uploads never refill.
- **It is not for regulated data.** Health records, identity documents and similar personal data are explicitly out of scope, as are legal licensing terms.
- **Answers are approximate by design.** Buyers get noised aggregates and model metrics, never rows.
- **Known weaknesses, stated by the authors:** hardware vaults have had side-channel attacks and require trusting the chip vendor; sellers could tune data to score well, which is why buyers can supply their own hidden test file; and a marketplace with no sellers has nothing to sell.

## Terms, in plain words

| Term | Meaning |
| :--- | :--- |
| Vault / TEE | A protected computing environment whose contents its operator is not supposed to be able to read. |
| Attestation | Proof, checkable by the user's browser, of which vault it is talking to. |
| Appraisal | The signed quality report produced before purchase. |
| Aggregate | A summary of many rows, such as an average or a count. |
| Differential privacy | Adding calibrated noise so results stay useful while single records cannot be inferred. |
| Privacy budget | A fixed allowance of questions a dataset can ever answer. |
| Shapley split | Dividing a payment by each contributor's measured share of the value. |
| Escrow | Money held by a neutral party until the conditions of a sale are met. |

## Where to look

- Live preview: https://sealed-market.vercel.app
- Product requirements and research references: `docs/sealed-market-prd.txt`
- What is and is not simulated: the "What is simulated in this preview" section of `README.md`
- Launch film and voiceover script: `film/`
