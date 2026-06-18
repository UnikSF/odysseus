// GoCardless Bank Account Data API client (https://bankaccountdata.gocardless.com)
import { getSetting } from "./db";

const BASE = "https://bankaccountdata.gocardless.com/api/v2";

function getSecretId(): string {
  return process.env.GOCARDLESS_SECRET_ID || getSetting("gocardless_secret_id") || "";
}
function getSecretKey(): string {
  return process.env.GOCARDLESS_SECRET_KEY || getSetting("gocardless_secret_key") || "";
}

export function gocardlessConfigured(): boolean {
  return Boolean(getSecretId() && getSecretKey());
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }
  const res = await fetch(`${BASE}/token/new/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      secret_id: getSecretId(),
      secret_key: getSecretKey(),
    }),
  });
  if (!res.ok) {
    throw new Error(`GoCardless auth failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  cachedToken = { token: data.access, expiresAt: Date.now() + data.access_expires * 1000 };
  return data.access;
}

async function gc<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GoCardless ${path} failed (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export type Institution = {
  id: string;
  name: string;
  bic: string;
  logo: string;
  countries: string[];
};

export function listInstitutions(country = "fr"): Promise<Institution[]> {
  return gc<Institution[]>(`/institutions/?country=${encodeURIComponent(country)}`);
}

export type Requisition = {
  id: string;
  status: string;
  link: string;
  institution_id: string;
  accounts: string[];
};

export function createRequisition(institutionId: string, redirect: string): Promise<Requisition> {
  return gc<Requisition>("/requisitions/", {
    method: "POST",
    body: JSON.stringify({ institution_id: institutionId, redirect }),
  });
}

export function getRequisition(id: string): Promise<Requisition> {
  return gc<Requisition>(`/requisitions/${id}/`);
}

export type AccountDetails = {
  account: {
    iban?: string;
    name?: string;
    ownerName?: string;
    currency?: string;
    product?: string;
  };
};

export function getAccountDetails(accountId: string): Promise<AccountDetails> {
  return gc<AccountDetails>(`/accounts/${accountId}/details/`);
}

export type GCTransaction = {
  transactionId?: string;
  internalTransactionId?: string;
  bookingDate?: string;
  valueDate?: string;
  transactionAmount: { amount: string; currency: string };
  creditorName?: string;
  debtorName?: string;
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
};

export function getAccountTransactions(
  accountId: string
): Promise<{ transactions: { booked: GCTransaction[]; pending: GCTransaction[] } }> {
  return gc(`/accounts/${accountId}/transactions/`);
}
