import type { AccessTokenRecord, AppraisalReport, AttestationData, SettlementRecord } from '../lib/api';
import type { OneClickQuoteResponse, SupportedSourceChain } from '../lib/intents';

export interface AttestationCheck {
  valid: boolean;
  nonceBound: boolean;
  pubKeyBound: boolean;
  signatureValid: boolean;
  reason?: string;
}

export interface VerifiedEnclave {
  attestation: AttestationData;
  check: AttestationCheck;
}

export interface AppraisalOutcome {
  report: AppraisalReport;
  signatureValid: boolean;
  reportHashHex: string;
}

export interface Purchase {
  token: AccessTokenRecord;
  escrowId: string;
  intentTxHash: string;
  amountUsdc: number;
  unitPriceUsdc: number;
  answers: number;
  sourceChain: SupportedSourceChain;
  quote: OneClickQuoteResponse;
}

export interface AnswerRecord {
  queryId: string;
  label: string;
  noisedValue: number;
  matchedRowsK: number;
  laplaceScale: number;
  sensitivity: number;
  epsilonUsed: number;
  epsilonRemaining: number;
  confidenceInterval95: [number, number];
  queryHash: string;
  resultHash: string;
  teeSig: string;
  answersLeft: number;
  deliveredWithinRange: boolean;
  timestampMs: number;
}

export type { SettlementRecord };

export const PERSONAS = ['maya.sealed.near', 'buyer.sealed.near', 'quant-agent.sealed.near'];
