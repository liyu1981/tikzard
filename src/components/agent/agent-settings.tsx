"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  clearApiKey,
  getLocalBaseUrl,
  getModels,
  hasCredential,
  isVerified,
  LOCAL_PROVIDER_ID,
  refreshModels,
  saveApiKey,
  setLocalBaseUrl,
  testConnection,
} from "@/lib/agent/models";
import { CheckIcon, KeyIcon, LoaderIcon, RefreshIcon, XIcon } from "./icons";

interface ProviderStatus {
  ok: boolean;
  message: string;
}

export function AgentSettings() {
  const { t } = useTranslation();
  const providers = getModels()
    .getProviders()
    .map((p) => ({ id: p.id, name: p.name }));

  const [keys, setKeys] = useState<Record<string, string>>({});
  const [configured, setConfigured] = useState<Record<string, boolean>>({});
  const [verified, setVerified] = useState<Record<string, boolean>>({});
  const [localUrl, setLocalUrl] = useState(getLocalBaseUrl());
  const [refreshing, setRefreshing] = useState(false);
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<Record<string, ProviderStatus>>({});

  // biome-ignore lint/correctness/useExhaustiveDependencies: provider registry is a lazy singleton and never changes identity
  useEffect(() => {
    const saved: Record<string, boolean> = {};
    const proven: Record<string, boolean> = {};
    for (const provider of providers) {
      saved[provider.id] = hasCredential(provider.id);
      proven[provider.id] = isVerified(provider.id);
    }
    setConfigured(saved);
    setVerified(proven);
  }, []);

  async function handleSaveKey(providerId: string) {
    const key = (keys[providerId] ?? "").trim();
    if (key === "") {
      return;
    }
    await saveApiKey(providerId, key);
    setConfigured((prev) => ({ ...prev, [providerId]: true }));
    setStatus((prev) => ({
      ...prev,
      [providerId]: { ok: true, message: t("agent.keySaved") },
    }));
  }

  async function handleClearKey(providerId: string) {
    await clearApiKey(providerId);
    setConfigured((prev) => ({ ...prev, [providerId]: false }));
    setStatus((prev) => ({
      ...prev,
      [providerId]: { ok: true, message: t("agent.keyCleared") },
    }));
  }

  async function handleTest(providerId: string) {
    setTesting((prev) => ({ ...prev, [providerId]: true }));
    setStatus((prev) => ({
      ...prev,
      [providerId]: { ok: true, message: t("agent.testing") },
    }));
    try {
      const modelId = await testConnection(providerId);
      setVerified((prev) => ({ ...prev, [providerId]: true }));
      setStatus((prev) => ({
        ...prev,
        [providerId]: {
          ok: true,
          message: t("agent.connected", { model: modelId }),
        },
      }));
    } catch (err) {
      const code = err instanceof Error ? err.message : String(err);
      const message =
        code === "not_configured"
          ? t("agent.testNotConfigured")
          : code === "no_model"
            ? t("agent.testNoModel")
            : t("agent.testFailed", {
                detail: code.startsWith("request_failed") ? "" : code,
              });
      setStatus((prev) => ({ ...prev, [providerId]: { ok: false, message } }));
    } finally {
      setTesting((prev) => ({ ...prev, [providerId]: false }));
    }
  }

  const handleSaveLocalUrl = useCallback(() => {
    setLocalBaseUrl(localUrl);
    setVerified((prev) => ({ ...prev, [LOCAL_PROVIDER_ID]: false }));
    setStatus((prev) => ({
      ...prev,
      [LOCAL_PROVIDER_ID]: { ok: true, message: t("agent.localUrlSaved") },
    }));
  }, [localUrl, t]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshModels();
      setStatus((prev) => ({
        ...prev,
        global: { ok: true, message: t("agent.modelsRefreshed") },
      }));
    } finally {
      setRefreshing(false);
    }
  }, [t]);

  return (
    <div className="space-y-4">
      {providers.map((provider) => (
        <div key={provider.id} className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
            <KeyIcon className="size-3.5 text-muted-foreground" />
            {provider.id === LOCAL_PROVIDER_ID
              ? t("agent.customLocalLlm")
              : provider.name}
            {configured[provider.id] && (
              <span className="rounded-full border border-border/50 px-1.5 py-px text-[0.65rem] text-muted-foreground">
                {t("agent.keySet")}
              </span>
            )}
            {verified[provider.id] && (
              <span className="inline-flex items-center gap-0.5 rounded-full border border-border/50 px-1.5 py-px text-[0.65rem] text-muted-foreground">
                <CheckIcon className="size-3" />
                {t("agent.verified")}
              </span>
            )}
          </div>

          {provider.id === LOCAL_PROVIDER_ID && (
            <div className="space-y-1.5">
              <div className="flex gap-1.5">
                <input
                  value={localUrl}
                  onChange={(event) => setLocalUrl(event.target.value)}
                  placeholder="http://localhost:11434"
                  className="h-8 min-w-0 flex-1 rounded-lg border border-border/50 bg-background/40 px-2.5 text-sm outline-none focus-visible:border-ring"
                />
                <button
                  type="button"
                  onClick={handleSaveLocalUrl}
                  className="glass-control rounded-lg px-3 py-1.5 text-xs font-medium transition duration-150 hover:-translate-y-px hover:brightness-[1.06] active:scale-[0.98]"
                >
                  {t("agent.save")}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("agent.localBaseUrlHint")}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            <input
              type="password"
              value={keys[provider.id] ?? ""}
              onChange={(event) =>
                setKeys((prev) => ({
                  ...prev,
                  [provider.id]: event.target.value,
                }))
              }
              placeholder={
                provider.id === LOCAL_PROVIDER_ID
                  ? t("agent.localKeyPlaceholder")
                  : t("agent.apiKeyPlaceholder")
              }
              className="h-8 min-w-32 flex-1 rounded-lg border border-border/50 bg-background/40 px-2.5 text-sm outline-none focus-visible:border-ring"
            />
            <button
              type="button"
              onClick={() => void handleSaveKey(provider.id)}
              disabled={(keys[provider.id] ?? "").trim() === ""}
              className="glass-control rounded-lg px-3 py-1.5 text-xs font-medium transition duration-150 hover:-translate-y-px hover:brightness-[1.06] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("agent.saveKey")}
            </button>
            {provider.id !== LOCAL_PROVIDER_ID && (
              <button
                type="button"
                onClick={() => void handleClearKey(provider.id)}
                disabled={!configured[provider.id]}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition duration-150 hover:bg-foreground/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("agent.clearKey")}
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleTest(provider.id)}
              disabled={testing[provider.id]}
              className="glass-control inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition duration-150 hover:-translate-y-px hover:brightness-[1.06] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {testing[provider.id] ? (
                <LoaderIcon className="size-3.5 animate-spin" />
              ) : (
                <CheckIcon className="size-3.5" />
              )}
              {t("agent.testConnection")}
            </button>
          </div>

          {status[provider.id] !== undefined && (
            <p
              className={
                status[provider.id].ok
                  ? "text-xs text-muted-foreground"
                  : "flex items-start gap-1 text-xs text-red-500"
              }
            >
              {status[provider.id].ok ? (
                <span className="inline-flex items-center gap-1">
                  <CheckIcon className="size-3 shrink-0" />
                  {status[provider.id].message}
                </span>
              ) : (
                <>
                  <XIcon className="mt-0.5 size-3 shrink-0" />
                  {status[provider.id].message}
                </>
              )}
            </p>
          )}
        </div>
      ))}

      <div className="flex items-center justify-between border-t border-border/40 pt-4">
        <span className="text-xs font-medium">{t("agent.refreshModels")}</span>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className="glass-control inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition duration-150 hover:-translate-y-px hover:brightness-[1.06] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {refreshing ? (
            <LoaderIcon className="size-3.5 animate-spin" />
          ) : (
            <RefreshIcon className="size-3.5" />
          )}
          {t("agent.refresh")}
        </button>
      </div>
      {status.global !== undefined && (
        <p className="-mt-2 text-xs text-muted-foreground">
          {status.global.message}
        </p>
      )}
    </div>
  );
}
