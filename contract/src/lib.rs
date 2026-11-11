// Sealed Market Smart Contract (`market.sealed.near`)
// Implements dataset listings, attested TEE appraisal verification (ed25519),
// NEP-245 Multi-Token answer entitlements, privacy budget metering, and
// Shapley-weighted contributor escrow settlements.

// VERIFY: https://docs.near.org/build/smart-contracts/anatomy/collections
use near_sdk::json_types::U128;
use near_sdk::store::{IterableMap, Vector};
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise,
};

const PLATFORM_FEE_BPS: u128 = 500; // 5.00% platform fee
const BPS_DENOMINATOR: u128 = 10_000;

#[derive(BorshStorageKey)]
#[near]
pub enum StorageKey {
    Listings,
    Appraisals,
    Escrows,
    Tokens,
    TokenBalances,
    Queries,
    Settlements,
}

#[derive(Clone, Debug, PartialEq)]
#[near(serializers = [borsh, json])]
pub struct ViewPrice {
    pub name: String,
    pub price_usdc: f64,
}

#[derive(Clone, Debug, PartialEq)]
#[near(serializers = [borsh, json])]
pub struct Contributor {
    pub account: AccountId,
    pub rows: u64,
}

#[derive(Clone, Debug, PartialEq)]
#[near(serializers = [borsh, json])]
pub struct SubScores {
    pub completeness: f64,
    pub uniqueness: f64,
    pub freshness: f64,
    pub schema_fit: f64,
    pub synthetic_score: f64,
    pub utility_delta: f64,
}

#[derive(Clone, Debug, PartialEq)]
#[near(serializers = [borsh, json])]
pub struct Listing {
    pub id: String,
    pub title: String,
    pub description: String,
    pub seller_account: AccountId,
    pub dataset_hash: String,
    pub schema: Vec<String>,
    pub views: Vec<ViewPrice>,
    pub epsilon_budget: f64,
    pub epsilon_spent: f64,
    pub contributors: Vec<Contributor>,
    pub shapley_weights_bps: Vec<u64>,
    pub row_count: u64,
    pub freshness_date: String,
    pub latest_score: Option<f64>,
    pub price_low: Option<f64>,
    pub price_high: Option<f64>,
    pub latest_appraisal_id: Option<String>,
    pub created_at_ms: u64,
}

#[derive(Clone, Debug, PartialEq)]
#[near(serializers = [borsh, json])]
pub struct Appraisal {
    pub id: String,
    pub listing_id: String,
    pub task_hash: String,
    pub score: f64,
    pub price_low: f64,
    pub price_high: f64,
    pub tee_pubkey: String,
    pub tee_sig: String,
    pub attestation_ref: String,
    pub subscores: SubScores,
    pub shapley_weights_bps: Vec<u64>,
    pub explanation: String,
    pub created_at_ms: u64,
}

#[derive(Clone, Debug, PartialEq)]
#[near(serializers = [borsh, json])]
pub enum EscrowStatus {
    Funded,
    Released,
    Refunded,
}

#[derive(Clone, Debug, PartialEq)]
#[near(serializers = [borsh, json])]
pub struct Escrow {
    pub id: String,
    pub listing_id: String,
    pub appraisal_id: String,
    pub buyer: AccountId,
    pub amount_yocto: u128,
    pub amount_usdc: f64,
    pub token_id: String,
    pub status: EscrowStatus,
    pub created_at_ms: u64,
}

/// NEP-245 Multi-Token metadata & answer entitlement state
/// // VERIFY: https://nomicon.io/Standards/Tokens/MultiToken/Core
#[derive(Clone, Debug, PartialEq)]
#[near(serializers = [borsh, json])]
pub struct MtToken {
    pub token_id: String,
    pub owner_id: AccountId,
    pub listing_id: String,
    pub escrow_id: String,
    pub answers_total: u64,
    pub answers_left: u64,
    pub issued_at_ms: u64,
}

#[derive(Clone, Debug, PartialEq)]
#[near(serializers = [borsh, json])]
pub struct BuyReceipt {
    pub escrow_id: String,
    pub token_id: String,
    pub listing_id: String,
    pub buyer: AccountId,
    pub answers_left: u64,
    pub amount_yocto: U128,
    pub amount_usdc: f64,
}

#[derive(Clone, Debug, PartialEq)]
#[near(serializers = [borsh, json])]
pub struct QueryLog {
    pub id: String,
    pub token_id: String,
    pub listing_id: String,
    pub caller: AccountId,
    pub query_hash: String,
    pub epsilon_used: f64,
    pub epsilon_remaining: f64,
    pub answers_left: u64,
    pub result_hash: String,
    pub timestamp_ms: u64,
}

#[derive(Clone, Debug, PartialEq)]
#[near(serializers = [borsh, json])]
pub struct ContributorPayout {
    pub account: AccountId,
    pub weight_bps: u64,
    pub amount_yocto: U128,
    pub amount_usdc: f64,
}

#[derive(Clone, Debug, PartialEq)]
#[near(serializers = [borsh, json])]
pub struct Settlement {
    pub id: String,
    pub listing_id: String,
    pub escrow_id: String,
    pub buyer: AccountId,
    pub delivered_within_range: bool,
    pub outcome: String,
    pub total_amount_usdc: f64,
    pub platform_fee_usdc: f64,
    pub payouts: Vec<ContributorPayout>,
    pub timestamp_ms: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct SealedMarketContract {
    pub owner_id: AccountId,
    /// Hex-encoded 32-byte ed25519 public key of the attested TEE enclave
    pub tee_pubkey: String,
    pub next_listing_seq: u64,
    pub next_appraisal_seq: u64,
    pub next_escrow_seq: u64,
    pub listings: IterableMap<String, Listing>,
    pub appraisals: IterableMap<String, Appraisal>,
    pub escrows: IterableMap<String, Escrow>,
    pub tokens: IterableMap<String, MtToken>,
    /// Keyed by "{account_id}:{token_id}" -> balance (answers_left)
    pub token_balances: IterableMap<String, u128>,
    pub queries: Vector<QueryLog>,
    pub settlements: Vector<Settlement>,
}

#[near]
impl SealedMarketContract {
    #[init]
    pub fn new(owner_id: AccountId, tee_pubkey: String) -> Self {
        let decoded = hex::decode(&tee_pubkey).expect("tee_pubkey must be valid hex");
        require!(
            decoded.len() == 32,
            "tee_pubkey must be a 32-byte ed25519 public key (64 hex chars)"
        );

        Self {
            owner_id,
            tee_pubkey: tee_pubkey.to_lowercase(),
            next_listing_seq: 1,
            next_appraisal_seq: 1,
            next_escrow_seq: 1,
            listings: IterableMap::new(StorageKey::Listings),
            appraisals: IterableMap::new(StorageKey::Appraisals),
            escrows: IterableMap::new(StorageKey::Escrows),
            tokens: IterableMap::new(StorageKey::Tokens),
            token_balances: IterableMap::new(StorageKey::TokenBalances),
            queries: Vector::new(StorageKey::Queries),
            settlements: Vector::new(StorageKey::Settlements),
        }
    }

    /// Update the registered TEE enclave ed25519 public key (only contract owner).
    pub fn register_tee_pubkey(&mut self, tee_pubkey: String) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only owner can update the registered TEE public key"
        );
        let decoded = hex::decode(&tee_pubkey).expect("tee_pubkey must be valid hex");
        require!(
            decoded.len() == 32,
            "tee_pubkey must be 32 bytes (64 hex chars)"
        );
        self.tee_pubkey = tee_pubkey.to_lowercase();
    }

    /// Publish a sealed dataset listing.
    /// Spec signature:
    /// `list_dataset(dataset_hash, schema, views: Vec<{name, price_usdc}>, epsilon_budget, contributors: Vec<{account, rows}>) -> listing_id`
    pub fn list_dataset(
        &mut self,
        dataset_hash: String,
        schema: Vec<String>,
        views: Vec<ViewPrice>,
        epsilon_budget: f64,
        contributors: Vec<Contributor>,
        title: Option<String>,
        description: Option<String>,
        freshness_date: Option<String>,
        listing_id_override: Option<String>,
    ) -> String {
        require!(!dataset_hash.is_empty(), "dataset_hash cannot be empty");
        require!(!schema.is_empty(), "schema cannot be empty");
        require!(!views.is_empty(), "at least one priced view is required");
        require!(
            epsilon_budget >= 0.1 && epsilon_budget <= 20.0,
            "epsilon_budget must be between 0.1 and 20.0"
        );
        require!(
            !contributors.is_empty(),
            "at least one contributor is required"
        );

        let total_rows: u64 = contributors.iter().map(|c| c.rows).sum();
        require!(total_rows > 0, "total contributor rows must be > 0");

        // Initialize default weights proportional to contributed row counts until TEE Shapley appraisal runs
        let mut initial_weights_bps: Vec<u64> = Vec::with_capacity(contributors.len());
        let mut assigned_bps: u64 = 0;
        for (idx, c) in contributors.iter().enumerate() {
            if idx + 1 == contributors.len() {
                initial_weights_bps.push(10_000u64.saturating_sub(assigned_bps));
            } else {
                let w = ((c.rows as u128 * BPS_DENOMINATOR) / (total_rows as u128)) as u64;
                assigned_bps += w;
                initial_weights_bps.push(w);
            }
        }

        let listing_id = listing_id_override.unwrap_or_else(|| {
            let id = format!("ds_{}", self.next_listing_seq);
            self.next_listing_seq += 1;
            id
        });

        let listing_title = title.unwrap_or_else(|| format!("Sealed Dataset {}", listing_id));
        let listing_desc = description.unwrap_or_else(|| {
            format!(
                "TEE-sealed dataset ({} rows across {} contributors)",
                total_rows,
                contributors.len()
            )
        });
        let fresh_str = freshness_date.unwrap_or_else(|| "2026-10-30".to_string());

        let max_view_price = views
            .iter()
            .map(|v| v.price_usdc)
            .fold(0.0_f64, f64::max);

        let listing = Listing {
            id: listing_id.clone(),
            title: listing_title,
            description: listing_desc,
            seller_account: env::predecessor_account_id(),
            dataset_hash,
            schema,
            views,
            epsilon_budget,
            epsilon_spent: 0.0,
            contributors,
            shapley_weights_bps: initial_weights_bps,
            row_count: total_rows,
            freshness_date: fresh_str,
            latest_score: None,
            price_low: Some((max_view_price * 0.6).max(0.5)),
            price_high: Some(max_view_price.max(1.0)),
            latest_appraisal_id: None,
            created_at_ms: env::block_timestamp_ms(),
        };

        self.listings.insert(listing_id.clone(), listing);
        listing_id
    }

    /// Record an attested TEE appraisal onchain.
    /// Verifies `tee_sig` (ed25519 signature) over the SHA-256 hash of the canonical report string
    /// against the registered `tee_pubkey`.
    /// Spec signature:
    /// `record_appraisal(listing_id, task_hash, score, price_low, price_high, tee_pubkey, tee_sig, attestation_ref)`
    pub fn record_appraisal(
        &mut self,
        listing_id: String,
        task_hash: String,
        score: f64,
        price_low: f64,
        price_high: f64,
        tee_pubkey: String,
        tee_sig: String,
        attestation_ref: String,
        subscores: Option<SubScores>,
        shapley_weights_bps: Option<Vec<u64>>,
        explanation: Option<String>,
    ) -> String {
        require!(
            score >= 0.0 && score <= 1.0,
            "score must be within [0.0, 1.0]"
        );
        require!(
            price_low >= 0.0 && price_high >= price_low,
            "invalid price range"
        );
        require!(
            tee_pubkey.to_lowercase() == self.tee_pubkey,
            "tee_pubkey does not match registered enclave public key"
        );

        let pubkey_vec = hex::decode(&tee_pubkey).expect("tee_pubkey must be valid hex");
        let pubkey_bytes: [u8; 32] = pubkey_vec
            .try_into()
            .expect("tee_pubkey must be 32 bytes");

        let sig_vec = hex::decode(&tee_sig).expect("tee_sig must be valid hex");
        let sig_bytes: [u8; 64] = sig_vec
            .try_into()
            .expect("tee_sig must be 64 bytes");

        // Canonical report string signed by the TEE enclave:
        // "{listing_id}:{task_hash}:{score:.4}:{price_low:.2}:{price_high:.2}:{attestation_ref}"
        let canonical_payload = format!(
            "{}:{}:{:.4}:{:.2}:{:.2}:{}",
            listing_id, task_hash, score, price_low, price_high, attestation_ref
        );
        let report_hash = env::sha256(canonical_payload.as_bytes());

        // Verify ed25519 signature via NEAR host function
        // // VERIFY: https://docs.near.org/build/smart-contracts/security/cryptography
        let is_valid = env::ed25519_verify(&sig_bytes, &report_hash, &pubkey_bytes);
        require!(
            is_valid,
            "TEE ed25519 signature verification failed over canonical appraisal report hash"
        );

        let listing = self
            .listings
            .get_mut(&listing_id)
            .expect("Listing not found");

        let appraisal_id = format!("appr_{}", self.next_appraisal_seq);
        self.next_appraisal_seq += 1;

        let resolved_weights = if let Some(w) = shapley_weights_bps {
            require!(
                w.len() == listing.contributors.len(),
                "shapley_weights_bps length must match contributors count"
            );
            let sum_w: u64 = w.iter().sum();
            require!(
                sum_w == 10_000,
                "shapley_weights_bps must sum to 10000 basis points"
            );
            listing.shapley_weights_bps = w.clone();
            w
        } else {
            listing.shapley_weights_bps.clone()
        };

        let resolved_subscores = subscores.unwrap_or(SubScores {
            completeness: score,
            uniqueness: score,
            freshness: score,
            schema_fit: score,
            synthetic_score: 1.0 - (score * 0.1),
            utility_delta: (score * 0.25),
        });

        let resolved_explanation = explanation.unwrap_or_else(|| {
            format!(
                "Attested TEE score {:.2}: utility delta +{:.1}%, fair price {:.2}-{:.2} USDC.",
                score,
                resolved_subscores.utility_delta * 100.0,
                price_low,
                price_high
            )
        });

        listing.latest_score = Some(score);
        listing.price_low = Some(price_low);
        listing.price_high = Some(price_high);
        listing.latest_appraisal_id = Some(appraisal_id.clone());

        let appraisal = Appraisal {
            id: appraisal_id.clone(),
            listing_id,
            task_hash,
            score,
            price_low,
            price_high,
            tee_pubkey: tee_pubkey.to_lowercase(),
            tee_sig: tee_sig.to_lowercase(),
            attestation_ref,
            subscores: resolved_subscores,
            shapley_weights_bps: resolved_weights,
            explanation: resolved_explanation,
            created_at_ms: env::block_timestamp_ms(),
        };

        self.appraisals.insert(appraisal_id.clone(), appraisal);
        appraisal_id
    }

    /// Escrow payment and mint NEP-245 access token with `answers_left = answers`.
    /// Spec signature:
    /// `buy(listing_id, appraisal_id, answers)`
    #[payable]
    pub fn buy(
        &mut self,
        listing_id: String,
        appraisal_id: String,
        answers: u64,
        amount_usdc_override: Option<f64>,
    ) -> BuyReceipt {
        require!(answers > 0, "answers must be >= 1");
        let deposit = env::attached_deposit().as_yoctonear();
        require!(
            deposit > 0,
            "Must attach NEAR deposit into escrow to mint NEP-245 answer entitlement"
        );

        let listing = self
            .listings
            .get(&listing_id)
            .expect("Listing does not exist");

        let unit_price_usdc = if let Some(appr) = self.appraisals.get(&appraisal_id) {
            require!(
                appr.listing_id == listing_id,
                "Appraisal does not belong to this listing"
            );
            (appr.price_low + appr.price_high) / 2.0
        } else {
            listing.price_high.unwrap_or(4.0)
        };

        let amount_usdc = amount_usdc_override.unwrap_or(unit_price_usdc * (answers as f64));

        let escrow_id = format!("esc_{}", self.next_escrow_seq);
        self.next_escrow_seq += 1;

        let token_id = format!("nep245:{}:{}", listing_id, escrow_id);
        let buyer = env::predecessor_account_id();
        let now_ms = env::block_timestamp_ms();

        let escrow = Escrow {
            id: escrow_id.clone(),
            listing_id: listing_id.clone(),
            appraisal_id,
            buyer: buyer.clone(),
            amount_yocto: deposit,
            amount_usdc,
            token_id: token_id.clone(),
            status: EscrowStatus::Funded,
            created_at_ms: now_ms,
        };
        self.escrows.insert(escrow_id.clone(), escrow);

        let mt_token = MtToken {
            token_id: token_id.clone(),
            owner_id: buyer.clone(),
            listing_id: listing_id.clone(),
            escrow_id: escrow_id.clone(),
            answers_total: answers,
            answers_left: answers,
            issued_at_ms: now_ms,
        };
        self.tokens.insert(token_id.clone(), mt_token);

        let balance_key = format!("{}:{}", buyer, token_id);
        self.token_balances.insert(balance_key, answers as u128);

        // Emit NEP-245 Multi-Token standard mint event
        // // VERIFY: https://nomicon.io/Standards/Tokens/MultiToken/Event
        let event_log = serde_json::json!({
            "standard": "nep245",
            "version": "1.0.0",
            "event": "mt_mint",
            "data": [{
                "owner_id": buyer,
                "token_ids": [token_id],
                "amounts": [answers.to_string()],
                "memo": format!("Escrow {} for listing {}", escrow_id, listing_id)
            }]
        });
        env::log_str(&format!("EVENT_JSON:{}", event_log));

        BuyReceipt {
            escrow_id,
            token_id,
            listing_id,
            buyer,
            answers_left: answers,
            amount_yocto: U128(deposit),
            amount_usdc,
        }
    }

    /// Metered query log: decrements `answers_left` on the NEP-245 token, increments `epsilon_spent`
    /// on the listing (enforcing the listing's differential privacy budget), and records the hash.
    /// Spec signature:
    /// `log_query(token_id, query_hash, epsilon_used, result_hash)`
    pub fn log_query(
        &mut self,
        token_id: String,
        query_hash: String,
        epsilon_used: f64,
        result_hash: String,
    ) -> QueryLog {
        require!(epsilon_used > 0.0, "epsilon_used must be > 0");
        require!(!query_hash.is_empty(), "query_hash cannot be empty");
        require!(!result_hash.is_empty(), "result_hash cannot be empty");

        let token = self
            .tokens
            .get_mut(&token_id)
            .expect("NEP-245 token_id not found");

        require!(
            token.answers_left > 0,
            "No answers remaining on this NEP-245 access token"
        );

        let listing_id = token.listing_id.clone();
        let owner_id = token.owner_id.clone();

        let listing = self
            .listings
            .get_mut(&listing_id)
            .expect("Listing not found for token");

        let new_epsilon_spent = listing.epsilon_spent + epsilon_used;
        require!(
            new_epsilon_spent <= listing.epsilon_budget + 1e-9,
            "Listing differential privacy epsilon budget exhausted"
        );

        listing.epsilon_spent = new_epsilon_spent;
        let epsilon_remaining = (listing.epsilon_budget - listing.epsilon_spent).max(0.0);

        token.answers_left -= 1;
        let answers_left = token.answers_left;

        let balance_key = format!("{}:{}", owner_id, token_id);
        self.token_balances
            .insert(balance_key, answers_left as u128);

        // Emit NEP-245 burn event for consumed answer unit
        let burn_log = serde_json::json!({
            "standard": "nep245",
            "version": "1.0.0",
            "event": "mt_burn",
            "data": [{
                "owner_id": owner_id,
                "token_ids": [token_id],
                "amounts": ["1"],
                "memo": format!("Query {} (epsilon={:.2})", query_hash, epsilon_used)
            }]
        });
        env::log_str(&format!("EVENT_JSON:{}", burn_log));

        let query_id = format!("q_{}", self.queries.len() + 1);
        let record = QueryLog {
            id: query_id,
            token_id,
            listing_id,
            caller: env::predecessor_account_id(),
            query_hash,
            epsilon_used,
            epsilon_remaining,
            answers_left,
            result_hash,
            timestamp_ms: env::block_timestamp_ms(),
        };

        self.queries.push(record.clone());
        record
    }

    /// Settle an escrow based on delivered quality vs appraised range:
    /// - If `delivered_within_range == true`: deducts 5% platform fee and splits the 95% remainder
    ///   across contributor accounts by Shapley weights via real `Promise` transfers.
    /// - If `delivered_within_range == false`: refunds 100% of escrowed funds back to buyer via `Promise`.
    /// Spec signature:
    /// `settle(listing_id, escrow_id, delivered_within_range: bool)`
    pub fn settle(
        &mut self,
        listing_id: String,
        escrow_id: String,
        delivered_within_range: bool,
    ) -> Settlement {
        let listing = self
            .listings
            .get(&listing_id)
            .expect("Listing not found")
            .clone();

        let escrow = self
            .escrows
            .get_mut(&escrow_id)
            .expect("Escrow not found");

        require!(
            escrow.listing_id == listing_id,
            "Escrow does not match listing_id"
        );
        require!(
            escrow.status == EscrowStatus::Funded,
            "Escrow is already settled"
        );

        let total_yocto = escrow.amount_yocto;
        let total_usdc = escrow.amount_usdc;
        let buyer = escrow.buyer.clone();
        let settlement_id = format!("stl_{}", self.settlements.len() + 1);
        let now_ms = env::block_timestamp_ms();

        if delivered_within_range {
            escrow.status = EscrowStatus::Released;

            let fee_yocto = (total_yocto * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
            let distributable_yocto = total_yocto.saturating_sub(fee_yocto);
            let fee_usdc = total_usdc * 0.05;
            let distributable_usdc = total_usdc - fee_usdc;

            if fee_yocto > 0 {
                let _ = Promise::new(self.owner_id.clone())
                    .transfer(NearToken::from_yoctonear(fee_yocto));
            }

            let mut payouts: Vec<ContributorPayout> =
                Vec::with_capacity(listing.contributors.len());
            let mut distributed_yocto: u128 = 0;

            for (idx, contributor) in listing.contributors.iter().enumerate() {
                let weight_bps = *listing
                    .shapley_weights_bps
                    .get(idx)
                    .unwrap_or(&0u64);

                let share_yocto = if idx + 1 == listing.contributors.len() {
                    distributable_yocto.saturating_sub(distributed_yocto)
                } else {
                    let s = (distributable_yocto * (weight_bps as u128)) / BPS_DENOMINATOR;
                    distributed_yocto += s;
                    s
                };

                let share_usdc =
                    distributable_usdc * (weight_bps as f64) / (BPS_DENOMINATOR as f64);

                if share_yocto > 0 {
                    let _ = Promise::new(contributor.account.clone())
                        .transfer(NearToken::from_yoctonear(share_yocto));
                }

                payouts.push(ContributorPayout {
                    account: contributor.account.clone(),
                    weight_bps,
                    amount_yocto: U128(share_yocto),
                    amount_usdc: (share_usdc * 10000.0).round() / 10000.0,
                });
            }

            let settlement = Settlement {
                id: settlement_id,
                listing_id,
                escrow_id,
                buyer,
                delivered_within_range: true,
                outcome: "RELEASED".to_string(),
                total_amount_usdc: total_usdc,
                platform_fee_usdc: (fee_usdc * 10000.0).round() / 10000.0,
                payouts,
                timestamp_ms: now_ms,
            };

            self.settlements.push(settlement.clone());
            settlement
        } else {
            escrow.status = EscrowStatus::Refunded;

            if total_yocto > 0 {
                let _ = Promise::new(buyer.clone())
                    .transfer(NearToken::from_yoctonear(total_yocto));
            }

            let refund_payout = ContributorPayout {
                account: buyer.clone(),
                weight_bps: 10_000,
                amount_yocto: U128(total_yocto),
                amount_usdc: total_usdc,
            };

            let settlement = Settlement {
                id: settlement_id,
                listing_id,
                escrow_id,
                buyer,
                delivered_within_range: false,
                outcome: "REFUNDED".to_string(),
                total_amount_usdc: total_usdc,
                platform_fee_usdc: 0.0,
                payouts: vec![refund_payout],
                timestamp_ms: now_ms,
            };

            self.settlements.push(settlement.clone());
            settlement
        }
    }

    // ========================================================================
    // NEP-245 MULTI-TOKEN CORE INTERFACE
    // // VERIFY: https://nomicon.io/Standards/Tokens/MultiToken/Core
    // ========================================================================

    pub fn mt_token(&self, token_ids: Vec<String>) -> Vec<Option<MtToken>> {
        token_ids
            .into_iter()
            .map(|id| self.tokens.get(&id).cloned())
            .collect()
    }

    pub fn mt_balance_of(&self, account_id: AccountId, token_id: String) -> U128 {
        let key = format!("{}:{}", account_id, token_id);
        U128(*self.token_balances.get(&key).unwrap_or(&0))
    }

    pub fn mt_batch_balance_of(
        &self,
        account_id: AccountId,
        token_ids: Vec<String>,
    ) -> Vec<U128> {
        token_ids
            .into_iter()
            .map(|tid| self.mt_balance_of(account_id.clone(), tid))
            .collect()
    }

    pub fn mt_supply(&self, token_id: String) -> Option<U128> {
        self.tokens
            .get(&token_id)
            .map(|t| U128(t.answers_left as u128))
    }

    pub fn mt_tokens_for_owner(&self, account_id: AccountId) -> Vec<MtToken> {
        self.tokens
            .values()
            .filter(|t| t.owner_id == account_id)
            .cloned()
            .collect()
    }

    #[payable]
    pub fn mt_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
        #[allow(unused_variables)] approval: Option<(AccountId, u64)>,
        memo: Option<String>,
    ) {
        require!(
            env::attached_deposit() == NearToken::from_yoctonear(1),
            "Requires attached deposit of exactly 1 yoctoNEAR"
        );
        let sender_id = env::predecessor_account_id();
        require!(sender_id != receiver_id, "Sender and receiver must differ");

        let sender_key = format!("{}:{}", sender_id, token_id);
        let sender_bal = *self.token_balances.get(&sender_key).unwrap_or(&0);
        require!(
            sender_bal >= amount.0 && amount.0 > 0,
            "Insufficient NEP-245 token balance"
        );

        self.token_balances
            .insert(sender_key, sender_bal - amount.0);

        let receiver_key = format!("{}:{}", receiver_id, token_id);
        let receiver_bal = *self.token_balances.get(&receiver_key).unwrap_or(&0);
        self.token_balances
            .insert(receiver_key, receiver_bal + amount.0);

        if let Some(tok) = self.tokens.get_mut(&token_id) {
            if sender_bal == amount.0 {
                tok.owner_id = receiver_id.clone();
            }
        }

        let transfer_log = serde_json::json!({
            "standard": "nep245",
            "version": "1.0.0",
            "event": "mt_transfer",
            "data": [{
                "old_owner_id": sender_id,
                "new_owner_id": receiver_id,
                "token_ids": [token_id],
                "amounts": [amount.0.to_string()],
                "memo": memo
            }]
        });
        env::log_str(&format!("EVENT_JSON:{}", transfer_log));
    }

    // ========================================================================
    // VIEWS (REQUIRED BY SPEC)
    // ========================================================================

    pub fn get_listings(&self) -> Vec<Listing> {
        self.listings.values().cloned().collect()
    }

    pub fn get_listing(&self, listing_id: String) -> Option<Listing> {
        self.listings.get(&listing_id).cloned()
    }

    pub fn get_appraisals(&self, listing_id: Option<String>) -> Vec<Appraisal> {
        self.appraisals
            .values()
            .filter(|a| {
                if let Some(ref lid) = listing_id {
                    &a.listing_id == lid
                } else {
                    true
                }
            })
            .cloned()
            .collect()
    }

    pub fn get_queries(&self, listing_id: Option<String>) -> Vec<QueryLog> {
        self.queries
            .iter()
            .filter(|q| {
                if let Some(ref lid) = listing_id {
                    &q.listing_id == lid
                } else {
                    true
                }
            })
            .cloned()
            .collect()
    }

    pub fn get_settlements(&self, listing_id: Option<String>) -> Vec<Settlement> {
        self.settlements
            .iter()
            .filter(|s| {
                if let Some(ref lid) = listing_id {
                    &s.listing_id == lid
                } else {
                    true
                }
            })
            .cloned()
            .collect()
    }

    pub fn get_escrows(&self, buyer: Option<AccountId>) -> Vec<Escrow> {
        self.escrows
            .values()
            .filter(|e| {
                if let Some(ref b) = buyer {
                    &e.buyer == b
                } else {
                    true
                }
            })
            .cloned()
            .collect()
    }

    pub fn get_tee_pubkey(&self) -> String {
        self.tee_pubkey.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn test_signing_key() -> SigningKey {
        let secret_bytes: [u8; 32] = [
            0x42, 0x11, 0x99, 0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89, 0x10, 0x11, 0x12,
            0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26,
            0x27, 0x28, 0x29, 0x30,
        ];
        SigningKey::from_bytes(&secret_bytes)
    }

    fn setup_context(predecessor: &str, deposit_yocto: u128) {
        let context = VMContextBuilder::new()
            .predecessor_account_id(predecessor.parse().unwrap())
            .attached_deposit(NearToken::from_yoctonear(deposit_yocto))
            .block_timestamp(1_793_966_000_000_000_000)
            .build();
        testing_env!(context);
    }

    #[test]
    fn test_full_lifecycle_appraisal_buy_query_shapley_settle_and_refund() {
        let signing_key = test_signing_key();
        let tee_pubkey_hex = hex::encode(signing_key.verifying_key().to_bytes());

        setup_context("market.sealed.near", 0);
        let mut contract =
            SealedMarketContract::new("market.sealed.near".parse().unwrap(), tee_pubkey_hex.clone());

        // 1. Seller lists dataset
        setup_context("maya.sealed.near", 0);
        let listing_id = contract.list_dataset(
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".to_string(),
            vec![
                "date".to_string(),
                "is_weekend".to_string(),
                "temp_c".to_string(),
                "rentals_count".to_string(),
                "high_demand".to_string(),
            ],
            vec![
                ViewPrice {
                    name: "weekend_demand_agg".to_string(),
                    price_usdc: 4.0,
                },
                ViewPrice {
                    name: "holdout_roc_auc".to_string(),
                    price_usdc: 5.0,
                },
            ],
            3.0,
            vec![
                Contributor {
                    account: "maya.sealed.near".parse().unwrap(),
                    rows: 75,
                },
                Contributor {
                    account: "kofi.sealed.near".parse().unwrap(),
                    rows: 45,
                },
                Contributor {
                    account: "amina.sealed.near".parse().unwrap(),
                    rows: 30,
                },
            ],
            Some("Urban Bike Rentals & Weather (Oct 2026)".to_string()),
            Some("Hourly & daily bike demand across 3 stations".to_string()),
            Some("2026-10-30".to_string()),
            Some("ds_bike".to_string()),
        );
        assert_eq!(listing_id, "ds_bike");

        // 2. Record TEE-signed appraisal with real ed25519 signature verification
        let task_hash = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08".to_string();
        let score = 0.82_f64;
        let price_low = 3.0_f64;
        let price_high = 5.0_f64;
        let attestation_ref = "tdx_quote_8f2a9d1c".to_string();

        let canonical_payload = format!(
            "{}:{}:{:.4}:{:.2}:{:.2}:{}",
            listing_id, task_hash, score, price_low, price_high, attestation_ref
        );
        let report_hash = env::sha256(canonical_payload.as_bytes());
        let sig = signing_key.sign(&report_hash);
        let tee_sig_hex = hex::encode(sig.to_bytes());

        let appraisal_id = contract.record_appraisal(
            listing_id.clone(),
            task_hash,
            score,
            price_low,
            price_high,
            tee_pubkey_hex,
            tee_sig_hex,
            attestation_ref,
            Some(SubScores {
                completeness: 0.99,
                uniqueness: 0.97,
                freshness: 0.95,
                schema_fit: 1.0,
                synthetic_score: 0.92,
                utility_delta: 0.21,
            }),
            Some(vec![5000, 3000, 2000]), // 0.50 / 0.30 / 0.20 Shapley weights
            Some("Score 0.82: +21.0% holdout accuracy delta, 3.0% duplicate rate, fresh to 2026-10-30.".to_string()),
        );
        assert_eq!(appraisal_id, "appr_1");

        // 3. Buyer buys 2 answers via escrow -> mints NEP-245 access token
        let four_near = 4_000_000_000_000_000_000_000_000u128;
        setup_context("agent.buyer.near", four_near);
        let receipt = contract.buy(listing_id.clone(), appraisal_id.clone(), 2, Some(4.0));
        assert_eq!(receipt.answers_left, 2);
        assert_eq!(
            contract.mt_balance_of("agent.buyer.near".parse().unwrap(), receipt.token_id.clone()),
            U128(2)
        );

        // 4. Log query -> decrements NEP-245 balance and increments epsilon_spent
        let qlog = contract.log_query(
            receipt.token_id.clone(),
            "qhash_weekend_demand_1".to_string(),
            0.5,
            "rhash_noised_agg_1".to_string(),
        );
        assert_eq!(qlog.answers_left, 1);
        assert!((qlog.epsilon_remaining - 2.5).abs() < 1e-6);
        assert_eq!(
            contract.mt_balance_of("agent.buyer.near".parse().unwrap(), receipt.token_id.clone()),
            U128(1)
        );

        // 5. Settle within range -> 5% fee + 0.50 / 0.30 / 0.20 Shapley split
        let settlement = contract.settle(listing_id.clone(), receipt.escrow_id.clone(), true);
        assert_eq!(settlement.outcome, "RELEASED");
        assert!((settlement.platform_fee_usdc - 0.20).abs() < 1e-4);
        assert_eq!(settlement.payouts.len(), 3);
        assert!((settlement.payouts[0].amount_usdc - 1.90).abs() < 1e-4); // 50% of 3.80 USDC
        assert!((settlement.payouts[1].amount_usdc - 1.14).abs() < 1e-4); // 30% of 3.80 USDC
        assert!((settlement.payouts[2].amount_usdc - 0.76).abs() < 1e-4); // 20% of 3.80 USDC

        // 6. Test low-quality delivery triggering a full buyer refund
        setup_context("agent.buyer.near", four_near);
        let receipt_bad = contract.buy(listing_id.clone(), appraisal_id, 1, Some(3.0));
        let refund_settlement =
            contract.settle(listing_id, receipt_bad.escrow_id, false);
        assert_eq!(refund_settlement.outcome, "REFUNDED");
        assert_eq!(refund_settlement.platform_fee_usdc, 0.0);
        assert_eq!(
            refund_settlement.payouts[0].account,
            "agent.buyer.near".parse::<AccountId>().unwrap()
        );
        assert!((refund_settlement.payouts[0].amount_usdc - 3.0).abs() < 1e-4);
    }
}
