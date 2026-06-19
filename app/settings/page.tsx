"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useT, useI18n } from "@/lib/i18n";

type InviteToken = { token: string; label: string; expires_at: string };

type Status = {
  gocardlessConfigured: boolean;
  aiConfigured: boolean;
  telegramConfigured: boolean;
  schedulerRunning: boolean;
  syncIntervalHours: number;
  importFolder: string;
};

type SavedKeys = {
  gocardlessSecretId: string;
  gocardlessSecretKey: string;
  anthropicApiKey: string;
  telegramBotToken: string;
  telegramChatId: string;
  syncIntervalHours: number;
  appPublicUrl: string;
  importFolder: string;
};

export default function SettingsPage() {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const [status, setStatus] = useState<Status | null>(null);
  const [savedKeys, setSavedKeys] = useState<SavedKeys | null>(null);
  const [message, setMessage] = useState("");

  const [gcId, setGcId] = useState("");
  const [gcKey, setGcKey] = useState("");
  const [gcSaving, setGcSaving] = useState(false);

  const [aiKey, setAiKey] = useState("");
  const [aiSaving, setAiSaving] = useState(false);

  const [tgToken, setTgToken] = useState("");
  const [tgChatId, setTgChatId] = useState("");
  const [syncHours, setSyncHours] = useState("");
  const [appUrl, setAppUrl] = useState("");
  const [tgSaving, setTgSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [importFolder, setImportFolder] = useState("");
  const [folderSaving, setFolderSaving] = useState(false);

  const [invites, setInvites] = useState<InviteToken[]>([]);
  const [inviteLabel, setInviteLabel] = useState("");
  const [inviteCreating, setInviteCreating] = useState(false);
  const [newInviteUrl, setNewInviteUrl] = useState("");

  const load = useCallback(async () => {
    const [statusRes, keysRes, invitesRes] = await Promise.all([
      fetch("/finance/api/status"),
      fetch("/finance/api/settings"),
      fetch("/finance/api/invite/create"),
    ]);
    setStatus(await statusRes.json());
    setSavedKeys(await keysRes.json());
    if (invitesRes.ok) setInvites(await invitesRes.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveGocardless() {
    setGcSaving(true);
    setMessage("");
    try {
      await fetch("/finance/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gocardlessSecretId: gcId, gocardlessSecretKey: gcKey }),
      });
      setGcId("");
      setGcKey("");
      await load();
      setMessage(
        t({
          fr: "Identifiants GoCardless enregistrés. Vous pouvez maintenant connecter vos banques dans Comptes.",
          en: "GoCardless credentials saved. You can now connect banks in Accounts.",
        })
      );
    } finally {
      setGcSaving(false);
    }
  }

  async function saveAnthropic() {
    setAiSaving(true);
    setMessage("");
    try {
      await fetch("/finance/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anthropicApiKey: aiKey }),
      });
      setAiKey("");
      await load();
      setMessage(t({ fr: "Clé API Anthropic enregistrée.", en: "Anthropic API key saved." }));
    } finally {
      setAiSaving(false);
    }
  }

  async function saveTelegram() {
    setTgSaving(true);
    setMessage("");
    try {
      const payload: Record<string, unknown> = {};
      if (tgToken.trim()) payload.telegramBotToken = tgToken.trim();
      if (tgChatId.trim()) payload.telegramChatId = tgChatId.trim();
      if (appUrl.trim()) payload.appPublicUrl = appUrl.trim();
      if (syncHours.trim()) payload.syncIntervalHours = Number(syncHours);
      await fetch("/finance/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setTgToken("");
      setTgChatId("");
      setAppUrl("");
      setSyncHours("");
      await load();
      setMessage(t({ fr: "Notifications enregistrées.", en: "Notification settings saved." }));
    } finally {
      setTgSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setMessage("");
    try {
      const res = await fetch("/finance/api/notify/test", { method: "POST" });
      const data = await res.json();
      setMessage(
        res.ok
          ? t({ fr: "Message test envoyé — vérifiez Telegram.", en: "Test message sent — check Telegram." })
          : data.error ?? t({ fr: "Échec du test", en: "Test failed" })
      );
    } finally {
      setTesting(false);
    }
  }

  async function saveFolder() {
    setFolderSaving(true);
    setMessage("");
    try {
      await fetch("/finance/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importFolder: importFolder.trim() }),
      });
      setImportFolder("");
      await load();
      setMessage(t({ fr: "Dossier d'import mis à jour.", en: "Import folder updated." }));
    } finally {
      setFolderSaving(false);
    }
  }

  async function createInvite() {
    setInviteCreating(true);
    setNewInviteUrl("");
    try {
      const res = await fetch("/finance/api/invite/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: inviteLabel.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewInviteUrl(data.url);
        setInviteLabel("");
        await load();
      }
    } finally {
      setInviteCreating(false);
    }
  }

  async function revokeInvite(token: string) {
    await fetch("/finance/api/invite/create", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    await load();
  }

  if (!status || !savedKeys)
    return <div className="text-slate-500">{t({ fr: "Chargement…", en: "Loading…" })}</div>;

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">{t({ fr: "Paramètres", en: "Settings" })}</h1>

      {/* Language */}
      <section className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-300">
          {t({ fr: "Langue", en: "Language" })}
        </h2>
        <div className="flex gap-2">
          {(["fr", "en"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLocale(l)}
              className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
                locale === l
                  ? "border-emerald-600 bg-emerald-600/15 text-emerald-300"
                  : "border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-200"
              }`}
            >
              {l === "fr" ? "🇫🇷 Français" : "🇬🇧 English"}
            </button>
          ))}
        </div>
      </section>

      {message && (
        <div className="card py-3 text-sm text-slate-300">
          {message}{" "}
          {(message.includes("Accounts") || message.includes("Comptes")) && (
            <Link href="/accounts" className="text-emerald-400 underline">
              {t({ fr: "Aller aux Comptes →", en: "Go to Accounts →" })}
            </Link>
          )}
        </div>
      )}

      {/* GoCardless */}
      <section className="card space-y-4">
        <div className="flex items-center gap-3">
          <span
            className={`badge ${status.gocardlessConfigured ? "bg-emerald-900/60 text-emerald-300" : "bg-rose-900/50 text-rose-300"}`}
          >
            {status.gocardlessConfigured
              ? t({ fr: "configuré", en: "configured" })
              : t({ fr: "manquant", en: "missing" })}
          </span>
          <h2 className="text-sm font-semibold text-slate-300">
            {t({
              fr: "Synchronisation bancaire — GoCardless Bank Account Data",
              en: "Bank sync — GoCardless Bank Account Data",
            })}
          </h2>
        </div>

        {!status.gocardlessConfigured && (
          <p className="text-xs text-slate-500">
            {t({ fr: "Créez un compte gratuit sur ", en: "Create a free account at " })}
            <span className="text-slate-400">bankaccountdata.gocardless.com</span>
            {t({
              fr: " → User secrets, puis collez les valeurs ci-dessous. Requis pour connecter vos banques dans ",
              en: " → User secrets, then paste the values below. Required to connect your banks in ",
            })}
            <Link href="/accounts" className="text-emerald-400 underline">
              {t({ fr: "Comptes", en: "Accounts" })}
            </Link>
            .
          </p>
        )}

        <div className="space-y-1">
          {savedKeys.gocardlessSecretId && (
            <p className="text-xs text-slate-500">
              {t({ fr: "Secret ID :", en: "Secret ID:" })}{" "}
              <code className="rounded bg-slate-800 px-1">{savedKeys.gocardlessSecretId}</code>
            </p>
          )}
          {savedKeys.gocardlessSecretKey && (
            <p className="text-xs text-slate-500">
              {t({ fr: "Secret Key :", en: "Secret Key:" })}{" "}
              <code className="rounded bg-slate-800 px-1">{savedKeys.gocardlessSecretKey}</code>
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input
            className="input"
            placeholder="Secret ID"
            value={gcId}
            onChange={(e) => setGcId(e.target.value)}
          />
          <input
            className="input"
            placeholder="Secret Key"
            type="password"
            value={gcKey}
            onChange={(e) => setGcKey(e.target.value)}
          />
        </div>
        <button
          className="btn-primary w-full"
          onClick={saveGocardless}
          disabled={gcSaving || (!gcId.trim() && !gcKey.trim())}
        >
          {gcSaving
            ? t({ fr: "Enregistrement…", en: "Saving…" })
            : status.gocardlessConfigured
              ? t({ fr: "Mettre à jour les identifiants", en: "Update credentials" })
              : t({ fr: "Enregistrer les identifiants", en: "Save credentials" })}
        </button>
      </section>

      {/* Anthropic */}
      <section className="card space-y-4">
        <div className="flex items-center gap-3">
          <span
            className={`badge ${status.aiConfigured ? "bg-emerald-900/60 text-emerald-300" : "bg-rose-900/50 text-rose-300"}`}
          >
            {status.aiConfigured
              ? t({ fr: "configuré", en: "configured" })
              : t({ fr: "manquant", en: "missing" })}
          </span>
          <h2 className="text-sm font-semibold text-slate-300">
            {t({ fr: "Catégorisation & analyses IA — Anthropic", en: "AI categorization & insights — Anthropic" })}
          </h2>
        </div>

        {!status.aiConfigured && (
          <p className="text-xs text-slate-500">
            {t({ fr: "Obtenez une clé sur ", en: "Get a key at " })}
            <span className="text-slate-400">console.anthropic.com/settings/keys</span>
            {t({
              fr: " et collez-la ci-dessous. Optionnel — la catégorisation par règles fonctionne sans.",
              en: " and paste it below. Optional — rules-based categorization still works without it.",
            })}
          </p>
        )}

        {savedKeys.anthropicApiKey && (
          <p className="text-xs text-slate-500">
            {t({ fr: "Clé API :", en: "API Key:" })}{" "}
            <code className="rounded bg-slate-800 px-1">{savedKeys.anthropicApiKey}</code>
          </p>
        )}

        <input
          className="input w-full"
          placeholder="sk-ant-api03-…"
          type="password"
          value={aiKey}
          onChange={(e) => setAiKey(e.target.value)}
        />
        <button
          className="btn-primary w-full"
          onClick={saveAnthropic}
          disabled={aiSaving || !aiKey.trim()}
        >
          {aiSaving
            ? t({ fr: "Enregistrement…", en: "Saving…" })
            : status.aiConfigured
              ? t({ fr: "Mettre à jour la clé API", en: "Update API key" })
              : t({ fr: "Enregistrer la clé API", en: "Save API key" })}
        </button>
      </section>

      {/* Notifications & auto-sync */}
      <section className="card space-y-4">
        <div className="flex items-center gap-3">
          <span
            className={`badge ${status.telegramConfigured ? "bg-emerald-900/60 text-emerald-300" : "bg-rose-900/50 text-rose-300"}`}
          >
            {status.telegramConfigured
              ? t({ fr: "configuré", en: "configured" })
              : t({ fr: "manquant", en: "missing" })}
          </span>
          <h2 className="text-sm font-semibold text-slate-300">
            {t({ fr: "Notifications & synchro auto — Telegram", en: "Notifications & auto-sync — Telegram" })}
          </h2>
          <span
            className={`badge ${status.schedulerRunning ? "bg-emerald-900/60 text-emerald-300" : "bg-slate-800 text-slate-400"}`}
            title={t({
              fr: "Synchro auto en arrière-plan + interrogation Telegram",
              en: "Background auto-sync + Telegram polling",
            })}
          >
            {t({ fr: "planificateur ", en: "scheduler " })}
            {status.schedulerRunning ? t({ fr: "actif", en: "running" }) : t({ fr: "inactif", en: "off" })}
          </span>
        </div>

        <p className="text-xs text-slate-500">
          {t({
            fr: "L'app synchronise vos banques automatiquement toutes les ",
            en: "The app syncs your banks automatically every ",
          })}
          <span className="text-slate-400">{status.syncIntervalHours}h</span>
          {t({
            fr: " et vous envoie ici chaque nouvelle transaction pour que vous puissiez confirmer ou changer sa catégorie — et envoyer un reçu — directement depuis la discussion. Créez un bot avec ",
            en: " and pushes each new transaction here so you can confirm or change its category — and upload a receipt — right from the chat. Create a bot with ",
          })}
          <span className="text-slate-400">@BotFather</span>
          {t({ fr: ", collez le jeton ci-dessous, puis envoyez ", en: ", paste the token below, then send " })}
          <code className="rounded bg-slate-800 px-1">/start</code>
          {t({
            fr: " à votre bot pour capturer automatiquement votre ID de discussion.",
            en: " to your bot to auto-capture your chat id.",
          })}
        </p>

        <div className="space-y-1 text-xs text-slate-500">
          {savedKeys.telegramBotToken && (
            <p>
              {t({ fr: "Jeton du bot :", en: "Bot token:" })}{" "}
              <code className="rounded bg-slate-800 px-1">{savedKeys.telegramBotToken}</code>
            </p>
          )}
          {savedKeys.telegramChatId && (
            <p>
              {t({ fr: "ID de discussion :", en: "Chat id:" })}{" "}
              <code className="rounded bg-slate-800 px-1">{savedKeys.telegramChatId}</code>
            </p>
          )}
        </div>

        <input
          className="input w-full"
          placeholder={t({ fr: "Jeton du bot (123456:ABC-DEF…)", en: "Bot token (123456:ABC-DEF…)" })}
          type="password"
          value={tgToken}
          onChange={(e) => setTgToken(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            className="input"
            placeholder={
              savedKeys.telegramChatId
                ? t({ fr: "ID de discussion (défini)", en: "Chat id (set)" })
                : t({ fr: "ID de discussion (ou utilisez /start)", en: "Chat id (or use /start)" })
            }
            value={tgChatId}
            onChange={(e) => setTgChatId(e.target.value)}
          />
          <input
            className="input"
            placeholder={t({
              fr: `Intervalle de synchro (heures) (actuel ${status.syncIntervalHours})`,
              en: `Sync interval hours (now ${status.syncIntervalHours})`,
            })}
            type="number"
            min={0.25}
            step={0.25}
            value={syncHours}
            onChange={(e) => setSyncHours(e.target.value)}
          />
        </div>
        <input
          className="input w-full"
          placeholder={
            savedKeys.appPublicUrl
              ? t({ fr: `URL publique (${savedKeys.appPublicUrl})`, en: `Public URL (${savedKeys.appPublicUrl})` })
              : t({
                  fr: "URL publique de l'app pour les liens de reçus (ex. https://nas.example.com/finance)",
                  en: "Public app URL for receipt links (e.g. https://nas.example.com/finance)",
                })
          }
          value={appUrl}
          onChange={(e) => setAppUrl(e.target.value)}
        />

        <div className="flex gap-2">
          <button
            className="btn-primary flex-1"
            onClick={saveTelegram}
            disabled={tgSaving || (!tgToken.trim() && !tgChatId.trim() && !syncHours.trim() && !appUrl.trim())}
          >
            {tgSaving
              ? t({ fr: "Enregistrement…", en: "Saving…" })
              : t({ fr: "Enregistrer les notifications", en: "Save notification settings" })}
          </button>
          <button
            className="btn-secondary shrink-0"
            onClick={sendTest}
            disabled={testing || !status.telegramConfigured}
          >
            {testing
              ? t({ fr: "Envoi…", en: "Sending…" })
              : t({ fr: "Envoyer un message test", en: "Send test message" })}
          </button>
        </div>
      </section>

      {/* Watched import folder */}
      <section className="card space-y-4">
        <div className="flex items-center gap-3">
          <span className="badge bg-emerald-900/60 text-emerald-300">{t({ fr: "auto", en: "auto" })}</span>
          <h2 className="text-sm font-semibold text-slate-300">
            {t({ fr: "Dossier d'import automatique", en: "Auto-import folder" })}
          </h2>
        </div>
        <p className="text-xs text-slate-500">
          {t({
            fr: "Déposez les exports de relevés CSV ou PDF de votre banque dans ce dossier (synchronisez-le depuis votre téléphone/PC avec Nextcloud, Syncthing, un partage réseau, etc.). Toutes les ~30 s, l'app importe les nouveaux fichiers, les catégorise et vous notifie sur Telegram — sans tiers, sans mot de passe bancaire. Les fichiers traités sont déplacés vers ",
            en: "Drop your bank's CSV or PDF statement exports into this folder (sync it from your phone/PC with Nextcloud, Syncthing, a network share, etc.). Every ~30s the app imports new files, categorizes them, and notifies you on Telegram — no third party, no bank password. Processed files are moved to ",
          })}
          <code className="rounded bg-slate-800 px-1">processed/</code>
          {t({ fr: ", les illisibles vers ", en: ", unreadable ones to " })}
          <code className="rounded bg-slate-800 px-1">failed/</code>.
        </p>
        <p className="text-xs text-slate-500">
          {t({ fr: "Dossier actuel :", en: "Current folder:" })}{" "}
          <code className="rounded bg-slate-800 px-1 break-all">{status.importFolder}</code>
        </p>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder={t({
              fr: "Changer le chemin du dossier (absolu, ex. /volume1/finance-inbox)",
              en: "Change folder path (absolute, e.g. /volume1/finance-inbox)",
            })}
            value={importFolder}
            onChange={(e) => setImportFolder(e.target.value)}
          />
          <button
            className="btn-primary shrink-0"
            onClick={saveFolder}
            disabled={folderSaving || !importFolder.trim()}
          >
            {folderSaving
              ? t({ fr: "Enregistrement…", en: "Saving…" })
              : t({ fr: "Enregistrer le dossier", en: "Save folder" })}
          </button>
        </div>
      </section>

      {/* Invite links */}
      <section className="card space-y-4">
        <h2 className="text-sm font-semibold text-slate-300">
          {t({ fr: "Liens d'invitation", en: "Invite links" })}
        </h2>
        <p className="text-xs text-slate-500">
          {t({
            fr: "Partagez un lien avec un ami ou un proche. Il connecte sa propre banque et obtient un aperçu financier en direct — rien n'est enregistré dans votre base de données.",
            en: "Share a link with a friend or partner. They connect their own bank and get a live financial snapshot — nothing is saved to your database.",
          })}
        </p>

        {newInviteUrl && (
          <div className="space-y-1 rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-3">
            <p className="text-xs text-emerald-300">
              {t({ fr: "Lien d'invitation créé — partagez cette URL :", en: "Invite link created — share this URL:" })}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded bg-slate-900 px-2 py-1 text-xs text-slate-300">
                {newInviteUrl}
              </code>
              <button
                className="btn-secondary shrink-0 text-xs"
                onClick={() => navigator.clipboard.writeText(newInviteUrl)}
              >
                {t({ fr: "Copier", en: "Copy" })}
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder={t({ fr: 'Libellé (optionnel, ex. "Sarah")', en: 'Label (optional, e.g. "Sarah")' })}
            value={inviteLabel}
            onChange={(e) => setInviteLabel(e.target.value)}
          />
          <button className="btn-primary shrink-0" onClick={createInvite} disabled={inviteCreating}>
            {inviteCreating ? t({ fr: "Création…", en: "Creating…" }) : t({ fr: "Créer une invitation", en: "Create invite" })}
          </button>
        </div>

        {invites.length > 0 && (
          <ul className="space-y-2">
            {invites.map((inv) => (
              <li
                key={inv.token}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-2.5 text-sm"
              >
                <div>
                  <div className="font-medium text-slate-200">
                    {inv.label || t({ fr: "Invitation sans nom", en: "Unnamed invite" })}
                  </div>
                  <div className="text-xs text-slate-500">
                    {t({ fr: "Expire le", en: "Expires" })} {new Date(inv.expires_at).toLocaleDateString("fr-FR")} ·{" "}
                    <button
                      className="text-slate-400 underline hover:text-slate-200"
                      onClick={() =>
                        navigator.clipboard.writeText(`${window.location.origin}/finance/invite/${inv.token}`)
                      }
                    >
                      {t({ fr: "Copier le lien", en: "Copy link" })}
                    </button>
                  </div>
                </div>
                <button
                  className="text-xs text-rose-500 hover:text-rose-400"
                  onClick={() => revokeInvite(inv.token)}
                >
                  {t({ fr: "Révoquer", en: "Revoke" })}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-slate-600">
        {t({
          fr: "Toutes les données restent sur votre machine (data/finance.db). Les clés sont stockées dans la base de données locale.",
          en: "All data stays on your machine (data/finance.db). Keys are stored in the local database.",
        })}
      </p>
    </div>
  );
}
